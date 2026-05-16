'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import {
  ADMIN_MODE_COOKIE,
  coerceAdminMode,
  type AdminMode,
} from '@/lib/admin-mode';

interface AdminModeContextValue {
  adminMode: AdminMode;
  setAdminMode: (next: AdminMode) => void;
}

const AdminModeContext = createContext<AdminModeContextValue | null>(null);

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const target = `${name}=`;
  for (const segment of document.cookie.split(';')) {
    const trimmed = segment.trim();
    if (trimmed.startsWith(target)) return trimmed.substring(target.length);
  }
  return null;
}

function writeAdminModeCookie(next: AdminMode) {
  if (typeof document === 'undefined') return;
  // Mirror the LocaleProvider cookie spec — non-HttpOnly so the toggle button
  // can flip it client-side, Lax SameSite so it travels with normal navigations,
  // Path=/ so /admin/* and /api/admin/* both see it.
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie =
    `${ADMIN_MODE_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}${secure}`;
}

export function AdminModeProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  // Seed from cookie on first client render; fall back to 'general' so SSR
  // markup remains stable and we don't flash a different sidebar.
  const [adminMode, setAdminModeState] = useState<AdminMode>('general');

  useEffect(() => {
    const initial = coerceAdminMode(readCookie(ADMIN_MODE_COOKIE));
    setAdminModeState(initial);
  }, []);

  const setAdminMode = useCallback((next: AdminMode) => {
    if (next === adminMode) return;
    setAdminModeState(next);
    writeAdminModeCookie(next);

    // Audit log — fire-and-forget. The receiving endpoint just records to
    // api_logs so the researcher can trace which admin flipped the mode and
    // when. Failure is non-blocking; the cookie is already the source of truth.
    apiFetch('/api/admin/mode-switch', {
      method: 'POST',
      body: JSON.stringify({ to: next, from: adminMode }),
    }).catch((err) => {
      console.warn('[admin-mode] failed to record mode switch', err);
    });

    // Refresh server components so dashboards / lists re-fetch with the new
    // mode filter applied. We do this AFTER the cookie write so the next
    // fetch sees the updated value.
    router.refresh();
  }, [adminMode, router]);

  const value = useMemo<AdminModeContextValue>(
    () => ({ adminMode, setAdminMode }),
    [adminMode, setAdminMode],
  );

  return <AdminModeContext.Provider value={value}>{children}</AdminModeContext.Provider>;
}

export function useAdminMode(): AdminModeContextValue {
  const ctx = useContext(AdminModeContext);
  if (!ctx) {
    throw new Error('useAdminMode must be used inside <AdminModeProvider>');
  }
  return ctx;
}
