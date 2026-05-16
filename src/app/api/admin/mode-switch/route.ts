import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { coerceAdminMode, getAdminModeFromRequest } from '@/lib/admin-mode';

async function getHandler(req: NextRequest) {
  // Footer indicator: surface the most recent admin_mode_switched event so the
  // admin can see when/who last toggled. Mode comes from the cookie (already
  // injected as header by middleware) — this endpoint is purely an audit-log
  // read.
  const currentMode = getAdminModeFromRequest(req);
  const { data, error } = await adminDb
    .from('api_logs')
    .select('created_at, metadata, user_id')
    .eq('label', 'admin-mode-switched')
    .order('created_at', { ascending: false })
    .limit(1);
  if (error) {
    return NextResponse.json({ currentMode, lastSwitch: null, warning: error.message });
  }
  const last = (data && data[0]) || null;
  return NextResponse.json({
    currentMode,
    lastSwitch: last
      ? {
          at: last.created_at,
          to: (last.metadata as Record<string, unknown> | null)?.to ?? null,
          from: (last.metadata as Record<string, unknown> | null)?.from ?? null,
          adminEmail: (last.metadata as Record<string, unknown> | null)?.admin_email ?? null,
        }
      : null,
  });
}

async function postHandler(req: NextRequest) {
  let payload: { to?: unknown; from?: unknown } = {};
  try {
    payload = (await req.json()) as { to?: unknown; from?: unknown };
  } catch {
    // Best-effort audit logging — tolerate empty/invalid bodies because the
    // cookie write is the source of truth and we never want to block the UI
    // on a malformed audit payload.
  }

  const to = coerceAdminMode(payload.to);
  const from = coerceAdminMode(payload.from, to === 'research' ? 'general' : 'research');
  const adminUserId = req.headers.get('x-user-id') ?? null;
  const adminEmail = req.headers.get('x-user-email') ?? null;

  // The withApiLogging wrapper already records the path/method/duration in
  // api_logs. We write a second row with a dedicated label so the audit
  // event is easy to grep without joining metadata across endpoints.
  try {
    await adminDb.from('api_logs').insert({
      path: '/api/admin/mode-switch',
      label: 'admin-mode-switched',
      method: 'POST',
      status_code: 200,
      user_id: adminUserId,
      metadata: { from, to, admin_email: adminEmail },
      created_at: new Date().toISOString(),
    });
  } catch (error) {
    console.warn('[admin-mode-switch] failed to insert audit row', error);
  }

  return NextResponse.json({ success: true, from, to });
}

export const GET = withApiLogging(getHandler, { label: 'admin-mode-switch-status' });
export const POST = withApiLogging(postHandler, {
  label: 'admin-mode-switch',
});
