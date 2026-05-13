'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch } from '@/lib/api-client';
import { dict, type DictKey } from '@/lib/i18n/dict';
import { LOCALE_COOKIE, type Locale } from '@/lib/i18n/locale';

type LocaleContextValue = {
  locale: Locale;
  t: (key: DictKey) => string;
  setLocale: (next: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

function writeLocaleCookie(next: Locale) {
  if (typeof document === 'undefined') return;
  // Match the cookie spec of onboarding_done / intro_slides_done so the
  // browser treats locale identically (visible to client JS, Lax SameSite,
  // sent with same-site navigations). Secure flag matches onboarding cookies
  // when running under HTTPS so we don't get stripped by mixed-content rules.
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : '';
  document.cookie =
    `${LOCALE_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_SECONDS}${secure}`;
}

export function LocaleProvider({
  initialLocale,
  children,
}: {
  initialLocale: Locale;
  children: ReactNode;
}) {
  const [locale, setLocaleState] = useState<Locale>(initialLocale);

  const setLocale = useCallback((next: Locale) => {
    if (next === locale) return;
    setLocaleState(next);
    writeLocaleCookie(next);

    // Fire-and-forget DB persistence. We deliberately do NOT block the UI on
    // this — the cookie is already the immediate source of truth for the
    // current tab, and the next login will re-sync from DB regardless. A
    // missing profile (user pre-onboarding) or transient network error is
    // acceptable here, but we still surface it so a stuck locale shows up in
    // devtools rather than vanishing.
    apiFetch('/api/learning-profile', {
      method: 'POST',
      body: JSON.stringify({ preferredLanguage: next }),
    }).catch((err) => {
      console.warn('[locale] failed to persist preferredLanguage', err);
    });
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    t: (key: DictKey) => dict[locale][key],
    setLocale,
  }), [locale, setLocale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error('useLocale must be used inside <LocaleProvider>');
  }
  return ctx;
}
