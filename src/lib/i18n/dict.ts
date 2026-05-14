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

  // ── Onboarding intro slides ──────────────────────────────────────
  intro_loading: 'Memuat…',
  intro_skip: 'Lewati',
  intro_back: '← Kembali',
  intro_next: 'Lanjut →',
  intro_finish: '🚀 Mulai belajar',
  intro_finishing: 'Memuat…',
  intro_progress_label: 'Progres slide',
  intro_slide1_title: 'Selamat datang di PrincipleLearn',
  intro_slide1_body:
    'Platform belajar personal berbasis AI. Course kamu dirakit sesuai topik, tujuan, dan gaya belajarmu — bukan satu kurikulum untuk semua orang.',
  intro_slide2_title: 'Belajar dengan berpikir, bukan menghafal',
  intro_slide2_body: 'Setiap subtopic punya alat bantu yang mendorong kamu aktif:',
  intro_slide2_bullet1: 'Tanya AI kapan saja saat bingung',
  intro_slide2_bullet2: 'Quiz cepat untuk cek pemahaman',
  intro_slide2_bullet3: 'Challenge berpikir kritis + feedback AI',
  intro_slide2_bullet4: 'Jurnal refleksi untuk menguatkan ingatan',
  intro_slide3_title: 'Alurmu di sini',
  intro_slide3_body: 'Urutan belajar yang disarankan:',
  intro_slide3_bullet1: '1. Buat course sesuai topik yang ingin dikuasai',
  intro_slide3_bullet2: '2. Pelajari subtopic satu per satu',
  intro_slide3_bullet3: '3. Selesaikan quiz & tulis refleksi',
  intro_slide3_bullet4: '4. Modul selesai → Diskusi modul terbuka',
  intro_slide4_title: 'Siap mulai?',
  intro_slide4_body:
    'Kamu bisa panggil panduan ini lagi kapan saja lewat tombol bantuan di tiap subtopic. Kita mulai dari membuat course pertamamu.',

  // ── Onboarding wizard ────────────────────────────────────────────
  onboarding_loading: 'Loading...',
  onboarding_title: 'Kenali Dirimu 🎯',
  onboarding_subtitle: 'Bantu kami menyesuaikan pengalaman belajar untukmu',
  onboarding_step_identity: 'Identitas',
  onboarding_step_style: 'Gaya Belajar',
  onboarding_step_goals: 'Tujuan',
  onboarding_display_name_label: 'Nama Panggilan',
  onboarding_display_name_placeholder: 'Contoh: Budi, Sarah, dll.',
  onboarding_display_name_hint: 'Nama ini akan digunakan di dalam aplikasi',
  onboarding_experience_label: 'Pengalaman Pemrograman',
  onboarding_experience_none_label: 'Belum pernah',
  onboarding_experience_none_desc: 'Baru pertama kali belajar pemrograman',
  onboarding_experience_beginner_label: 'Pemula',
  onboarding_experience_beginner_desc: 'Pernah belajar sedikit (< 6 bulan)',
  onboarding_experience_intermediate_label: 'Menengah',
  onboarding_experience_intermediate_desc: 'Sudah punya pengalaman (6-24 bulan)',
  onboarding_experience_advanced_label: 'Mahir',
  onboarding_experience_advanced_desc: 'Berpengalaman (> 2 tahun)',
  onboarding_style_label: 'Gaya Belajar Favorit',
  onboarding_style_visual_label: 'Visual',
  onboarding_style_visual_desc: 'Lebih mudah paham lewat gambar, diagram, dan video',
  onboarding_style_reading_label: 'Membaca',
  onboarding_style_reading_desc: 'Suka membaca penjelasan tertulis yang detail',
  onboarding_style_practice_label: 'Praktik',
  onboarding_style_practice_desc: 'Belajar paling baik dengan langsung mencoba kode',
  onboarding_style_discussion_label: 'Diskusi',
  onboarding_style_discussion_desc: 'Lebih paham lewat tanya-jawab dan berdiskusi',
  onboarding_goals_label: 'Apa tujuan belajarmu? (opsional)',
  onboarding_goals_placeholder:
    'Contoh: Ingin bisa membuat website sendiri, memahami algoritma untuk karir...',
  onboarding_challenges_label: 'Apa tantangan terbesarmu dalam belajar? (opsional)',
  onboarding_challenges_placeholder:
    'Contoh: Sulit memahami konsep abstrak, kurang waktu untuk latihan...',
  onboarding_back: '← Kembali',
  onboarding_next: 'Lanjut →',
  onboarding_finish: '🚀 Mulai Belajar',
  onboarding_saving: 'Menyimpan...',

  // ── Request course wizard — step 1 ───────────────────────────────
  request_course_dashboard_link: 'Dasbor',
  request_course_step1_title: 'Apa yang ingin kamu pelajari?',
  request_course_step1_subtitle: 'Beritahu kami topik dan tujuan belajarmu',
  request_course_step1_topic_label: 'Topik',
  request_course_step1_topic_placeholder:
    'contoh: Machine Learning, Pengembangan Web, Data Science...',
  request_course_step1_goal_label: 'Tujuan Belajar',
  request_course_step1_goal_placeholder:
    'Apa yang ingin kamu capai dengan mempelajari topik ini?',
  request_course_step1_continue: 'Lanjut',
  request_course_step1_fill_both: 'Mohon isi kedua kolom',

  // ── Request course wizard — step 2 ───────────────────────────────
  request_course_step2_back: 'Kembali',
  request_course_step2_title: 'Level pengetahuanmu',
  request_course_step2_subtitle: 'Bantu kami menyesuaikan tingkat kesulitan kursus',
  request_course_step2_pick_level: 'Pilih level pengetahuanmu',
  request_course_step2_level_beginner_label: 'Beginner',
  request_course_step2_level_beginner_desc: 'Mulai dari dasar',
  request_course_step2_level_intermediate_label: 'Intermediate',
  request_course_step2_level_intermediate_desc: 'Sudah punya pengetahuan dasar',
  request_course_step2_level_advanced_label: 'Advanced',
  request_course_step2_level_advanced_desc: 'Pembahasan mendalam & topik lanjutan',
  request_course_step2_extra_label: 'Topik spesifik yang ingin dipelajari',
  request_course_step2_extra_optional: '(opsional)',
  request_course_step2_extra_placeholder:
    'contoh: Neural Networks, Transfer Learning, NLP...',
  request_course_step2_continue: 'Lanjut',
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

  // ── Onboarding intro slides ──────────────────────────────────────
  intro_loading: 'Loading…',
  intro_skip: 'Skip',
  intro_back: '← Back',
  intro_next: 'Next →',
  intro_finish: '🚀 Start learning',
  intro_finishing: 'Loading…',
  intro_progress_label: 'Slide progress',
  intro_slide1_title: 'Welcome to PrincipleLearn',
  intro_slide1_body:
    'A personal, AI-powered learning platform. Your course is built around your topic, goal, and learning style — not a one-size-fits-all curriculum.',
  intro_slide2_title: 'Learn by thinking, not memorising',
  intro_slide2_body: 'Every subtopic ships with tools that keep you active:',
  intro_slide2_bullet1: 'Ask AI any time you get stuck',
  intro_slide2_bullet2: 'Quick quizzes to check your understanding',
  intro_slide2_bullet3: 'Critical-thinking challenges with AI feedback',
  intro_slide2_bullet4: 'A reflection journal to lock in what you learned',
  intro_slide3_title: 'Your flow here',
  intro_slide3_body: 'The suggested learning order:',
  intro_slide3_bullet1: '1. Create a course around a topic you want to master',
  intro_slide3_bullet2: '2. Work through the subtopics one by one',
  intro_slide3_bullet3: '3. Finish the quiz and write your reflection',
  intro_slide3_bullet4: '4. Module complete → the module Discussion unlocks',
  intro_slide4_title: 'Ready to start?',
  intro_slide4_body:
    'You can pull up this guide any time via the help button in each subtopic. Let’s begin by creating your first course.',

  // ── Onboarding wizard ────────────────────────────────────────────
  onboarding_loading: 'Loading...',
  onboarding_title: 'Get to Know You 🎯',
  onboarding_subtitle: 'Help us tailor the learning experience to you',
  onboarding_step_identity: 'Identity',
  onboarding_step_style: 'Learning Style',
  onboarding_step_goals: 'Goals',
  onboarding_display_name_label: 'Display Name',
  onboarding_display_name_placeholder: 'e.g. Budi, Sarah, ...',
  onboarding_display_name_hint: 'This name will be used inside the app',
  onboarding_experience_label: 'Programming Experience',
  onboarding_experience_none_label: 'Never',
  onboarding_experience_none_desc: 'Learning programming for the first time',
  onboarding_experience_beginner_label: 'Beginner',
  onboarding_experience_beginner_desc: 'A little experience (< 6 months)',
  onboarding_experience_intermediate_label: 'Intermediate',
  onboarding_experience_intermediate_desc: 'Some experience (6-24 months)',
  onboarding_experience_advanced_label: 'Advanced',
  onboarding_experience_advanced_desc: 'Experienced (> 2 years)',
  onboarding_style_label: 'Preferred Learning Style',
  onboarding_style_visual_label: 'Visual',
  onboarding_style_visual_desc: 'Learn best through images, diagrams, and videos',
  onboarding_style_reading_label: 'Reading',
  onboarding_style_reading_desc: 'Enjoy detailed written explanations',
  onboarding_style_practice_label: 'Practice',
  onboarding_style_practice_desc: 'Learn best by writing code hands-on',
  onboarding_style_discussion_label: 'Discussion',
  onboarding_style_discussion_desc: 'Understand best through Q&A and conversation',
  onboarding_goals_label: 'What is your learning goal? (optional)',
  onboarding_goals_placeholder:
    'e.g. Build my own website, understand algorithms for a career change...',
  onboarding_challenges_label: 'What is your biggest learning challenge? (optional)',
  onboarding_challenges_placeholder:
    'e.g. Trouble grasping abstract concepts, limited practice time...',
  onboarding_back: '← Back',
  onboarding_next: 'Next →',
  onboarding_finish: '🚀 Start Learning',
  onboarding_saving: 'Saving...',

  // ── Request course wizard — step 1 ───────────────────────────────
  request_course_dashboard_link: 'Dashboard',
  request_course_step1_title: 'What do you want to learn?',
  request_course_step1_subtitle: 'Tell us your topic and learning goal',
  request_course_step1_topic_label: 'Topic',
  request_course_step1_topic_placeholder:
    'e.g. Machine Learning, Web Development, Data Science...',
  request_course_step1_goal_label: 'Learning Goal',
  request_course_step1_goal_placeholder:
    'What do you want to achieve by studying this topic?',
  request_course_step1_continue: 'Continue',
  request_course_step1_fill_both: 'Please fill in both fields',

  // ── Request course wizard — step 2 ───────────────────────────────
  request_course_step2_back: 'Back',
  request_course_step2_title: 'Your knowledge level',
  request_course_step2_subtitle: 'Helps us tune the course difficulty to you',
  request_course_step2_pick_level: 'Please pick your knowledge level',
  request_course_step2_level_beginner_label: 'Beginner',
  request_course_step2_level_beginner_desc: 'Start from the basics',
  request_course_step2_level_intermediate_label: 'Intermediate',
  request_course_step2_level_intermediate_desc: 'Already have the fundamentals',
  request_course_step2_level_advanced_label: 'Advanced',
  request_course_step2_level_advanced_desc: 'In-depth coverage and advanced topics',
  request_course_step2_extra_label: 'Specific topics you want to learn',
  request_course_step2_extra_optional: '(optional)',
  request_course_step2_extra_placeholder:
    'e.g. Neural Networks, Transfer Learning, NLP...',
  request_course_step2_continue: 'Continue',
} as const satisfies Record<keyof typeof id, string>;

export const dict = { id, en } as const;

export type DictKey = keyof typeof id;
