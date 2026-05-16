import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

export type AdminMode = 'general' | 'research';

export const ADMIN_MODE_VALUES = ['general', 'research'] as const;
export const ADMIN_MODE_COOKIE = 'admin_mode';
export const ADMIN_MODE_HEADER = 'x-admin-mode';

export function isAdminMode(value: unknown): value is AdminMode {
  return value === 'general' || value === 'research';
}

export function coerceAdminMode(value: unknown, fallback: AdminMode = 'general'): AdminMode {
  return isAdminMode(value) ? value : fallback;
}

/**
 * Read the admin mode for a request — header first (set by middleware), then
 * cookie fallback (for edge cases where middleware did not run, e.g. cached
 * responses or server actions; mirrors the pattern documented in middleware.ts).
 * Defaults to `'general'` so unauthenticated/legacy admin sessions behave like
 * pre-MVR.
 */
export function getAdminModeFromRequest(request: NextRequest | Request): AdminMode {
  const headerValue = request.headers.get(ADMIN_MODE_HEADER);
  if (isAdminMode(headerValue)) return headerValue;

  // NextRequest exposes .cookies; plain Request doesn't.
  const nextRequest = request as NextRequest;
  if (typeof nextRequest.cookies?.get === 'function') {
    const cookieValue = nextRequest.cookies.get(ADMIN_MODE_COOKIE)?.value;
    if (isAdminMode(cookieValue)) return cookieValue;
  }

  return 'general';
}

/**
 * Apply the admin mode filter to a Supabase-style query builder. In Mode
 * Penelitian we restrict to rows tagged `mode='research'`; in Mode Umum we
 * pass through unchanged so the admin still sees all data. The optional
 * column override lets callers target a different column name (e.g. when
 * filtering via a JOIN, pass `'courses.mode'`).
 *
 * Returns the (possibly modified) builder so calls can be chained.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyAdminModeFilter<TQuery extends { eq: (col: string, val: any) => TQuery }>(
  query: TQuery,
  mode: AdminMode,
  column: string = 'mode',
): TQuery {
  if (mode === 'research') {
    return query.eq(column, 'research');
  }
  return query;
}

/**
 * Throw a 403 NextResponse if the admin is not currently in research mode.
 * Used by research-only endpoints (e.g. /api/admin/sumber/*, /api/admin/research/*)
 * to enforce that the admin must explicitly toggle into research mode before
 * accessing research-specific data. Returns null when allowed (so call sites
 * can early-return on a non-null result).
 */
export function assertResearchModeOnly(request: NextRequest | Request): NextResponse | null {
  const mode = getAdminModeFromRequest(request);
  if (mode === 'research') return null;
  return NextResponse.json(
    {
      error: 'Endpoint ini hanya tersedia di Mode Penelitian. Aktifkan toggle Penelitian di header admin.',
      code: 'ADMIN_MODE_RESEARCH_REQUIRED',
    },
    { status: 403 },
  );
}
