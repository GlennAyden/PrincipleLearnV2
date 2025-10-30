import { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';

interface ApiLogContext {
  label?: string;
  metadata?: Record<string, any>;
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
    await adminDb.from('api_logs').insert({
      method: request.method,
      path: url.pathname,
      query: url.search || null,
      status_code: status,
      duration_ms: Math.round(durationMs),
      ip_address: extractIpAddress(request),
      user_agent: extractUserAgent(request),
      user_id: identity.userId,
      user_email: identity.userEmail,
      user_role: identity.userRole,
      label: label ?? null,
      metadata: metadata ?? null,
      error_message: errorMessage ?? null,
    });
  } catch (error) {
    console.error('[ApiLogger] Failed to store log', error);
  }
}

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
      await logApiCall({
        request,
        status: response.status,
        durationMs: duration,
        label: context.label,
        metadata: context.metadata,
      });
      return response;
    } catch (error: any) {
      const duration = Date.now() - startedAt;
      await logApiCall({
        request,
        status: error?.status ?? 500,
        durationMs: duration,
        errorMessage:
          error?.message ?? (typeof error === 'string' ? error : 'Unhandled error'),
        label: context.label,
        metadata: context.metadata,
      });
      throw error;
    }
  }) as T;
}
