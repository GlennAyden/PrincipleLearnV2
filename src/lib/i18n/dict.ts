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
} as const satisfies Record<keyof typeof id, string>;

export const dict = { id, en } as const;

export type DictKey = keyof typeof id;
