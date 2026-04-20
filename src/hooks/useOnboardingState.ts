'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api-client';

export interface OnboardingState {
  introSlidesCompleted: boolean;
  courseTourCompleted: boolean;
}

type OnboardingFlag = 'intro_slides' | 'course_tour';

interface UseOnboardingStateResult {
  state: OnboardingState | null;
  loading: boolean;
  error: string | null;
  markCompleted: (flag: OnboardingFlag) => Promise<void>;
  refresh: () => void;
}

export function useOnboardingState(enabled: boolean = true): UseOnboardingStateResult {
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState<boolean>(enabled);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  const refresh = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch('/api/onboarding-state', { cache: 'no-store' });
        if (!res.ok) throw new Error('Gagal memuat status onboarding');
        const data = await res.json();
        if (!cancelled && data?.success) setState(data.state as OnboardingState);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, version]);

  // Optimistic update: flip the flag locally first, then persist. On failure
  // we log but keep the optimistic value — the user has already moved past
  // that step in the UI, and a reload will re-sync from the server.
  const markCompleted = useCallback(async (flag: OnboardingFlag) => {
    setState((prev) => ({
      introSlidesCompleted: flag === 'intro_slides' ? true : !!prev?.introSlidesCompleted,
      courseTourCompleted: flag === 'course_tour' ? true : !!prev?.courseTourCompleted,
    }));

    try {
      const res = await apiFetch('/api/onboarding-state', {
        method: 'POST',
        body: JSON.stringify({ flag, value: true }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || 'Gagal menyimpan status onboarding');
      }
      const data = await res.json();
      if (data?.success) setState(data.state as OnboardingState);
    } catch (err) {
      console.error('[useOnboardingState] markCompleted failed:', err);
    }
  }, []);

  return { state, loading, error, markCompleted, refresh };
}
