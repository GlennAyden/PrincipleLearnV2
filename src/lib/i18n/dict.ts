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

  // ── Course layout sidebar / nav alert ────────────────────────────
  course_nav_alert_close: 'Tutup pesan',
  course_module_locked_default: 'Selesaikan modul sebelumnya terlebih dahulu.',
  course_item_locked_default: 'Selesaikan langkah sebelumnya terlebih dahulu.',
  course_sidebar_label: 'Kursus',
  course_sidebar_expand: 'Buka sidebar',
  course_sidebar_collapse: 'Sembunyikan sidebar',

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

  // ── Request course wizard — step 3 ───────────────────────────────
  request_course_step3_back: 'Kembali',
  request_course_step3_loading: 'Memuat...',
  request_course_step3_title: 'Konteks & Asumsi',
  request_course_step3_subtitle: 'Bantu AI memahami kebutuhanmu di dunia nyata',
  request_course_step3_problem_label: 'Masalah dunia nyata',
  request_course_step3_problem_placeholder:
    'Sebutkan satu masalah nyata yang ingin kamu selesaikan dengan mempelajari ini...',
  request_course_step3_assumption_label: 'Asumsi awal',
  request_course_step3_assumption_placeholder:
    'Apa asumsi awalmu tentang materi ini sebelum kamu mulai belajar?',
  request_course_step3_generate: 'Buat Kursus',
  request_course_step3_fill_both: 'Mohon isi kedua kolom',
  request_course_step3_must_login: 'Kamu harus masuk untuk membuat kursus',
  request_course_step3_incomplete:
    'Data topik/level belum lengkap. Kembali ke langkah 1.',

  // ── StructuredReflection ────────────────────────────────────────
  reflection_title: 'Refleksi & Feedback',
  reflection_subtitle:
    'Semua bagian refleksi wajib diisi. Masukan materi tetap opsional.',
  reflection_loading: 'Memuat refleksi terakhir...',
  reflection_already_submitted: 'Refleksi subtopik ini sudah tersimpan.',
  reflection_revision_hint:
    'Form ini berisi versi terakhir dan tetap bisa diperbarui sebagai revisi.',
  reflection_revision_count_prefix: 'Total revisi',
  reflection_saved_revision: 'Revisi refleksi berhasil tersimpan.',
  reflection_saved_first:
    'Refleksi berhasil tersimpan. Kamu bisa melanjutkan setelah ini.',
  reflection_saved_subtext: 'Perubahan baru tersimpan di server.',
  reflection_rating_label: 'Seberapa puas kamu dengan materi ini?',
  reflection_feedback_placeholder: 'Ada masukan untuk materi ini? (opsional)',
  reflection_divider: 'Refleksi Belajar',
  reflection_progress_suffix: 'terisi',
  reflection_error_required:
    'Harap isi semua bagian refleksi dan rating sebelum melanjutkan.',
  reflection_error_load: 'Gagal memuat status refleksi',
  reflection_error_save: 'Gagal menyimpan refleksi',
  reflection_error_unknown: 'Unknown error',
  reflection_missing_hint:
    'Harap isi feedback dulu: empat textarea refleksi dan rating bintang wajib terisi.',
  reflection_button_loading: 'Menyimpan...',
  reflection_button_save_revision: 'Simpan Revisi',
  reflection_button_save_first: 'Simpan Refleksi & Feedback',
  reflection_star_low: 'Kurang',
  reflection_star_ok: 'Cukup',
  reflection_star_good: 'Baik',
  reflection_star_great: 'Sangat Baik',
  reflection_star_excellent: 'Luar Biasa',
  reflection_understood_title: 'Apa yang Saya Pahami',
  reflection_understood_question: 'Apa hal utama yang saya pahami hari ini?',
  reflection_understood_placeholder:
    'Contoh: Saya sekarang mengerti bahwa loop while terus berjalan selama kondisinya benar...',
  reflection_confused_title: 'Yang Masih Membingungkan',
  reflection_confused_question: 'Apa yang masih salah atau membingungkan?',
  reflection_confused_placeholder:
    'Contoh: Saya masih bingung kapan harus memilih for vs while loop...',
  reflection_strategy_title: 'Strategi ke Depan',
  reflection_strategy_question: 'Apa strategi belajar saya selanjutnya?',
  reflection_strategy_placeholder:
    'Contoh: Saya akan mencoba membuat 3 program kecil yang menggunakan kedua jenis loop...',
  reflection_prompt_evolution_title: 'Evolusi Cara Bertanya',
  reflection_prompt_evolution_question:
    'Bagaimana cara saya bertanya berubah dari sesi sebelumnya?',
  reflection_prompt_evolution_placeholder:
    'Contoh: Awalnya saya hanya bertanya "apa itu loop", sekarang saya bertanya lebih spesifik...',

  // ── Subtopic page ───────────────────────────────────────────────
  subtopic_loading_course: 'Memuat kursus…',
  subtopic_error_course_not_found: 'Kursus tidak ditemukan',
  subtopic_skeleton_section_prefix: 'Memuat section',
  subtopic_skeleton_section_separator: 'dari',
  subtopic_error_course_load: 'Failed to load course data',
  subtopic_error_invalid_module: 'Invalid module or subtopic',
  subtopic_error_progress_prefix: 'Gagal memuat progres belajar',
  subtopic_error_progress_suffix:
    'Silakan coba lagi sebelum melanjutkan materi.',
  subtopic_error_locked:
    'Selesaikan langkah sebelumnya terlebih dahulu sebelum membuka subtopik ini.',
  subtopic_error_session_expired:
    'Sesi Anda telah berakhir. Mengalihkan ke halaman login...',
  subtopic_error_forbidden:
    'Selesaikan langkah sebelumnya terlebih dahulu sebelum membuka subtopic ini',
  subtopic_error_not_found: 'Course atau subtopic tidak ditemukan',
  subtopic_error_rate_limit:
    'Terlalu banyak permintaan ke AI. Tunggu beberapa detik lalu tekan "Coba lagi".',
  subtopic_error_load_generic_prefix: 'Gagal memuat subtopic',
  subtopic_error_load_retry_suffix: 'Tekan "Coba lagi" untuk mengulang.',
  subtopic_error_unknown: 'Unknown error',
  subtopic_error_quiz_regenerate: 'Gagal membuat kuis baru',
  subtopic_success_quiz_saved: 'Kuis berhasil tersimpan. Kamu bisa melanjutkan.',
  subtopic_success_reflection_saved:
    'Refleksi tersimpan. Klik Selesai untuk menutup subtopik.',
  subtopic_nav_warn_quiz_first:
    'Selesaikan kuis terlebih dahulu. Hasil kuis harus berhasil tersimpan sebelum lanjut.',
  subtopic_nav_warn_quiz_before_close:
    'Selesaikan kuis terlebih dahulu sebelum menutup subtopik ini.',
  subtopic_nav_warn_reflection_first:
    'Harap mengisi feedback dulu. Refleksi harus berhasil tersimpan sebelum lanjut.',
  subtopic_examples_error_prefix: 'Gagal generate contoh',
  subtopic_challenge_save_error_server:
    'Respons tantanganmu belum tersimpan di server',
  subtopic_challenge_save_error_server_status: 'Server mengembalikan status',
  subtopic_challenge_save_error_retry: 'Silakan coba lagi.',
  subtopic_challenge_save_error_network:
    'Respons tantanganmu belum tersimpan: koneksi terputus. Silakan coba lagi.',
  subtopic_retry_button: 'Coba lagi',
  subtopic_tab_ask: 'Tanya Pertanyaan',
  subtopic_tab_challenge: 'Tantang Pemikiranku',
  subtopic_tab_examples: 'Beri Contoh',
  subtopic_history_title: 'Tantangan Sebelumnya:',
  subtopic_answer_label: 'Jawabanmu:',
  subtopic_reasoning_label: 'Penalaranmu:',
  subtopic_new_challenge: 'Coba Tantangan Baru',
  subtopic_pending_save_note_pre: 'Umpan balik AI sudah dibuat, tetapi respons ini belum tersimpan ke server. Tekan',
  subtopic_pending_save_note_post: 'lagi untuk mencoba menyimpan ulang.',
  subtopic_pending_save_action: 'Submit',
  subtopic_regenerate_title: 'Buat pertanyaan tantangan baru',
  subtopic_regenerate_label: 'Buat Ulang',
  subtopic_answer_placeholder: 'Ketik jawabanmu di sini...',
  subtopic_reasoning_placeholder: 'Mengapa kamu memilih jawaban ini? (opsional)',
  subtopic_submit_button: 'Submit',
  subtopic_loading_preparing: 'Menyiapkan pertanyaan...',
  subtopic_loading_analyzing: 'Menganalisis materi...',
  subtopic_loading_almost: 'Hampir siap...',
  subtopic_new_question_button: 'Buat Pertanyaan Baru',
  subtopic_generate_question_button: 'Generate Pertanyaan',
  subtopic_section_takeaways_title: '💡 Poin Penting',
  subtopic_section_takeaways_desc:
    'Poin-poin penting yang perlu Anda ingat dari materi ini',
  subtopic_section_quiz_title: '🧠 Waktu Kuis!',
  subtopic_section_quiz_desc:
    'Uji pemahaman Anda tentang materi yang telah dipelajari',
  subtopic_section_feedback_title: '📝 Umpan Balik & Langkah Selanjutnya',
  subtopic_section_feedback_desc:
    'Berikan masukan dan lihat langkah selanjutnya dalam pembelajaran Anda',
  subtopic_nav_syncing: 'Menyinkronkan progres…',
  subtopic_nav_back: 'Kembali',
  subtopic_nav_finish: 'Selesai',
  subtopic_nav_next: 'Selanjutnya',

  // ── Course overview page ────────────────────────────────────────
  course_overview_loading: 'Kursus tidak ditemukan',
  course_overview_error_no_access: 'Anda tidak memiliki akses ke kursus ini',
  course_overview_error_not_found: 'Kursus tidak ditemukan',
  course_overview_error_load_failed: 'Gagal memuat kursus',
  course_overview_error_no_content: 'Course has no content available',
  course_overview_error_corrupt:
    'Data kursus rusak. Silakan hubungi admin atau coba membuat kursus baru.',
  course_overview_error_generic: 'Failed to load course',
  course_overview_error_loading: 'Error loading course',
  course_overview_error_no_outline: 'No course content available.',
  course_overview_error_prefix: 'Error',
  course_overview_retry: 'Coba Lagi',
  course_overview_progress_unavailable:
    'Gagal memuat progres belajar. Silakan coba lagi sebelum membuka materi atau diskusi.',
  course_overview_description:
    'Pelajari konsep-konsep utama dalam modul ini dan kuasai aplikasinya.',
  course_overview_summary_placeholder:
    'Ringkasan singkat subtopik akan segera tersedia.',
  course_overview_detail_hide: 'Sembunyikan detail',
  course_overview_detail_show: 'Lihat detail',
  course_overview_button_locked: 'Terkunci',
  course_overview_button_view: 'Lihat Materi',
  course_overview_button_continue: 'Lanjutkan Materi',
  course_overview_button_start: 'Mulai Materi',
  course_overview_locked_default: 'Selesaikan langkah sebelumnya terlebih dahulu.',
  course_overview_discussion_title: 'Diskusi Wajib',
  course_overview_discussion_status_completed: 'Selesai',
  course_overview_discussion_status_failed: 'Gagal',
  course_overview_discussion_status_in_progress: 'Berlangsung',
  course_overview_discussion_status_locked: 'Terkunci',
  course_overview_discussion_status_ready: 'Siap',
  course_overview_discussion_phase_label: 'Fase saat ini',
  course_overview_discussion_goals_suffix: 'tujuan tercapai',
  course_overview_discussion_locked_default:
    'Diskusi akan terbuka setelah semua prasyarat selesai.',
  course_overview_discussion_locked_warn:
    'Selesaikan prasyarat modul terlebih dahulu.',
  course_overview_discussion_close_aria: 'Tutup pesan',
  course_overview_discussion_btn_locked: 'Terkunci',
  course_overview_discussion_btn_start: 'Mulai Diskusi Wajib',
  course_overview_discussion_btn_summary: 'Lihat Ringkasan Diskusi Wajib',
  course_overview_discussion_btn_continue: 'Lanjutkan Diskusi Wajib',
  course_overview_discussion_load_error: 'Gagal memuat status diskusi',
  course_overview_phase_diagnosis: 'Diagnosis',
  course_overview_phase_explanation: 'Penjelasan',
  course_overview_phase_practice: 'Latihan',
  course_overview_phase_consolidation: 'Konsolidasi',
  course_overview_phase_completed: 'Selesai',
  course_overview_phase_not_started: 'Belum Mulai',
  course_overview_discussion_body_module_part1:
    'Langkah wajib untuk menutup seluruh materi dalam modul',
  course_overview_discussion_body_module_part2:
    'lewat dialog Socratic empat fase. Mentor virtual akan membantu menilai capaian setiap subtopik dan memberikan umpan balik.',
  course_overview_discussion_body_subtopic_part1:
    'Langkah wajib untuk menutup subtopik',
  course_overview_discussion_body_subtopic_part2: 'dalam modul',
  course_overview_discussion_body_subtopic_part3:
    'melalui dialog Socratic empat fase. Mentor virtual akan mengecek capaian dan memberi umpan balik.',

  // ── PromptBuilder ────────────────────────────────────────────────
  prompt_mode_simple: '⚡ Langsung',
  prompt_mode_guided: '🧭 Guided Builder',
  prompt_simple_placeholder: 'Tanyakan apapun yang ingin Anda ketahui...',
  prompt_simple_submit: 'Kirim',
  prompt_simple_sending: '...',
  prompt_reasoning_title: 'Satu langkah lagi!',
  prompt_reasoning_subtitle:
    'Kenapa kamu menanyakan ini? (Membantu pengajar memahami proses berpikirmu)',
  prompt_reasoning_placeholder: 'Saya menanyakan ini karena...',
  prompt_reasoning_skip: 'Lewati →',
  prompt_reasoning_submit: '🚀 Kirim Pertanyaan',
  prompt_reasoning_sending: 'Mengirim...',
  prompt_label_tujuan: 'Apa yang ingin kamu ketahui?',
  prompt_label_tujuan_required: 'wajib',
  prompt_tujuan_placeholder: 'Tulis pertanyaanmu di sini...',
  prompt_expand_more: 'Tambah detail agar jawaban AI lebih tepat',
  prompt_label_konteks: 'Konteksmu',
  prompt_label_konteks_optional: 'opsional',
  prompt_konteks_placeholder: 'Apa yang sudah kamu ketahui atau coba sebelumnya...',
  prompt_label_batasan: 'Format jawaban yang diinginkan',
  prompt_label_batasan_optional: 'opsional',
  prompt_batasan_placeholder:
    'Mau dijawab pakai bahasa tertentu, dengan contoh, atau analogi?',
  prompt_collapse_details: '▲ Sembunyikan detail',
  prompt_guided_submit: 'Kirim Pertanyaan',
  prompt_guided_sending: 'Mengirim...',
  prompt_loading_processing: 'Memproses pertanyaan...',
  prompt_loading_drafting: 'Menyusun jawaban...',
  prompt_loading_almost: 'Hampir selesai...',
  prompt_chip_tujuan_1: 'Saya ingin memahami bagaimana...',
  prompt_chip_tujuan_2: 'Tolong jelaskan tentang...',
  prompt_chip_tujuan_3: 'Apa perbedaan antara...',
  prompt_chip_konteks_1: 'Yang sudah saya ketahui adalah...',
  prompt_chip_konteks_2: 'Saya sudah mencoba, tapi...',
  prompt_chip_konteks_3: 'Saya masih bingung tentang...',
  prompt_chip_batasan_1: 'Jelaskan dengan bahasa sederhana',
  prompt_chip_batasan_2: 'Berikan contoh kode',
  prompt_chip_batasan_3: 'Gunakan analogi kehidupan nyata',
  prompt_chip_batasan_4: 'Maksimal 3 paragraf',

  // ── Request course wizard — generating ───────────────────────────
  request_course_generating_stage_sending_label: 'Mengirim Permintaan',
  request_course_generating_stage_sending_desc: 'Mengirim detail kursus ke server...',
  request_course_generating_stage_ai_label: 'Proses AI',
  request_course_generating_stage_ai_desc: 'AI sedang membuat outline kursusmu...',
  request_course_generating_stage_processing_label: 'Memproses Respons',
  request_course_generating_stage_processing_desc:
    'Memeriksa dan memvalidasi respons AI...',
  request_course_generating_stage_saving_label: 'Menyimpan Kursus',
  request_course_generating_stage_saving_desc: 'Menyimpan kursus ke database...',
  request_course_generating_stage_complete_label: 'Selesai!',
  request_course_generating_stage_complete_desc:
    'Kursus berhasil dibuat! Mengalihkan...',
  request_course_generating_stage_error_label: 'Error',
  request_course_generating_stage_error_desc: 'Terjadi kesalahan.',
  request_course_generating_tip1: 'Menyusun modul berdasarkan level belajarmu...',
  request_course_generating_tip2: 'Menghubungkan topik dengan masalah nyatamu...',
  request_course_generating_tip3: 'Membangun jalur pembelajaran bertahap...',
  request_course_generating_tip4: 'Menyesuaikan konten dengan tujuanmu...',
  request_course_generating_tip5:
    'Mengorganisir subtopik untuk pemahaman optimal...',
  request_course_generating_tip6: 'Hampir selesai — menyempurnakan outline...',
  request_course_generating_in_flight:
    'Pembuatan kursus sudah berjalan di tab ini. Tunggu hingga selesai atau kembali ke step sebelumnya untuk mulai ulang.',
  request_course_generating_before_unload:
    'Kursusmu sedang dibuat. Keluar sekarang akan membatalkan proses.',
  request_course_generating_timeout:
    'Pembuatan kursus timeout. Coba lagi dengan topik yang lebih sederhana.',
  request_course_generating_server_error:
    'Terjadi error server. Coba lagi beberapa saat.',
  request_course_generating_unexpected_status:
    'Respons server tidak terduga. Coba lagi.',
  request_course_generating_cancelled: 'Pembuatan kursus dibatalkan.',
  request_course_generating_unexpected_error: 'Terjadi kesalahan tidak terduga',
  request_course_generating_retry: 'Kembali & Coba Lagi',
  request_course_generating_summary_topic: 'Topik',
  request_course_generating_summary_level: 'Level',
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

  // ── Course layout sidebar / nav alert ────────────────────────────
  course_nav_alert_close: 'Close message',
  course_module_locked_default: 'Complete the previous module first.',
  course_item_locked_default: 'Complete the previous step first.',
  course_sidebar_label: 'Courses',
  course_sidebar_expand: 'Expand sidebar',
  course_sidebar_collapse: 'Collapse sidebar',

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

  // ── Request course wizard — step 3 ───────────────────────────────
  request_course_step3_back: 'Back',
  request_course_step3_loading: 'Loading...',
  request_course_step3_title: 'Context & Assumptions',
  request_course_step3_subtitle: 'Help the AI understand your real-world needs',
  request_course_step3_problem_label: 'Real-world problem',
  request_course_step3_problem_placeholder:
    'Name one real-world problem you want to solve by learning this...',
  request_course_step3_assumption_label: 'Initial assumption',
  request_course_step3_assumption_placeholder:
    'What is your initial assumption about this topic before you start?',
  request_course_step3_generate: 'Create Course',
  request_course_step3_fill_both: 'Please fill in both fields',
  request_course_step3_must_login: 'You must be logged in to create a course',
  request_course_step3_incomplete:
    'Topic / level data is incomplete. Going back to step 1.',

  // ── StructuredReflection ────────────────────────────────────────
  reflection_title: 'Reflection & Feedback',
  reflection_subtitle:
    'All reflection sections are required. Course feedback stays optional.',
  reflection_loading: 'Loading your latest reflection...',
  reflection_already_submitted: 'This subtopic reflection is saved.',
  reflection_revision_hint:
    'This form shows the latest version and can still be updated as a revision.',
  reflection_revision_count_prefix: 'Total revisions',
  reflection_saved_revision: 'Reflection revision saved.',
  reflection_saved_first:
    'Reflection saved. You can continue after this.',
  reflection_saved_subtext: 'The latest changes are stored on the server.',
  reflection_rating_label: 'How satisfied are you with this material?',
  reflection_feedback_placeholder: 'Any feedback on this material? (optional)',
  reflection_divider: 'Learning Reflection',
  reflection_progress_suffix: 'filled',
  reflection_error_required:
    'Please complete every reflection section and the rating before continuing.',
  reflection_error_load: 'Failed to load reflection status',
  reflection_error_save: 'Failed to save reflection',
  reflection_error_unknown: 'Unknown error',
  reflection_missing_hint:
    'Please fill in the feedback first: all four reflection textareas and the star rating are required.',
  reflection_button_loading: 'Saving...',
  reflection_button_save_revision: 'Save Revision',
  reflection_button_save_first: 'Save Reflection & Feedback',
  reflection_star_low: 'Poor',
  reflection_star_ok: 'Fair',
  reflection_star_good: 'Good',
  reflection_star_great: 'Very Good',
  reflection_star_excellent: 'Excellent',
  reflection_understood_title: 'What I Understood',
  reflection_understood_question: 'What is the main thing I understood today?',
  reflection_understood_placeholder:
    'Example: I now understand that a while loop keeps running as long as its condition is true...',
  reflection_confused_title: 'What Is Still Confusing',
  reflection_confused_question: 'What is still wrong or confusing?',
  reflection_confused_placeholder:
    'Example: I am still unsure when to choose for vs while loops...',
  reflection_strategy_title: 'Next Strategy',
  reflection_strategy_question: 'What is my next learning strategy?',
  reflection_strategy_placeholder:
    'Example: I will try to build 3 small programs that use both loop types...',
  reflection_prompt_evolution_title: 'How My Questions Evolved',
  reflection_prompt_evolution_question:
    'How did the way I ask questions change from previous sessions?',
  reflection_prompt_evolution_placeholder:
    'Example: I used to just ask "what is a loop", now I ask more specific questions...',

  // ── Subtopic page ───────────────────────────────────────────────
  subtopic_loading_course: 'Loading course…',
  subtopic_error_course_not_found: 'Course not found',
  subtopic_skeleton_section_prefix: 'Loading section',
  subtopic_skeleton_section_separator: 'of',
  subtopic_error_course_load: 'Failed to load course data',
  subtopic_error_invalid_module: 'Invalid module or subtopic',
  subtopic_error_progress_prefix: 'Failed to load learning progress',
  subtopic_error_progress_suffix:
    'Please try again before continuing with the material.',
  subtopic_error_locked:
    'Please complete the previous step before opening this subtopic.',
  subtopic_error_session_expired:
    'Your session has expired. Redirecting to the login page...',
  subtopic_error_forbidden:
    'Please complete the previous step before opening this subtopic',
  subtopic_error_not_found: 'Course or subtopic not found',
  subtopic_error_rate_limit:
    'Too many requests to AI. Wait a few seconds, then press "Try again".',
  subtopic_error_load_generic_prefix: 'Failed to load subtopic',
  subtopic_error_load_retry_suffix: 'Press "Try again" to retry.',
  subtopic_error_unknown: 'Unknown error',
  subtopic_error_quiz_regenerate: 'Failed to create a new quiz',
  subtopic_success_quiz_saved: 'Quiz saved successfully. You can continue.',
  subtopic_success_reflection_saved:
    'Reflection saved. Click Finish to close the subtopic.',
  subtopic_nav_warn_quiz_first:
    'Complete the quiz first. Your quiz result must be saved before continuing.',
  subtopic_nav_warn_quiz_before_close:
    'Complete the quiz first before closing this subtopic.',
  subtopic_nav_warn_reflection_first:
    'Please fill out the feedback first. Reflection must be saved before continuing.',
  subtopic_examples_error_prefix: 'Failed to generate examples',
  subtopic_challenge_save_error_server:
    'Your challenge response has not been saved on the server',
  subtopic_challenge_save_error_server_status: 'Server returned status',
  subtopic_challenge_save_error_retry: 'Please try again.',
  subtopic_challenge_save_error_network:
    'Your challenge response was not saved: connection lost. Please try again.',
  subtopic_retry_button: 'Try again',
  subtopic_tab_ask: 'Ask a Question',
  subtopic_tab_challenge: 'Challenge My Thinking',
  subtopic_tab_examples: 'Give Examples',
  subtopic_history_title: 'Previous Challenges:',
  subtopic_answer_label: 'Your answer:',
  subtopic_reasoning_label: 'Your reasoning:',
  subtopic_new_challenge: 'Try a New Challenge',
  subtopic_pending_save_note_pre: 'The AI feedback was generated, but the response has not been saved to the server. Press',
  subtopic_pending_save_note_post: 'again to retry saving.',
  subtopic_pending_save_action: 'Submit',
  subtopic_regenerate_title: 'Generate a new challenge question',
  subtopic_regenerate_label: 'Regenerate',
  subtopic_answer_placeholder: 'Type your answer here...',
  subtopic_reasoning_placeholder: 'Why did you choose this answer? (optional)',
  subtopic_submit_button: 'Submit',
  subtopic_loading_preparing: 'Preparing question...',
  subtopic_loading_analyzing: 'Analyzing the material...',
  subtopic_loading_almost: 'Almost ready...',
  subtopic_new_question_button: 'Generate a New Question',
  subtopic_generate_question_button: 'Generate Question',
  subtopic_section_takeaways_title: '💡 Key Takeaways',
  subtopic_section_takeaways_desc:
    'The key points to remember from this material',
  subtopic_section_quiz_title: '🧠 Quiz Time!',
  subtopic_section_quiz_desc:
    'Test your understanding of the material you have studied',
  subtopic_section_feedback_title: '📝 Feedback & Next Steps',
  subtopic_section_feedback_desc:
    'Share your feedback and see the next steps in your learning',
  subtopic_nav_syncing: 'Syncing progress…',
  subtopic_nav_back: 'Back',
  subtopic_nav_finish: 'Finish',
  subtopic_nav_next: 'Next',

  // ── Course overview page ────────────────────────────────────────
  course_overview_loading: 'Course not found',
  course_overview_error_no_access: 'You do not have access to this course',
  course_overview_error_not_found: 'Course not found',
  course_overview_error_load_failed: 'Failed to load course',
  course_overview_error_no_content: 'Course has no content available',
  course_overview_error_corrupt:
    'Course data is corrupted. Please contact admin or try creating a new course.',
  course_overview_error_generic: 'Failed to load course',
  course_overview_error_loading: 'Error loading course',
  course_overview_error_no_outline: 'No course content available.',
  course_overview_error_prefix: 'Error',
  course_overview_retry: 'Try Again',
  course_overview_progress_unavailable:
    'Failed to load learning progress. Please try again before opening materials or discussions.',
  course_overview_description:
    'Learn the key concepts in this module and master their applications.',
  course_overview_summary_placeholder:
    'A brief subtopic overview will be available soon.',
  course_overview_detail_hide: 'Hide details',
  course_overview_detail_show: 'View details',
  course_overview_button_locked: 'Locked',
  course_overview_button_view: 'View Material',
  course_overview_button_continue: 'Continue',
  course_overview_button_start: 'Start',
  course_overview_locked_default: 'Complete the previous step first.',
  course_overview_discussion_title: 'Required Discussion',
  course_overview_discussion_status_completed: 'Completed',
  course_overview_discussion_status_failed: 'Failed',
  course_overview_discussion_status_in_progress: 'In progress',
  course_overview_discussion_status_locked: 'Locked',
  course_overview_discussion_status_ready: 'Ready',
  course_overview_discussion_phase_label: 'Current phase',
  course_overview_discussion_goals_suffix: 'goals reached',
  course_overview_discussion_locked_default:
    'The discussion unlocks once all prerequisites are complete.',
  course_overview_discussion_locked_warn:
    'Complete the module prerequisites first.',
  course_overview_discussion_close_aria: 'Close message',
  course_overview_discussion_btn_locked: 'Locked',
  course_overview_discussion_btn_start: 'Start Required Discussion',
  course_overview_discussion_btn_summary: 'View Discussion Summary',
  course_overview_discussion_btn_continue: 'Continue Discussion',
  course_overview_discussion_load_error: 'Failed to load discussion status',
  course_overview_phase_diagnosis: 'Diagnosis',
  course_overview_phase_explanation: 'Explanation',
  course_overview_phase_practice: 'Practice',
  course_overview_phase_consolidation: 'Consolidation',
  course_overview_phase_completed: 'Completed',
  course_overview_phase_not_started: 'Not started',
  course_overview_discussion_body_module_part1:
    'A required step to close out the entire module',
  course_overview_discussion_body_module_part2:
    'via a four-phase Socratic dialogue. The virtual mentor will help assess your progress on each subtopic and provide feedback.',
  course_overview_discussion_body_subtopic_part1:
    'A required step to close out the subtopic',
  course_overview_discussion_body_subtopic_part2: 'in the module',
  course_overview_discussion_body_subtopic_part3:
    'via a four-phase Socratic dialogue. The virtual mentor will check your progress and give feedback.',

  // ── PromptBuilder ────────────────────────────────────────────────
  prompt_mode_simple: '⚡ Quick',
  prompt_mode_guided: '🧭 Guided Builder',
  prompt_simple_placeholder: 'Ask anything you want to know...',
  prompt_simple_submit: 'Send',
  prompt_simple_sending: '...',
  prompt_reasoning_title: 'One more step!',
  prompt_reasoning_subtitle:
    'Why are you asking this? (Helps the teacher understand your thinking)',
  prompt_reasoning_placeholder: 'I am asking this because...',
  prompt_reasoning_skip: 'Skip →',
  prompt_reasoning_submit: '🚀 Send Question',
  prompt_reasoning_sending: 'Sending...',
  prompt_label_tujuan: 'What do you want to know?',
  prompt_label_tujuan_required: 'required',
  prompt_tujuan_placeholder: 'Write your question here...',
  prompt_expand_more: 'Add details so the AI answer is more accurate',
  prompt_label_konteks: 'Your context',
  prompt_label_konteks_optional: 'optional',
  prompt_konteks_placeholder: 'What you already know or have tried before...',
  prompt_label_batasan: 'Preferred answer format',
  prompt_label_batasan_optional: 'optional',
  prompt_batasan_placeholder:
    'Want it answered in a certain style, with examples, or an analogy?',
  prompt_collapse_details: '▲ Hide details',
  prompt_guided_submit: 'Send Question',
  prompt_guided_sending: 'Sending...',
  prompt_loading_processing: 'Processing your question...',
  prompt_loading_drafting: 'Drafting an answer...',
  prompt_loading_almost: 'Almost there...',
  prompt_chip_tujuan_1: 'I want to understand how...',
  prompt_chip_tujuan_2: 'Please explain about...',
  prompt_chip_tujuan_3: 'What is the difference between...',
  prompt_chip_konteks_1: 'What I already know is...',
  prompt_chip_konteks_2: 'I have tried, but...',
  prompt_chip_konteks_3: 'I am still confused about...',
  prompt_chip_batasan_1: 'Explain in simple language',
  prompt_chip_batasan_2: 'Provide a code example',
  prompt_chip_batasan_3: 'Use a real-life analogy',
  prompt_chip_batasan_4: 'Maximum 3 paragraphs',

  // ── Request course wizard — generating ───────────────────────────
  request_course_generating_stage_sending_label: 'Sending Request',
  request_course_generating_stage_sending_desc:
    'Sending course details to the server...',
  request_course_generating_stage_ai_label: 'AI Processing',
  request_course_generating_stage_ai_desc:
    'The AI is drafting your course outline...',
  request_course_generating_stage_processing_label: 'Processing Response',
  request_course_generating_stage_processing_desc:
    'Checking and validating the AI response...',
  request_course_generating_stage_saving_label: 'Saving Course',
  request_course_generating_stage_saving_desc: 'Saving the course to the database...',
  request_course_generating_stage_complete_label: 'Done!',
  request_course_generating_stage_complete_desc:
    'Course created successfully! Redirecting...',
  request_course_generating_stage_error_label: 'Error',
  request_course_generating_stage_error_desc: 'Something went wrong.',
  request_course_generating_tip1: 'Building modules around your learning level...',
  request_course_generating_tip2: 'Linking topics to your real-world problem...',
  request_course_generating_tip3: 'Designing a step-by-step learning path...',
  request_course_generating_tip4: 'Tuning content to your goal...',
  request_course_generating_tip5:
    'Organising subtopics for the best comprehension...',
  request_course_generating_tip6: 'Almost done — polishing the outline...',
  request_course_generating_in_flight:
    'Course generation is already running in this tab. Wait for it to finish or go back to the previous step to start over.',
  request_course_generating_before_unload:
    'Your course is being created. Leaving now will cancel it.',
  request_course_generating_timeout:
    'Course generation timed out. Try again with a simpler topic.',
  request_course_generating_server_error:
    'A server error occurred. Try again in a moment.',
  request_course_generating_unexpected_status:
    'Unexpected server response. Try again.',
  request_course_generating_cancelled: 'Course generation was cancelled.',
  request_course_generating_unexpected_error: 'An unexpected error occurred',
  request_course_generating_retry: 'Back & Try Again',
  request_course_generating_summary_topic: 'Topic',
  request_course_generating_summary_level: 'Level',
} as const satisfies Record<keyof typeof id, string>;

export const dict = { id, en } as const;

export type DictKey = keyof typeof id;
