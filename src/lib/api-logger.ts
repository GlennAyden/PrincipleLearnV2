import { NextRequest } from 'next/server';
import { createHash } from 'crypto';
import { adminDb } from '@/lib/database';

interface ApiLogContext {
  label?: string;
  metadata?: Record<string, unknown>;
  awaitLog?: boolean;
}

interface ApiLogPayload extends ApiLogContext {
  request: NextRequest;
  status: number;
  durationMs: number;
  errorMessage?: string | null;
}

function extractIpAddress(req: NextRequest) {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    null
  );
}

function extractUserAgent(req: NextRequest) {
  return req.headers.get('user-agent') ?? null;
}

/**
 * Hash an email so analytics can group by user without storing raw PII.
 * Prefixed with `h_` so the column value is obviously a hash, not a real
 * address. Uses SHA-256 truncated to 16 hex chars (64 bits) — enough entropy
 * for grouping, small enough to keep the log row lean.
 */
function hashEmail(email: string | null): string | null {
  if (!email) return null;
  const digest = createHash('sha256').update(email.toLowerCase()).digest('hex');
  return `h_${digest.slice(0, 16)}`;
}

function extractUserIdentity(req: NextRequest) {
  return {
    userId: req.headers.get('x-user-id') ?? null,
    userEmail: req.headers.get('x-user-email') ?? null,
    userRole: req.headers.get('x-user-role') ?? null,
  };
}

export async function logApiCall({
  request,
  status,
  durationMs,
  errorMessage,
  label,
  metadata,
}: ApiLogPayload) {
  try {
    const url = request.nextUrl;
    const identity = extractUserIdentity(request);
    // PII policy: we keep user_id (UUID, already a non-reversible surrogate)
    // and user_role for analytics, but the raw email is replaced with a
    // prefixed SHA-256 hash so logs can still be grouped/correlated per-user
    // without storing plaintext email addresses. See
    // docs/sql/fix_api_logs_schema.sql for the target column layout.
    await adminDb.from('api_logs').insert({
      method: request.method,
      path: url.pathname,
      query: url.search || null,
      status_code: status,
      duration_ms: Math.round(durationMs),
      ip_address: extractIpAddress(request),
      user_agent: extractUserAgent(request),
      user_id: identity.userId,
      user_email_hash: hashEmail(identity.userEmail),
      user_role: identity.userRole,
      label: label ?? null,
      metadata: metadata ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (error) {
    console.error('[ApiLogger] Failed to store log', error);
  }
}

function normalizeLoggedErrorMessage(raw: string | null | undefined) {
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length ? trimmed : null;
}

async function extractErrorMessageFromResponse(response: Response) {
  const headerError = normalizeLoggedErrorMessage(
    response.headers.get('x-log-error-message')
  );
  if (headerError) {
    return headerError;
  }

  if (response.status < 400) {
    return null;
  }

  try {
    const cloned = response.clone();
    const contentType = cloned.headers.get('content-type') ?? '';

    if (contentType.includes('application/json')) {
      const body = (await cloned.json()) as { error?: unknown; message?: unknown };
      if (typeof body?.error === 'string') return normalizeLoggedErrorMessage(body.error);
      if (typeof body?.message === 'string') return normalizeLoggedErrorMessage(body.message);
      return null;
    }

    const text = await cloned.text();
    return normalizeLoggedErrorMessage(text);
  } catch {
    return null;
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- generic handler signature requires any[] for parameter spread
export function withApiLogging<T extends (...args: any[]) => Promise<Response>>(
  handler: T,
  context: ApiLogContext = {}
) {
  return (async (...args: Parameters<T>) => {
    const request = args[0] as NextRequest;
    const startedAt = Date.now();
    try {
      const response = await handler(...args);
      const duration = Date.now() - startedAt;
      const errorMessage = context.awaitLog === false
        ? normalizeLoggedErrorMessage(response.headers.get('x-log-error-message'))
        : await extractErrorMessageFromResponse(response);
      if (response.headers.has('x-log-error-message')) {
        response.headers.delete('x-log-error-message');
      }
      const logTask = logApiCall({
        request,
        status: response.status,
        durationMs: duration,
        errorMessage,
        label: context.label,
        metadata: context.metadata,
      });
      if (context.awaitLog === false) {
        void logTask;
      } else {
        await logTask;
      }
      return response;
    } catch (error: unknown) {
      const duration = Date.now() - startedAt;
      const errObj = error as Record<string, unknown> | undefined;
      const logTask = logApiCall({
        request,
        status: (errObj?.status as number) ?? 500,
        durationMs: duration,
        errorMessage:
          (errObj?.message as string) ?? (typeof error === 'string' ? error : 'Unhandled error'),
        label: context.label,
        metadata: context.metadata,
      });
      if (context.awaitLog === false) {
        void logTask;
      } else {
        await logTask;
      }
      throw error;
    }
  }) as T;
}
