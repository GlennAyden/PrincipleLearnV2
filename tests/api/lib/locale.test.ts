import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_COOKIE,
  isLocale,
  parseLocale,
} from '@/lib/i18n/locale';

describe('locale helpers', () => {
  describe('constants', () => {
    it('exposes id and en as supported locales', () => {
      expect(LOCALES).toEqual(['id', 'en']);
    });

    it('defaults to id (Indonesian-first project)', () => {
      expect(DEFAULT_LOCALE).toBe('id');
    });

    it('uses "locale" as the cookie name', () => {
      expect(LOCALE_COOKIE).toBe('locale');
    });
  });

  describe('isLocale', () => {
    it.each(['id', 'en'])('returns true for %s', (value) => {
      expect(isLocale(value)).toBe(true);
    });

    it.each(['fr', 'EN', '', 'i d'])('returns false for %p', (value) => {
      expect(isLocale(value)).toBe(false);
    });

    it('returns false for non-string inputs', () => {
      expect(isLocale(undefined)).toBe(false);
      expect(isLocale(null)).toBe(false);
      expect(isLocale(123)).toBe(false);
      expect(isLocale({})).toBe(false);
    });
  });

  describe('parseLocale', () => {
    it('passes through a valid locale', () => {
      expect(parseLocale('en')).toBe('en');
      expect(parseLocale('id')).toBe('id');
    });

    it('defaults to DEFAULT_LOCALE for invalid input', () => {
      expect(parseLocale('fr')).toBe(DEFAULT_LOCALE);
      expect(parseLocale(undefined)).toBe(DEFAULT_LOCALE);
      expect(parseLocale(null)).toBe(DEFAULT_LOCALE);
      expect(parseLocale('')).toBe(DEFAULT_LOCALE);
    });
  });
});
