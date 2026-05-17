# Bilingual ID/EN Toggle (Phase 1 + Phase 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambahkan toggle bahasa ID/EN di header user-facing dengan persistensi cookie + kolom `learning_profiles.preferred_language`, lalu terjemahkan semua string statis user-facing. Admin pages dan konten AI yang sudah ter-generate tetap Indonesian.

**Architecture:** Custom TypeScript dictionary + React Context — **bukan** `next-intl` (alasannya: `middleware.ts` sudah kompleks dengan 5 layer guard, chaining middleware next-intl berisiko regresi auth/CSRF). Cookie-based locale (`locale=id|en`), URL tetap tidak berubah. Source of truth: `learning_profiles.preferred_language`. Cookie sebagai UX guard / SSR readable, mirip pola `onboarding_done`. Konten AI mengikuti bahasa input prompt (sudah detect-language di 7 dari 13 prompt) — tidak ada translation ex-post untuk konten yang sudah ada.

**Tech Stack:** Next.js 15.5 App Router · React 19 · TypeScript strict · Supabase Postgres · Jest 30 · Playwright 1.58.

---

## Scope Boundaries

**In scope (MVP, Phase 1 + Phase 2):**
- DB migration: kolom `learning_profiles.preferred_language`
- Locale type, parser, dictionary, React Context, `useLocale` hook
- `LanguageToggle` component
- Mount toggle di header `src/app/dashboard/page.tsx` dan `src/app/course/[courseId]/layout.tsx`
- Update `<html lang>` di `src/app/layout.tsx` agar dinamis (SSR cookie read)
- Update `LearningProfileSchema` + `/api/learning-profile` agar menerima `preferredLanguage`
- Set cookie `locale` saat `/api/auth/login` sukses
- Translasi string statis user-facing di komponen + halaman utama
- Unit tests (Jest) untuk locale parser
- E2E test (Playwright) untuk flow toggle

**Out of scope (defer):**
- Admin pages (`src/app/admin/**`) — researcher single-user, tetap Indonesian
- API error messages → `error_code` pattern (Phase 3 nanti, ~60 string di 26 route)
- AI prompt `lang` parameter & hardcoded "Bahasa Indonesia" patch di `discussion/*` + `cognitive-scoring` (Phase 4)
- `subtopic_cache.cache_key` language tokenization (Phase 4 follow-up, hanya relevan kalau Phase 4 aktif)
- Backfill konten AI existing ke EN — **dilarang**, merusak integritas data RM2/RM3
- Discussion module (`src/app/api/discussion/*` & `src/services/discussion/*`) — modul tidak aktif di thesis run saat ini

---

## File Structure

**New files:**
- `docs/sql/2026-05-14-add-preferred-language.sql` — DB migration
- `src/lib/i18n/locale.ts` — `Locale` type, parser, cookie constant, default
- `src/lib/i18n/dict.ts` — Dictionary `id` & `en` dengan compile-time key parity via `satisfies`
- `src/context/LocaleContext.tsx` — Client Context Provider + `useLocale` hook
- `src/components/LanguageToggle/LanguageToggle.tsx` — Toggle button component
- `src/components/LanguageToggle/LanguageToggle.module.scss` — Styling toggle
- `tests/api/lib/locale.test.ts` — Unit test parser
- `tests/e2e/user/language-toggle.spec.ts` — E2E test flow toggle

**Modified files:**
- `src/app/layout.tsx` — Dynamic `<html lang>` + wrap children dengan `<LocaleProvider>`
- `src/lib/schemas.ts` — Tambah `preferredLanguage` ke `LearningProfileSchema`
- `src/app/api/learning-profile/route.ts` — Read & upsert `preferred_language`
- `src/app/api/auth/login/route.ts` — Read `preferred_language` dari DB → set cookie `locale`
- `src/app/dashboard/page.tsx` — Mount `<LanguageToggle>` + translate header & greeting strings
- `src/app/course/[courseId]/layout.tsx` — Mount `<LanguageToggle>` + translate header strings + `COURSE_TOUR_STEPS`
- `src/app/onboarding/intro/page.tsx` — Translate `SLIDES` array
- `src/app/onboarding/page.tsx` — Translate wizard labels
- `src/app/request-course/step1/page.tsx` — Translate form labels
- `src/app/request-course/step2/page.tsx` — Translate form labels
- `src/app/request-course/step3/page.tsx` — Translate form labels
- `src/app/request-course/generating/page.tsx` — Translate progress labels
- `src/app/course/[courseId]/page.tsx` — Translate UI shell labels (BUKAN course title/desc dari DB)
- `src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx` — Translate UI shell (BUKAN content dari AI)
- `src/components/PromptBuilder/PromptBuilder.tsx` — Translate `TUJUAN_CHIPS`, `KONTEKS_CHIPS`, `BATASAN_CHIPS` + field labels
- `src/components/StructuredReflection/StructuredReflection.tsx` — Translate `REFLECTION_FIELDS`
- `src/components/HelpDrawer/featureData.ts` — Translate feature descriptions
- `src/components/Quiz/Quiz.tsx` — Translate UI shell labels
- `src/components/AskQuestion/AskQuestion.tsx` — Translate UI shell labels
- `src/components/ChallengeThinking/ChallengeThinking.tsx` — Translate UI shell labels
- `src/components/KeyTakeaways/KeyTakeaways.tsx` — Translate heading label
- `src/components/WhatNext/WhatNext.tsx` — Translate heading label
- `src/components/NextSubtopics/NextSubtopics.tsx` — Translate heading label
- `src/components/AILoadingIndicator/AILoadingIndicator.tsx` — Translate loading text
- `src/components/ReasoningNote/ReasoningNote.tsx` — Translate label

---

## Important Conventions

1. **Cookie spec** harus konsisten dengan cookie existing (`onboarding_done`, `intro_slides_done`):
   ```
   Name: locale
   Value: id | en
   Path: /
   SameSite: Lax
   HttpOnly: false
   Max-Age: 31536000  (1 year)
   ```
2. **Dictionary key naming**: `<area>_<purpose>`, lowercase snake_case. Examples: `common_logout`, `dashboard_greeting_morning`, `course_back`. Hindari nested object — flat agar `keyof` bekerja simpel.
3. **Compile-time parity** antara `id` dan `en`: gunakan `satisfies typeof id` pada `en`. Jangan pakai `Record<DictKey, string>` — itu hilangkan inference.
4. **Konten dari DB / AI** (course title, subtopic body, quiz question, AI answer) **TIDAK** boleh dimasukkan ke dictionary. Hanya tampilkan apa adanya.
5. **Setiap commit** ikuti convention existing (lihat `git log` recent): prefix `feat:`, `fix:`, `chore:`, `docs:`. Jangan skip pre-commit hooks.
6. **`apiFetch` wajib** untuk semua mutation dari client (CSRF token auto-injected). Lihat `src/lib/api-client.ts`.

---

# Phase 1 — Foundation

## Task 1: DB Migration — Add `preferred_language` to `learning_profiles`

**Files:**
- Create: `docs/sql/2026-05-14-add-preferred-language.sql`

- [ ] **Step 1: Tulis migration SQL**

`docs/sql/2026-05-14-add-preferred-language.sql`:

```sql
-- Add UI locale preference to learning_profiles.
-- Notes:
--   * VARCHAR(5) accommodates BCP-47 region tags if we later add e.g. 'en-US'.
--   * CHECK constraint enforces only currently supported locales.
--   * DEFAULT 'id' preserves backward-compatibility for existing rows.
--   * Content stored in other tables (courses, subtopics, quiz) is NOT
--     migrated — those stay in their original generation language.

ALTER TABLE public.learning_profiles
  ADD COLUMN IF NOT EXISTS preferred_language VARCHAR(5)
    NOT NULL DEFAULT 'id'
    CHECK (preferred_language IN ('id', 'en'));

COMMENT ON COLUMN public.learning_profiles.preferred_language IS
  'UI locale preference (id | en). Content generated in DB stays in original language.';
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Gunakan `mcp__claude_ai_Supabase__apply_migration` dengan:
- `project_id`: `wesgoqdldgjbwgmubfdm`
- `name`: `add_preferred_language_to_learning_profiles`
- `query`: konten file di atas (tanpa komentar `--` baris pertama opsional)

Atau (fallback) jalankan via Supabase dashboard SQL editor.

- [ ] **Step 3: Verify kolom ter-create**

Run via Supabase MCP `execute_sql`:

```sql
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'learning_profiles'
  AND column_name = 'preferred_language';
```

Expected: 1 baris dengan `preferred_language | character varying | 'id'::character varying | NO`.

- [ ] **Step 4: Verify existing row sudah dapat default**

```sql
SELECT preferred_language, COUNT(*) FROM public.learning_profiles GROUP BY 1;
```

Expected: hanya `'id'` dengan count = jumlah row existing.

- [ ] **Step 5: Commit**

```bash
git add docs/sql/2026-05-14-add-preferred-language.sql
git commit -m "feat(db): add preferred_language column to learning_profiles"
```

---

## Task 2: Locale type, parser, cookie constant

**Files:**
- Create: `src/lib/i18n/locale.ts`
- Test: `tests/api/lib/locale.test.ts`

- [ ] **Step 1: Tulis failing test**

`tests/api/lib/locale.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run test — expect FAIL (module belum ada)**

```bash
npx jest tests/api/lib/locale.test.ts
```

Expected: `Cannot find module '@/lib/i18n/locale'`.

- [ ] **Step 3: Tulis implementasi**

`src/lib/i18n/locale.ts`:

```typescript
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
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx jest tests/api/lib/locale.test.ts
```

Expected: 4 test blocks pass, 0 fail.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/locale.ts tests/api/lib/locale.test.ts
git commit -m "feat(i18n): add locale type, parser, and cookie constant"
```

---

## Task 3: Dictionary skeleton (Phase 1 — common + login + header keys only)

**Files:**
- Create: `src/lib/i18n/dict.ts`

We seed only the minimum keys needed by `LanguageToggle`, dashboard header, course header, and logout. Phase 2 tasks extend this file incrementally.

- [ ] **Step 1: Tulis dictionary file**

`src/lib/i18n/dict.ts`:

```typescript
// Bilingual dictionary. Phase 1 seed.
//
// Key naming: <area>_<purpose>, lowercase, snake_case, flat (no nesting).
// Compile-time parity is enforced by `satisfies typeof id` on `en` — adding a
// key to `id` without adding it to `en` (or vice versa) will fail tsc.

const id = {
  // ── Common UI ────────────────────────────────────────────────────
  common_logout: 'Keluar',
  common_loading: 'Memuat...',
  common_back: 'Kembali',
  common_close: 'Tutup',
  common_save: 'Simpan',
  common_cancel: 'Batal',
  common_continue: 'Lanjutkan',
  common_submit: 'Kirim',

  // ── Language toggle ──────────────────────────────────────────────
  toggle_aria_to_en: 'Ganti ke Bahasa Inggris',
  toggle_aria_to_id: 'Ganti ke Bahasa Indonesia',

  // ── Dashboard header ─────────────────────────────────────────────
  brand_name: 'PrincipleLearn',
  dashboard_greeting_morning: 'Selamat pagi',
  dashboard_greeting_afternoon: 'Selamat siang',
  dashboard_greeting_evening: 'Selamat sore',
  dashboard_greeting_night: 'Selamat malam',
  dashboard_courses_running: 'kursus sedang berjalan',
  dashboard_ready_to_start: 'Siap memulai perjalanan belajarmu?',

  // ── Course layout header ─────────────────────────────────────────
  course_header_back: 'Kembali',
  course_header_logout: 'Logout',
  course_header_menu_toggle: 'Toggle menu',
  course_outline_loading: 'Memuat outline…',
} as const;

const en = {
  // ── Common UI ────────────────────────────────────────────────────
  common_logout: 'Logout',
  common_loading: 'Loading...',
  common_back: 'Back',
  common_close: 'Close',
  common_save: 'Save',
  common_cancel: 'Cancel',
  common_continue: 'Continue',
  common_submit: 'Submit',

  // ── Language toggle ──────────────────────────────────────────────
  toggle_aria_to_en: 'Switch to English',
  toggle_aria_to_id: 'Switch to Indonesian',

  // ── Dashboard header ─────────────────────────────────────────────
  brand_name: 'PrincipleLearn',
  dashboard_greeting_morning: 'Good morning',
  dashboard_greeting_afternoon: 'Good afternoon',
  dashboard_greeting_evening: 'Good evening',
  dashboard_greeting_night: 'Good night',
  dashboard_courses_running: 'courses in progress',
  dashboard_ready_to_start: 'Ready to start your learning journey?',

  // ── Course layout header ─────────────────────────────────────────
  course_header_back: 'Back',
  course_header_logout: 'Logout',
  course_header_menu_toggle: 'Toggle menu',
  course_outline_loading: 'Loading outline…',
} as const satisfies typeof id;

export const dict = { id, en } as const;

export type DictKey = keyof typeof id;
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
npx tsc --noEmit
```

Expected: zero error. (Jika satu key di `en` typo, akan fail di sini — itulah gunanya `satisfies`.)

- [ ] **Step 3: Sanity test runtime — tambahkan ke locale.test.ts**

Append ke `tests/api/lib/locale.test.ts`:

```typescript
import { dict } from '@/lib/i18n/dict';

describe('dict', () => {
  it('has identical key sets in id and en', () => {
    expect(Object.keys(dict.id).sort()).toEqual(Object.keys(dict.en).sort());
  });

  it('has non-empty values in every entry', () => {
    for (const locale of ['id', 'en'] as const) {
      for (const [key, value] of Object.entries(dict[locale])) {
        expect(value).withContext?.(`${locale}.${key}`) ?? expect(value);
        expect(typeof value).toBe('string');
        expect(value.length).toBeGreaterThan(0);
      }
    }
  });
});
```

- [ ] **Step 4: Run all locale tests**

```bash
npx jest tests/api/lib/locale.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/i18n/dict.ts tests/api/lib/locale.test.ts
git commit -m "feat(i18n): seed bilingual dictionary with header + common keys"
```

---

## Task 4: LocaleContext Provider + `useLocale` hook

**Files:**
- Create: `src/context/LocaleContext.tsx`

- [ ] **Step 1: Tulis Context Provider + hook**

`src/context/LocaleContext.tsx`:

```typescript
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
  // sent with same-site navigations).
  document.cookie =
    `${LOCALE_COOKIE}=${next}; Path=/; SameSite=Lax; Max-Age=${ONE_YEAR_SECONDS}`;
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
    // current tab, and the next login will re-sync from DB regardless.
    apiFetch('/api/learning-profile', {
      method: 'POST',
      body: JSON.stringify({ preferredLanguage: next }),
    }).catch(() => {
      // Swallow: a missing profile (user pre-onboarding) or transient network
      // error is acceptable here. The UX guard (cookie) is already updated.
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
```

- [ ] **Step 2: Verify TypeScript compile**

```bash
npx tsc --noEmit
```

Expected: zero error.

- [ ] **Step 3: Commit**

```bash
git add src/context/LocaleContext.tsx
git commit -m "feat(i18n): add LocaleContext provider and useLocale hook"
```

---

## Task 5: Update root layout — dynamic `<html lang>` + wrap with `LocaleProvider`

**Files:**
- Modify: `src/app/layout.tsx`

`src/app/layout.tsx` saat ini Server Component dengan `<html lang="id">` hardcoded. Kita ubah jadi async Server Component yang baca cookie via `cookies()` dari `next/headers`, lalu inject locale ke `<html lang>` dan ke `LocaleProvider`.

- [ ] **Step 1: Edit `src/app/layout.tsx`**

Ganti seluruh isi dengan:

```typescript
// src/app/layout.tsx
import './globals.scss';
import './font-styles.scss';
import { cookies } from 'next/headers';
import { ReactNode } from 'react';
import { RequestCourseProvider } from '../context/RequestCourseContext';
import { LocaleProvider } from '../context/LocaleContext';
import { AuthProvider } from '@/hooks/useAuth';
import { LOCALE_COOKIE, parseLocale } from '@/lib/i18n/locale';

// Metadata for the app
export const metadata = {
  title: 'PrincipleLearn - Belajar Lebih Cerdas. Berpikir Lebih Dalam. Kuasai Apapun!',
  description: 'Dengan belajar lebih cerdas menggunakan strategi efektif dan tetap penasaran, serta berpikir lebih dalam dengan mempertanyakan asumsi dan mengeksplorasi perspektif baru, kamu bisa menguasai apapun.',
  keywords: 'belajar, pendidikan, kursus online, pengembangan keterampilan',
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const cookieStore = await cookies();
  const locale = parseLocale(cookieStore.get(LOCALE_COOKIE)?.value);

  return (
    <html lang={locale}>
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
      </head>
      <body>
        <LocaleProvider initialLocale={locale}>
          <AuthProvider>
            <RequestCourseProvider>
              {children}
            </RequestCourseProvider>
          </AuthProvider>
        </LocaleProvider>
      </body>
    </html>
  );
}
```

Note: `metadata` belum ikut bilingual — Next.js `metadata` di server boleh tetap statik untuk sekarang (SEO-tier, bukan UI). Bisa di-extend nanti kalau perlu via `generateMetadata`.

- [ ] **Step 2: Build & type-check**

```bash
npm run build
```

Expected: build sukses, tidak ada warning baru.

- [ ] **Step 3: Manual smoke test**

```bash
npm run dev
```

Buka `http://localhost:3000/` → inspect HTML → konfirmasi `<html lang="id">` (default).
Set cookie manual via DevTools: `document.cookie = 'locale=en; Path=/'` lalu reload → konfirmasi `<html lang="en">`.

- [ ] **Step 4: Commit**

```bash
git add src/app/layout.tsx
git commit -m "feat(i18n): make root layout locale-aware via SSR cookie read"
```

---

## Task 6: LanguageToggle component

**Files:**
- Create: `src/components/LanguageToggle/LanguageToggle.tsx`
- Create: `src/components/LanguageToggle/LanguageToggle.module.scss`

- [ ] **Step 1: Tulis component**

`src/components/LanguageToggle/LanguageToggle.tsx`:

```typescript
'use client';

import { useLocale } from '@/context/LocaleContext';
import styles from './LanguageToggle.module.scss';

type Props = {
  className?: string;
};

export default function LanguageToggle({ className }: Props) {
  const { locale, setLocale, t } = useLocale();
  const next = locale === 'id' ? 'en' : 'id';
  const ariaLabel = locale === 'id' ? t('toggle_aria_to_en') : t('toggle_aria_to_id');

  return (
    <button
      type="button"
      className={`${styles.toggle} ${className ?? ''}`.trim()}
      aria-label={ariaLabel}
      aria-pressed={locale === 'en'}
      onClick={() => setLocale(next)}
      data-testid="language-toggle"
    >
      <span className={locale === 'id' ? styles.active : styles.inactive}>ID</span>
      <span className={styles.divider} aria-hidden="true">/</span>
      <span className={locale === 'en' ? styles.active : styles.inactive}>EN</span>
    </button>
  );
}
```

- [ ] **Step 2: Tulis styles**

`src/components/LanguageToggle/LanguageToggle.module.scss`:

```scss
.toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.375rem 0.625rem;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.06);
  color: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
  transition: background 120ms ease, border-color 120ms ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.32);
  }

  &:focus-visible {
    outline: 2px solid #3b82f6;
    outline-offset: 2px;
  }
}

.active {
  color: inherit;
  opacity: 1;
}

.inactive {
  opacity: 0.45;
}

.divider {
  opacity: 0.35;
  font-weight: 400;
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero error.

- [ ] **Step 4: Commit**

```bash
git add src/components/LanguageToggle/
git commit -m "feat(i18n): add LanguageToggle button component"
```

---

## Task 7: Extend Zod schema — `preferredLanguage` di `LearningProfileSchema`

**Files:**
- Modify: `src/lib/schemas.ts` (lines 287-293)

- [ ] **Step 1: Edit `src/lib/schemas.ts`**

Replace `LearningProfileSchema` (lines 287-293) dengan:

```typescript
export const LearningProfileSchema = z.object({
  displayName: z.string().trim().min(1, 'displayName diperlukan').optional(),
  programmingExperience: z.string().trim().min(1, 'programmingExperience diperlukan').optional(),
  learningStyle: z.string().trim().min(1, 'learningStyle diperlukan').optional(),
  learningGoals: z.string().trim().optional().default(''),
  challenges: z.string().trim().optional().default(''),
  preferredLanguage: z.enum(['id', 'en']).optional(),
}).refine(
  (data) => Object.values(data).some((v) => v !== undefined && v !== ''),
  { message: 'Setidaknya satu field harus diisi' }
);
```

**Mengapa optional + refine?** Karena route `/api/learning-profile` (POST) sekarang juga digunakan untuk update parsial preferensi bahasa saja (dari `LanguageToggle`). Field profile lain (displayName, dll.) tetap required saat onboarding, tapi tidak perlu dikirim ulang saat hanya update bahasa. Refine memastikan body tidak benar-benar kosong.

**HATI-HATI**: Onboarding wizard yang sudah ada (kalau dia kirim full payload) tetap harus jalan. Verifikasi di Task 8 step 2.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: zero error.

- [ ] **Step 3: Run existing schema-related tests**

```bash
npx jest tests/api/learning-profile 2>/dev/null || echo "no existing tests"
```

Tidak masalah kalau belum ada test. Lanjut.

- [ ] **Step 4: Commit**

```bash
git add src/lib/schemas.ts
git commit -m "feat(schema): allow partial updates + preferredLanguage in LearningProfileSchema"
```

---

## Task 8: Update `/api/learning-profile` POST — handle `preferred_language`

**Files:**
- Modify: `src/app/api/learning-profile/route.ts`

- [ ] **Step 1: Tambahkan `preferred_language` ke `LearningProfileRow` interface (line 10-20)**

```typescript
interface LearningProfileRow {
  id: string;
  user_id: string;
  display_name?: string;
  programming_experience?: string;
  learning_style?: string;
  learning_goals?: string;
  challenges?: string;
  preferred_language?: 'id' | 'en';
  created_at?: string | null;
  updated_at?: string | null;
}
```

- [ ] **Step 2: Update `sanitizeProfile` (line 22-35)**

```typescript
function sanitizeProfile(profile: LearningProfileRow | null) {
  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.user_id,
    displayName: profile.display_name ?? '',
    programmingExperience: profile.programming_experience ?? '',
    learningStyle: profile.learning_style ?? '',
    learningGoals: profile.learning_goals ?? '',
    challenges: profile.challenges ?? '',
    preferredLanguage: profile.preferred_language ?? 'id',
    createdAt: profile.created_at ?? null,
    updatedAt: profile.updated_at ?? null,
  };
}
```

- [ ] **Step 3: Update `postHandler` upsert body (line 96-117)**

Ganti destructuring + upsert block dengan:

```typescript
    const {
      displayName,
      programmingExperience,
      learningStyle,
      learningGoals,
      challenges,
      preferredLanguage,
    } = parsed.data;

    const userId = payload.userId;

    // Build upsert payload — only include fields the client actually sent
    // (LearningProfileSchema makes them optional now). The CHECK constraint
    // on preferred_language guarantees only 'id'|'en' reach the DB.
    const upsertPayload: Record<string, unknown> = {
      user_id: userId,
      updated_at: new Date().toISOString(),
    };
    if (displayName !== undefined) upsertPayload.display_name = displayName;
    if (programmingExperience !== undefined) upsertPayload.programming_experience = programmingExperience;
    if (learningStyle !== undefined) upsertPayload.learning_style = learningStyle;
    if (learningGoals !== undefined && learningGoals !== '') upsertPayload.learning_goals = learningGoals;
    if (challenges !== undefined && challenges !== '') upsertPayload.challenges = challenges;
    if (preferredLanguage !== undefined) upsertPayload.preferred_language = preferredLanguage;

    const { data, error } = await adminDb
      .from('learning_profiles')
      .upsert(upsertPayload, { onConflict: 'user_id' }) as {
        data: LearningProfileRow[] | LearningProfileRow | null;
        error: { message: string } | null;
      };
```

- [ ] **Step 4: Manual smoke test — onboarding masih jalan**

```bash
npm run dev
```

Login sebagai user yang belum onboarding → selesaikan wizard → konfirmasi tidak ada error. Inspect Network tab pada POST `/api/learning-profile` → 200.

- [ ] **Step 5: Manual smoke test — toggle juga jalan**

Buka DevTools console:

```javascript
fetch('/api/learning-profile', {
  method: 'POST',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/json',
    'x-csrf-token': document.cookie.split('csrf_token=')[1]?.split(';')[0] ?? '',
  },
  body: JSON.stringify({ preferredLanguage: 'en' }),
}).then(r => r.json()).then(console.log);
```

Expected: `{ success: true, profile: { ..., preferredLanguage: 'en' } }`.

Verifikasi via Supabase MCP:

```sql
SELECT preferred_language FROM public.learning_profiles WHERE user_id = '<your-user-id>';
```

Expected: `'en'`.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/learning-profile/route.ts
git commit -m "feat(api): persist preferred_language in /api/learning-profile"
```

---

## Task 9: Set `locale` cookie on `/api/auth/login` success

**Files:**
- Modify: `src/app/api/auth/login/route.ts`

- [ ] **Step 1: Tambahkan import**

Di atas file, tambah:

```typescript
import { adminDb } from '@/lib/database';
import { LOCALE_COOKIE, parseLocale } from '@/lib/i18n/locale';
```

- [ ] **Step 2: Setelah `generateAuthTokens(user)` (sekitar line 58), baca preferred_language**

Tambah block:

```typescript
    // Load locale preference for the user so we can hand the client a primed
    // cookie before the first dashboard render — avoids a flash of ID for
    // users whose preference is EN. A missing row defaults to 'id' via parseLocale.
    const { data: profileRow } = await adminDb
      .from('learning_profiles')
      .select('preferred_language')
      .eq('user_id', user.id)
      .maybeSingle() as { data: { preferred_language?: string } | null };

    const locale = parseLocale(profileRow?.preferred_language);
```

- [ ] **Step 3: Setelah `response.cookies.set('csrf_token', ...)` (line 109-115), set cookie locale**

```typescript
    // Locale cookie: matches the spec used by onboarding_done / intro_slides_done.
    // Non-HttpOnly so the client can read it, Lax so it survives same-site
    // navigations from /login → /dashboard.
    response.cookies.set(LOCALE_COOKIE, locale, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 365,
      path: '/',
    });
```

- [ ] **Step 4: Build & type-check**

```bash
npm run build
```

Expected: build sukses.

- [ ] **Step 5: Manual smoke test**

Hapus cookie `locale` via DevTools. Set `preferred_language='en'` di DB untuk user test:

```sql
UPDATE public.learning_profiles SET preferred_language = 'en' WHERE user_id = '<your-user-id>';
```

Login ulang → inspect Set-Cookie response header → konfirmasi `locale=en; Path=/; SameSite=Lax`.

Reset ke `'id'` setelahnya.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/auth/login/route.ts
git commit -m "feat(auth): set locale cookie on login from learning_profiles.preferred_language"
```

---

## Task 10: Mount `LanguageToggle` di dashboard header

**Files:**
- Modify: `src/app/dashboard/page.tsx` (lines 111-146 area + greeting block 150-160)

- [ ] **Step 1: Tambahkan import**

Di awal file:

```typescript
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle';
import { useLocale } from '@/context/LocaleContext';
```

- [ ] **Step 2: Panggil `useLocale` di body component**

Tambahkan baris sebelum `userName` di body:

```typescript
  const { t } = useLocale();
```

- [ ] **Step 3: Render toggle di header — sisipkan SEBELUM `<div className={styles.userBadge}>`**

Di `headerRight` (line 129-135), update jadi:

```tsx
          <div className={styles.headerRight}>
            <LanguageToggle />
            <div className={styles.userBadge}>
              <div className={styles.avatar}>
                {userName.charAt(0).toUpperCase()}
              </div>
              <span className={styles.userEmail}>{user?.email}</span>
            </div>
            <button className={styles.logoutBtn} onClick={handleLogout}>
              {/* SVG kept as-is */}
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M6.75 15.75H3.75C3.35 15.75 3 15.4 3 15V3C3 2.6 3.35 2.25 3.75 2.25H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M12 12.75L15 9.75L12 6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M15 9.75H6.75" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              {t('common_logout')}
            </button>
          </div>
```

- [ ] **Step 4: Ganti `greeting()` helper agar pakai dictionary**

Cari fungsi `greeting` (likely line ~70-90, pencari local). Ganti returns 'Selamat pagi' dst dengan key dictionary. Jika `greeting` adalah arrow function dalam component, jadikan:

```typescript
  const greeting = () => {
    const hour = new Date().getHours();
    if (hour < 11) return t('dashboard_greeting_morning');
    if (hour < 15) return t('dashboard_greeting_afternoon');
    if (hour < 18) return t('dashboard_greeting_evening');
    return t('dashboard_greeting_night');
  };
```

Note: cek hour boundary yang ada saat ini; sesuaikan jika berbeda.

- [ ] **Step 5: Ganti dua string Indonesian di greeting subtitle (line 157-158)**

```tsx
            <p className={styles.greetingSub}>
              {courses.length > 0
                ? `${courses.length} ${t('dashboard_courses_running')}`
                : t('dashboard_ready_to_start')}
            </p>
```

- [ ] **Step 6: Run dev server, manual smoke test**

```bash
npm run dev
```

- Login → buka `/dashboard` → konfirmasi toggle muncul di kanan atas.
- Klik toggle ID→EN → konfirmasi "Keluar" jadi "Logout", greeting berganti, `dashboard_courses_running` text translate.
- Reload page → cookie `locale=en` masih ada → state EN dipertahankan.
- Klik toggle EN→ID → konfirmasi kembali.

- [ ] **Step 7: Commit**

```bash
git add src/app/dashboard/page.tsx
git commit -m "feat(dashboard): mount LanguageToggle and translate header strings"
```

---

## Task 11: Mount `LanguageToggle` di course layout header + translate

**Files:**
- Modify: `src/app/course/[courseId]/layout.tsx`

- [ ] **Step 1: Tambahkan import**

```typescript
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle';
import { useLocale } from '@/context/LocaleContext';
```

- [ ] **Step 2: Panggil hook di body component**

```typescript
  const { t } = useLocale();
```

- [ ] **Step 3: Update header (line 218-275)**

- Line 215: `return <div className={styles.loading}>Loading outline…</div>;` → `return <div className={styles.loading}>{t('course_outline_loading')}</div>;`
- Line 228: `aria-label="Go back"` tetap (aria-label OK statik EN untuk a11y; tapi mari pakai dict untuk konsistensi)

Ganti header bagian back + brand:

```tsx
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div className={styles.headerLeft}>
            <button type="button" onClick={() => router.back()} className={styles.backBtn} aria-label={t('course_header_back')}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>{t('course_header_back')}</span>
            </button>
            <button
              type="button"
              className={styles.mobileMenuToggle}
              onClick={() => setShowMobileMenu(!showMobileMenu)}
              aria-label={t('course_header_menu_toggle')}
              aria-expanded={showMobileMenu}
            >
              {/* SVG kept as-is */}
            </button>
          </div>

          <Link href="/dashboard" className={styles.brandContainer}>
            {/* SVG brandIcon kept */}
            <h1 className={styles.brand}>{t('brand_name')}</h1>
          </Link>

          <div className={styles.headerRight}>
            <LanguageToggle />
            <div className={styles.userLevel}>
              <span className={styles.levelBadge}>{course.level}</span>
            </div>
            <button type="button" className={styles.logoutBtn} onClick={handleLogout} aria-label={t('course_header_logout')}>
              {/* SVG kept */}
              <span className={styles.logoutText}>{t('course_header_logout')}</span>
            </button>
          </div>
        </div>
      </header>
```

**`course.level`** dari DB tetap pakai apa adanya (bisa "Pemula" atau "Beginner" tergantung input awal). Itu bukan UI shell.

- [ ] **Step 4: `COURSE_TOUR_STEPS` (line 16-45) — defer ke Task 13**

Tinggalkan dulu untuk task terpisah.

- [ ] **Step 5: Manual smoke test**

Navigasi ke course → toggle ID/EN → konfirmasi "Kembali"/"Back", "Logout", brand tidak berubah.

- [ ] **Step 6: Commit**

```bash
git add src/app/course/[courseId]/layout.tsx
git commit -m "feat(course): mount LanguageToggle and translate header strings"
```

---

## Task 12: E2E smoke test — toggle flow

**Files:**
- Create: `tests/e2e/user/language-toggle.spec.ts`

Lihat existing pattern di `tests/e2e/user/` untuk login helper. Kalau ada `signup-login.spec.ts` reuse setup-nya.

- [ ] **Step 1: Tulis E2E test**

`tests/e2e/user/language-toggle.spec.ts`:

```typescript
import { test, expect } from '@playwright/test';

// Reuses an existing logged-in user. If your e2e setup seeds a user, swap the
// credentials below for the seeded ones. Otherwise, this test assumes a manual
// signup step or storageState fixture.
const TEST_EMAIL = process.env.E2E_USER_EMAIL ?? 'e2e-user@example.com';
const TEST_PASSWORD = process.env.E2E_USER_PASSWORD ?? 'TestPass123!';

test.describe('Language toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(TEST_EMAIL);
    await page.getByLabel(/password|kata sandi/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /masuk|login/i }).click();
    await page.waitForURL(/\/dashboard/);
  });

  test('toggles dashboard header from ID to EN and persists across reload', async ({ page }) => {
    const toggle = page.getByTestId('language-toggle');
    await expect(toggle).toBeVisible();

    // Default ID — logout button text
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible();

    await toggle.click();

    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    const cookies = await page.context().cookies();
    expect(cookies.find((c) => c.name === 'locale')?.value).toBe('en');

    await page.reload();
    await expect(page.getByRole('button', { name: 'Logout' })).toBeVisible();

    // Reset for next run
    await toggle.click();
    await expect(page.getByRole('button', { name: 'Keluar' })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run E2E**

```bash
npm run test:e2e:user -- language-toggle
```

Expected: pass. Kalau gagal karena credentials, set `E2E_USER_EMAIL` & `E2E_USER_PASSWORD` env atau gunakan akun seeded.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/user/language-toggle.spec.ts
git commit -m "test(e2e): verify language toggle persists across reload"
```

---

# Phase 1 — Checkpoint

Sebelum lanjut ke Phase 2, verifikasi:

- [ ] Toggle berfungsi di `/dashboard` dan `/course/[id]/*`
- [ ] Cookie `locale` ter-set saat login (dari DB)
- [ ] Cookie `locale` ter-update saat klik toggle
- [ ] DB column `preferred_language` ter-update dalam < 1 detik setelah toggle
- [ ] `<html lang>` SSR mengikuti cookie
- [ ] `npm run lint` zero error
- [ ] `npm run build` sukses
- [ ] Unit test `tests/api/lib/locale.test.ts` pass
- [ ] E2E test `tests/e2e/user/language-toggle.spec.ts` pass

---

# Phase 2 — Translate Static UI Strings

Phase 2 tasks are **incremental string translations**. Setiap task mengikuti pola:

1. Extend `src/lib/i18n/dict.ts` dengan key baru (ID + EN, urutkan grup).
2. Run `npx tsc --noEmit` agar `satisfies` enforce parity.
3. Edit komponen / page: tambah `import { useLocale } from '@/context/LocaleContext'` + `const { t } = useLocale();`.
4. Ganti string literal Indonesian dengan `t('key')`.
5. Smoke test toggle di route terkait.
6. Commit per logical group.

Catatan untuk semua task Phase 2:
- **JANGAN** translate value dari API/DB (course title, subtopic content, AI feedback, quiz question).
- **JANGAN** ubah enum value, prop name, atau key DB.
- **JANGAN** ubah comment kode (mereka untuk developer, bukan user).
- **HANYA** translate user-visible static text (label, button, heading, placeholder, aria-label).

---

## Task 13: Translate `COURSE_TOUR_STEPS` (course layout product tour)

**Files:**
- Modify: `src/app/course/[courseId]/layout.tsx` (lines 16-45)
- Modify: `src/lib/i18n/dict.ts`

- [ ] **Step 1: Read existing `COURSE_TOUR_STEPS`**

Baca konten array (16-45) untuk inventori string-nya. Asumsi: tiap step punya `title` + `body`.

- [ ] **Step 2: Tambah key ke dict**

Tambah grup di `id` dan `en`:

```typescript
  // ── Course tour ──────────────────────────────────────────────────
  tour_step1_title: '...',  // ganti dengan teks asli ID
  tour_step1_body: '...',
  tour_step2_title: '...',
  tour_step2_body: '...',
  // (sesuaikan dengan jumlah step di file asli)
```

Untuk EN: terjemahan natural masing-masing.

- [ ] **Step 3: Ubah array jadi fungsi**

Karena `COURSE_TOUR_STEPS` ada di module-level (line 16, di luar komponen), kita ubah jadi factory:

```typescript
function buildCourseTourSteps(t: (key: DictKey) => string) {
  return [
    { id: 'step1', title: t('tour_step1_title'), body: t('tour_step1_body') },
    { id: 'step2', title: t('tour_step2_title'), body: t('tour_step2_body') },
    // …
  ];
}
```

Lalu di dalam komponen:

```typescript
  const tourSteps = useMemo(() => buildCourseTourSteps(t), [t]);
```

`useMemo` dengan dep `[t]` aman karena `t` di-memoize di provider (sudah `useCallback` via `useMemo` di value).

Import `DictKey` dari `@/lib/i18n/dict` di file ini juga.

- [ ] **Step 4: Cari konsumer `COURSE_TOUR_STEPS` di file & ganti ke `tourSteps`**

- [ ] **Step 5: Type-check + smoke test**

```bash
npx tsc --noEmit
npm run dev
```

Trigger tour (kalau ada `ProductTour` component) → konfirmasi teks ikut locale.

- [ ] **Step 6: Commit**

```bash
git add src/app/course/[courseId]/layout.tsx src/lib/i18n/dict.ts
git commit -m "i18n: translate course tour steps"
```

---

## Task 14: Translate onboarding intro slides

**Files:**
- Modify: `src/app/onboarding/intro/page.tsx` (lines 18-51, `SLIDES` array)
- Modify: `src/lib/i18n/dict.ts`

- [ ] **Step 1: Inventori `SLIDES`**

Baca array → catat semua title/body/bullets per slide.

- [ ] **Step 2: Tambah key ke dict**

```typescript
  // ── Onboarding intro slides ──────────────────────────────────────
  intro_slide1_title: '...',
  intro_slide1_body: '...',
  intro_slide1_bullet1: '...',
  // …
```

- [ ] **Step 3: Convert `SLIDES` ke factory + useMemo di komponen**

Sama pattern dengan Task 13.

- [ ] **Step 4: Translate page-level labels** (tombol Next/Skip/Finish, indicator dot label kalau ada).

- [ ] **Step 5: Smoke test** flow intro → toggle ID/EN di header (kalau toggle di-mount di onboarding layout — check apakah perlu).

**Catatan**: onboarding berjalan **sebelum** user lihat dashboard. Toggle harus accessible juga di onboarding pages? Decision: ya — siapkan placement di top-right onboarding intro page. Tambah `<LanguageToggle>` di onboarding shell.

- [ ] **Step 6: Commit**

```bash
git add src/app/onboarding/intro/page.tsx src/lib/i18n/dict.ts
git commit -m "i18n: translate onboarding intro slides and add toggle"
```

---

## Task 15: Translate onboarding wizard (`onboarding/page.tsx`)

**Files:**
- Modify: `src/app/onboarding/page.tsx`
- Modify: `src/lib/i18n/dict.ts`

- [ ] **Step 1: Inventori string ID di file**

`grep -n "['\"]" src/app/onboarding/page.tsx | head -60` untuk lihat strings.

- [ ] **Step 2: Tambah grup `onboarding_*` ke dict.ts**

Kunci untuk semua label form, option (kalau ada di-render dari array konstanta), button, validation message inline.

- [ ] **Step 3: Replace string dengan `t(...)`**

- [ ] **Step 4: Smoke test** wizard end-to-end di ID & EN.

- [ ] **Step 5: Commit**

```bash
git add src/app/onboarding/page.tsx src/lib/i18n/dict.ts
git commit -m "i18n: translate onboarding wizard labels"
```

---

## Task 16: Translate `request-course` wizard (step1, step2, step3, generating)

**Files:**
- Modify: `src/app/request-course/step1/page.tsx`
- Modify: `src/app/request-course/step2/page.tsx`
- Modify: `src/app/request-course/step3/page.tsx`
- Modify: `src/app/request-course/generating/page.tsx`
- Modify: `src/lib/i18n/dict.ts`

- [ ] **Step 1: Inventori string di 4 file** (~101 string total)

- [ ] **Step 2: Tambah grup `request_course_*` ke dict**

Kelompokkan per step: `request_course_step1_*`, dst.

- [ ] **Step 3: Replace di tiap step satu per satu**

Commit per step kalau besar (~25 strings each).

- [ ] **Step 4: Smoke test** wizard end-to-end di ID & EN — pastikan TIDAK ada string Indonesian tersisa.

- [ ] **Step 5: Commit**

```bash
git add src/app/request-course/ src/lib/i18n/dict.ts
git commit -m "i18n: translate request-course wizard steps"
```

---

## Task 17: Translate `course/[courseId]/page.tsx` UI shell

**Files:**
- Modify: `src/app/course/[courseId]/page.tsx`
- Modify: `src/lib/i18n/dict.ts`

Hanya UI shell. Course title, module names, descriptions = DB content, JANGAN.

- [ ] **Step 1: Inventori string statis** (heading "Modul", "Mulai belajar", progress label, dll.)

- [ ] **Step 2: Tambah `course_overview_*` key**

- [ ] **Step 3: Replace**

- [ ] **Step 4: Smoke test**

- [ ] **Step 5: Commit**

```bash
git add src/app/course/[courseId]/page.tsx src/lib/i18n/dict.ts
git commit -m "i18n: translate course overview UI shell"
```

---

## Task 18: Translate subtopic page UI shell

**Files:**
- Modify: `src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx` (~80 string)
- Modify: `src/lib/i18n/dict.ts`

Hanya UI shell + loading state + error state. AI-generated paragraphs, challenges, examples, key takeaways content TIDAK ditranslate (rendered apa adanya).

- [ ] **Step 1: Inventori**

- [ ] **Step 2: Tambah `subtopic_*` keys**

- [ ] **Step 3: Replace string**

- [ ] **Step 4: Smoke test**

Verifikasi tab navigation labels, "Materi"/"Latihan"/"Refleksi" type labels, button labels, error fallback text translate. Konten AI tetap dalam bahasa asalnya.

- [ ] **Step 5: Commit**

```bash
git add src/app/course/[courseId]/subtopic/ src/lib/i18n/dict.ts
git commit -m "i18n: translate subtopic page UI shell (AI content unchanged)"
```

---

## Task 19: Translate `StructuredReflection` (`REFLECTION_FIELDS`)

**Files:**
- Modify: `src/components/StructuredReflection/StructuredReflection.tsx` (lines 48-79)
- Modify: `src/lib/i18n/dict.ts`

- [ ] **Step 1: Inventori `REFLECTION_FIELDS`**

Tiap field punya `title`, `question`, `placeholder`.

- [ ] **Step 2: Tambah `reflection_<fieldname>_<part>` keys**

- [ ] **Step 3: Convert `REFLECTION_FIELDS` ke factory** (pola Task 13)

- [ ] **Step 4: Smoke test**

Buka subtopic dengan reflection section → toggle → verifikasi field title/question/placeholder.

- [ ] **Step 5: Commit**

```bash
git add src/components/StructuredReflection/ src/lib/i18n/dict.ts
git commit -m "i18n: translate StructuredReflection field labels"
```

---

## Task 20: Translate `PromptBuilder` chip arrays

**Files:**
- Modify: `src/components/PromptBuilder/PromptBuilder.tsx` (lines 24-41)
- Modify: `src/lib/i18n/dict.ts`

`TUJUAN_CHIPS`, `KONTEKS_CHIPS`, `BATASAN_CHIPS` — chip labels yang user pilih saat building prompt.

**HATI-HATI**: chip values DISIMPAN ke DB (jadi prompt teks). Kalau user pilih chip "Brief explanation" (EN), itu masuk ke prompt yang akan dikirim ke AI. AI akan ikut bahasa input → output EN. Itu konsisten dan diinginkan.

**TAPI**: kalau user toggle ke EN, pilih chip, lalu toggle balik ke ID, prompt yang sudah tersimpan tetap dalam bahasa saat chip dipilih. Itu wajar — prompt journey adalah research artefact.

- [ ] **Step 1: Inventori chips**

- [ ] **Step 2: Tambah `prompt_chip_*` keys**

- [ ] **Step 3: Convert arrays ke factory**

- [ ] **Step 4: Replace field labels juga** (24 string)

- [ ] **Step 5: Smoke test**

- [ ] **Step 6: Commit**

```bash
git add src/components/PromptBuilder/ src/lib/i18n/dict.ts
git commit -m "i18n: translate PromptBuilder chips and field labels"
```

---

## Task 21: Translate `HelpDrawer/featureData.ts`

**Files:**
- Modify: `src/components/HelpDrawer/featureData.ts`
- Modify: `src/components/HelpDrawer/HelpDrawer.tsx` (jika ada string statik)
- Modify: `src/lib/i18n/dict.ts`

Konten feature explanation panel.

- [ ] **Step 1: Inventori `SUBTOPIC_HELP_FEATURES` array**

- [ ] **Step 2: Tambah `help_feature_<n>_<part>` keys**

- [ ] **Step 3: Convert array ke factory**

- [ ] **Step 4: Smoke test** buka HelpDrawer di subtopic → toggle.

- [ ] **Step 5: Commit**

```bash
git add src/components/HelpDrawer/ src/lib/i18n/dict.ts
git commit -m "i18n: translate HelpDrawer feature descriptions"
```

---

## Task 22: Translate sisa komponen user-facing kecil

**Files:**
- Modify: `src/components/Quiz/Quiz.tsx`
- Modify: `src/components/AskQuestion/AskQuestion.tsx`
- Modify: `src/components/ChallengeThinking/ChallengeThinking.tsx`
- Modify: `src/components/KeyTakeaways/KeyTakeaways.tsx`
- Modify: `src/components/WhatNext/WhatNext.tsx`
- Modify: `src/components/NextSubtopics/NextSubtopics.tsx`
- Modify: `src/components/AILoadingIndicator/AILoadingIndicator.tsx`
- Modify: `src/components/ReasoningNote/ReasoningNote.tsx`
- Modify: `src/lib/i18n/dict.ts`

Setiap komponen punya beberapa label/heading statik (mis. "Pertanyaan", "Loading…", "Kirim", "Berikutnya"). AI-generated content yang ada di dalamnya TIDAK ditranslate.

- [ ] **Step 1: Inventori per komponen** — `grep -E "'.*[Bb]elajar|[Pp]ertanyaan|[Kk]irim|[Jj]awab'" src/components/<name>/*.tsx` untuk shortcut.

- [ ] **Step 2: Tambah grup key per komponen** (mis. `quiz_*`, `ask_question_*`, `challenge_*`, dst.)

- [ ] **Step 3: Replace per komponen, commit per komponen**

Contoh commit messages:
```
i18n: translate Quiz UI shell
i18n: translate AskQuestion UI shell
i18n: translate ChallengeThinking UI shell
i18n: translate small UI components (KeyTakeaways, WhatNext, NextSubtopics, AILoadingIndicator, ReasoningNote)
```

- [ ] **Step 4: Final smoke test**

Jelajahi full user flow di EN dari login → dashboard → request-course → onboarding → course → subtopic → quiz → reflection → ask question → challenge thinking. Cari string Indonesian yang masih tersisa. Tangkap di task ad-hoc atau extend Task 22.

---

## Task 23: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run all tests**

```bash
npm run lint
npm run build
npx jest
npm run test:e2e:user
```

Semua harus pass.

- [ ] **Step 2: Manual checklist**

- [ ] Toggle muncul di dashboard header (mobile + desktop)
- [ ] Toggle muncul di course layout header
- [ ] Toggle muncul di onboarding intro
- [ ] Klik toggle: cookie `locale` update, DB row update, UI strings switch
- [ ] Login: cookie `locale` di-set dari DB
- [ ] Logout: cookie `locale` boleh tetap (UX guard, bukan auth)
- [ ] Konten AI yang sudah ada tetap dalam bahasa asalnya (course title, subtopic body, quiz question, ask-question response, challenge feedback)
- [ ] Admin pages tetap Indonesian (out of scope)
- [ ] Error API masih Indonesian (out of scope — Phase 3)
- [ ] No mismatch antara `<html lang>` SSR dan cookie

- [ ] **Step 3: Update docs**

Edit `CLAUDE.md` — tambah satu baris di bagian "Indonesian Naming Convention" atau buat section baru "Bilingual UI":

```markdown
### Bilingual UI (ID/EN)

User-facing UI is bilingual ID/EN. Toggle is in dashboard + course headers. Locale source of truth: `learning_profiles.preferred_language`; mirrored to non-HttpOnly cookie `locale` for SSR. AI-generated content (courses, subtopics, quizzes, AI answers) stays in its generation language and is NOT translated. Admin pages remain Indonesian. Dictionary lives at [`src/lib/i18n/dict.ts`](src/lib/i18n/dict.ts) with compile-time key parity via `satisfies`.
```

- [ ] **Step 4: Commit final**

```bash
git add CLAUDE.md
git commit -m "docs: document bilingual UI toggle in CLAUDE.md"
```

---

# Out-of-Scope: Deferred Phases (Notes Only — Tidak Diimplementasi di Plan Ini)

**Phase 3 — API error → error_code pattern** (~2-3 jam, ~26 route file)
- Refactor `return NextResponse.json({ error: 'Email atau kata sandi salah' }, ...)` → `{ error_code: 'INVALID_CREDENTIALS', error: 'Email atau kata sandi salah' }`
- Client map `error_code` ke locale lewat dictionary key `error_<code>`.
- Standardisasi Zod error messages di `src/lib/schemas.ts` ke English (LoginSchema dan RegisterSchema sudah English, AdminLoginSchema dan beberapa lainnya masih ID — campuran inkonsisten).

**Phase 4 — AI prompt `lang` parameter** (optional, only kalau ada peserta riset yang generate content baru dalam EN)
- Tambah `lang?: z.enum(['id', 'en']).optional()` ke `GenerateCourseSchema`, `GenerateSubtopicSchema`, `AskQuestionSchema`, `ChallengeThinkingSchema`, dll.
- Teruskan ke prompt template sebagai instruksi.
- Update `subtopic_cache.cache_key` agar include lang token.
- Patch hardcoded "Bahasa Indonesia" di [`src/app/api/discussion/respond/route.ts`](src/app/api/discussion/respond/route.ts) lines 281, 346 + [`src/services/discussion/generateDiscussionTemplate.ts`](src/services/discussion/generateDiscussionTemplate.ts) lines 664, 718, 792 + [`src/services/cognitive-scoring.service.ts`](src/services/cognitive-scoring.service.ts) line 200 — **HANYA jika** discussion module direaktifkan & cognitive-scoring summary perlu diakses dalam EN.

**Phase 5 — Backfill existing content** — **JANGAN**. Konten existing (~33 course, ~685 quiz, ~255 submissions) adalah research data. Translating ex-post merusak validitas RM2 prompt classifier (yang dikalibrasi untuk Indonesian) dan RM3 cognitive indicators. Konten lama tetap dalam bahasa asalnya untuk integritas tesis.

---

# Self-Review Checklist

**Spec coverage:**
- Toggle ID/EN di header ✓ (Task 6, 10, 11)
- Persistensi cookie + DB ✓ (Task 1, 4, 8, 9)
- Avoid mismatch frontend/backend/DB ✓ (compile-time parity Task 3, source-of-truth contract Task 9, schema update Task 7-8)
- Supabase analysis ✓ (Task 1 migration + cara hindari sentuh research tables)

**Placeholder scan:** No "TBD", no "implement later". Tiap step punya kode konkret atau perintah konkret. Phase 2 task secara sadar pakai "inventori dulu lalu replace" karena setiap file punya himpunan string berbeda — pola jelas, bukan placeholder.

**Type consistency:** `DictKey`, `Locale`, `LOCALE_COOKIE`, `LearningProfileRow`, `LocaleContextValue` digunakan konsisten antar task. Cookie name `locale` (LOCALE_COOKIE constant) dipakai di Provider, login route, dan layout — semua via konstanta.
