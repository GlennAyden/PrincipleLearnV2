// Single source of truth for the supported UI locales.
// Adding a new locale: extend LOCALES, add a dictionary key in dict.ts,
// update the CHECK constraint in learning_profiles.preferred_language.

export const LOCALES = ['id', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

// Indonesian-first project (research context, thesis participants are ID speakers).
export const DEFAULT_LOCALE: Locale = 'id';

// Non-HttpOnly UX cookie. NOT a security boundary — DB column is.
export const LOCALE_COOKIE = 'locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}
