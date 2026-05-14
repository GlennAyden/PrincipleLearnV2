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

  // ── Course product tour ──────────────────────────────────────────
  tour_step1_title: 'Daftar modul & subtopic',
  tour_step1_body:
    'Di sini tersusun seluruh perjalanan belajarmu. Modul dan subtopic terbuka bertahap — mulai dari paling atas.',
  tour_step2_title: 'Modul pertamamu',
  tour_step2_body:
    'Setiap modul punya beberapa subtopic. Klik modul untuk membuka daftar subtopic-nya.',
  tour_step3_title: 'Mulai belajar',
  tour_step3_body:
    'Setiap subtopic berisi materi + alat bantu (quiz, tanya AI, challenge, refleksi). Di dalam subtopic ada tombol "?" untuk panduan fitur kapan saja.',
  tour_step4_title: 'Diskusi modul',
  tour_step4_body:
    'Di akhir tiap modul ada Diskusi Penutup. Terbuka setelah semua subtopic modul itu selesai (quiz + refleksi).',
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

  // ── Course product tour ──────────────────────────────────────────
  tour_step1_title: 'Modules & subtopics list',
  tour_step1_body:
    'Your entire learning path is laid out here. Modules and subtopics unlock in order — start from the top.',
  tour_step2_title: 'Your first module',
  tour_step2_body:
    'Each module contains several subtopics. Click a module to open its subtopic list.',
  tour_step3_title: 'Start learning',
  tour_step3_body:
    'Every subtopic has reading material plus tools (quiz, ask AI, challenge, reflection). Inside a subtopic, the "?" button opens a feature guide any time.',
  tour_step4_title: 'Module discussion',
  tour_step4_body:
    'A Closing Discussion waits at the end of each module. It unlocks once every subtopic in that module is complete (quiz + reflection).',
} as const satisfies Record<keyof typeof id, string>;

export const dict = { id, en } as const;

export type DictKey = keyof typeof id;
