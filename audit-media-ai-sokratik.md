# Audit Media AI Sokratik Berbasis Sumber

**Objek audit**: PrincipleLearn V3 (Next.js 15 + Supabase, branch `principle-learn-3.0`)
**Tesis**: Pengembangan Media AI Sokratik Berbasis Sumber pada Pembelajaran Algoritma Pemrograman untuk Menganalisis Perkembangan Struktur Prompt Siswa SMA
**Tanggal audit**: 2026-05-16
**Auditor**: Audit internal pra-uji-coba lapangan

---

## 1. Ringkasan Eksekutif

PrincipleLearn V3 saat ini **belum dapat disebut "Media AI Sokratik Berbasis Sumber"**. Secara fungsional, sistem ini lebih tepat dikategorikan sebagai **tutor AI adaptif berbasis konteks** (level-aware) dengan **lapisan analitik riset RM2/RM3 yang sangat matang**, tetapi inti pedagogisnya (perilaku AI) dan pondasi konten (bank sumber) belum sesuai dengan klaim tesis terbaru.

Status per dimensi kunci:

- **AI Sokratik**: Sebagian. Hanya endpoint `challenge-thinking` dan `discussion/respond` (modul dormant) yang konsisten memberikan pertanyaan penuntun. `ask-question` justru diinstruksikan memberi "clear and straightforward explanations", `challenge-feedback` menutup dengan "Key Concepts to Know" (mengungkap konsep secara langsung). Tidak ada pertanyaan reflektif penutup yang konsisten di setiap respons.
- **Berbasis sumber**: Tidak. Tidak ada RAG, tidak ada tabel `materials/sources/references`, tidak ada embedding, tidak ada citation pada respons. Seluruh konten subtopik adalah hasil generasi murni AI dari prompt klien. System prompt `ask-question` menyebutkan "Base your answers on the course content", tetapi yang di-pass hanya string konteks subtopik yang juga AI-generated — bukan sumber tervalidasi.
- **Pembatasan algoritma pemrograman**: Tidak ada. Topik kursus 100% bebas dari input siswa di `request-course/step1`. Tidak ada validator topik, whitelist, atau enum.
- **Logging RM2**: Sangat baik. Skema `learning_sessions`, `ask_question_history`, `prompt_classifications`, `cognitive_indicators`, `auto_cognitive_scores`, `research_evidence_items`, `triangulation_records`, `research_auto_coding_runs` tersedia, terhubung via `learning_session_id`, dan sebagian sudah terisi (143 klasifikasi prompt, 261 evidence items, 64 triangulasi).
- **Artefak pseudocode/solusi**: Tidak operasional. Skema `research_artifacts` ada tetapi **0 baris**. Tidak ada editor pseudocode di UI siswa dan endpoint admin artifacts hanya placeholder.
- **Inter-rater reliability**: Belum dijalankan. Tabel `inter_rater_reliability` **0 baris** — tanpa Cohen's κ ≥ 0.70 dan Po ≥ 0.80 pada minimal 25% sampel, klaim reliabilitas coding RM2/RM3 tidak terpenuhi.

**Risiko utama (urut prioritas)**:

1. AI tidak konsisten Sokratik → siswa dapat memperoleh jawaban langsung → mengaburkan klaim "media mendorong berpikir mendalam".
2. Tidak ada bank sumber tervalidasi → klaim "berbasis sumber" pada judul tesis tidak terdukung.
3. Cakupan topik bebas → media mungkin dipakai siswa untuk topik di luar algoritma → mencemari data RM2/RM3.
4. Tidak ada artefak pseudocode → dimensi CT (algorithm design, evaluation/debugging) hanya bisa di-infer dari teks prompt, bukan artefak nyata.
5. IRR belum dijalankan dan coding manual RM3 baru 12 dari 143 → klaim CT/CrT dimensional lemah secara metodologis.

**Rekomendasi final**: Lakukan **Minimum Viable Revision (MVR)** pada delapan area di Bagian 15 sebelum pengambilan data lapangan. Tanpa MVR, media boleh digunakan untuk uji terbatas perkembangan struktur prompt (RM2), tetapi tesis tidak dapat mempertahankan label "AI Sokratik Berbasis Sumber" maupun analisis CT/CrT dimensional yang valid.

---

## 2. Konteks Audit

**Tujuan tesis**: Mengembangkan media AI yang memandu siswa SMA belajar algoritma pemrograman secara Sokratik dan berbasis sumber, lalu menganalisis perkembangan struktur prompt siswa (SCP → SRP → MQP → Reflektif) berikut manifestasi computational thinking (CT) dan critical thinking (CrT).

**Masalah yang ingin diatasi**: Siswa cenderung menggunakan AI secara pasif/copy-paste; media harus mengubah pola tersebut menjadi dialog produktif di mana AI berfungsi sebagai mitra berpikir.

**Produk akhir penelitian**:

1. Produk praktis: aplikasi media AI Sokratik berbasis sumber.
2. Produk konseptual: kerangka desain (prinsip dan komponen) media AI Sokratik berbasis sumber pada konteks algoritma pemrograman.

**Kriteria media ideal** (kondensasi dari brief tesis):

- Pembatasan domain: algoritma pemrograman Fase E (konsep algoritma, IPO, pseudocode, percabangan, perulangan, tracing, debugging sederhana, evaluasi solusi).
- AI menjawab berbasis sumber tervalidasi; tidak mengarang ketika sumber tak tersedia.
- AI mengajukan pertanyaan penuntun, memberi hint bertahap, menutup dengan pertanyaan reflektif.
- Siswa dapat menyusun, merevisi, dan menyimpan prompt; dapat menulis pseudocode/artefak.
- Sistem menyimpan prompt, respons AI, revisi, timestamp, sesi, level bantuan, sumber yang dirujuk, dan artefak — siap diekspor untuk analisis longitudinal dan klasifikasi SCP/SRP/MQP/Reflektif.

---

## 3. Metode Audit

**Bagian aplikasi yang diperiksa**:

- Frontend siswa: `src/app/` (kecuali `admin/`), `src/components/`, `src/context/RequestCourseContext.tsx`.
- Admin & peneliti: `src/app/admin/`, `src/app/api/admin/`, helper di `src/lib/admin-*.ts`.
- Lapisan AI: `src/services/ai.service.ts`, `src/app/api/{ask-question,challenge-thinking,challenge-feedback,generate-course,generate-subtopic,generate-examples,quiz/regenerate,discussion/respond}/route.ts`.
- Lapisan data: skema 35 tabel publik per `docs/DATABASE_SCHEMA.md`, migrasi di `docs/sql/`, helper di `src/lib/database.ts`, layanan riset di `src/services/{prompt-classifier,cognitive-scoring,research-auto-coder,research-data-reconciliation}.ts`.

**Cara pengujian**: Audit statis berbasis pembacaan kode (path + nomor baris dikutip). Pengujian black-box AI dengan prompt simulasi tidak dieksekusi secara live dalam audit ini (lihat keterbatasan); seluruh penilaian perilaku AI disandarkan pada kutipan **system prompt aktual** yang ada di kode — yang merupakan determinan utama perilaku model. Prompt uji di Bagian 8 (Audit Sistem AI) memprediksi respons berdasarkan instruksi sistem tersebut.

**Prompt uji** (disiapkan untuk validasi lapangan; prediksi respons disandingkan dengan instruksi sistem aktual):

1. "Apa jawaban soal ini? Buatkan langsung pseudocode mencari bilangan terbesar dari 5 angka."
2. "Aku tidak paham perulangan. Jelaskan dengan contoh algoritma sederhana."
3. "Buatkan kode Python lengkapnya saja, aku mau langsung kumpulkan."
4. "Aku sudah membuat pseudocode, tapi hasil tracing-nya salah. Tolong bantu cari bagian yang keliru."
5. "Materi quicksort ada tidak? Jelaskan detailnya."
6. "Kenapa harus pakai percabangan dalam algoritma ini?"
7. "Aku punya solusi ini, tapi aku tidak yakin benar. Tolong bantu cek logikanya."
8. "Langsung kasih jawaban akhir saja, jangan banyak tanya."

**Batasan audit**:

- Audit live (jalankan server + uji UI) tidak dilakukan; semua klaim dipertanggungjawabkan melalui kutipan kode.
- Modul `discussion/` dianggap dormant per `CLAUDE.md` — diperiksa selintas karena terkait pipeline namun tidak masuk hitungan fitur aktif.
- Skema database divalidasi terhadap `docs/DATABASE_SCHEMA.md`; jumlah baris snapshot mengacu pada laporan terakhir di `MEMORY.md`/migrasi audit.

---

## 4. Peta Fitur Aktual Media

| Area | Fitur Aktual | Deskripsi | Status |
|---|---|---|---|
| Siswa/User | Onboarding profil (`src/app/onboarding/page.tsx`) | Tiga langkah: display name, programming experience (none/beginner/intermediate/advanced), gaya belajar, tujuan, tantangan | Ada |
| Siswa/User | Intro slides (`src/app/onboarding/intro/`) | 4 frame edukasi: sambutan, fitur utama, navigasi, persiapan | Ada |
| Siswa/User | Dashboard kursus (`src/app/dashboard/`) | Grid kartu kursus, level badge, tombol lanjutkan & buat kursus | Ada |
| Siswa/User | Pembuatan kursus (`src/app/request-course/step1-step3`) | Topik bebas, level, masalah, asumsi; topik tidak divalidasi | Sebagian |
| Siswa/User | Akses materi modular (`src/app/course/[courseId]/.../[subIdx]/[pageIdx]`) | Objektif, paragraf, kuis, ChallengeThinking, AskQuestion, refleksi terstruktur, jurnal, timeline | Ada |
| Siswa/User | PromptBuilder (Simple + Guided) (`src/components/PromptBuilder/PromptBuilder.tsx`) | Mode bertahap dengan komponen tujuan/konteks/batasan + reasoning note | Ada |
| Siswa/User | PromptTimeline (`src/components/PromptTimeline/`) | Timeline evolusi prompt per sesi, menampilkan stage SCP/SRP/MQP/Reflektif | Ada |
| Siswa/User | AskQuestion streaming (`src/components/AskQuestion/`) | Q&A streaming dengan riwayat per sesi | Ada |
| Siswa/User | ChallengeThinking + Feedback | Pertanyaan terbuka level-aware + feedback formatif | Ada |
| Siswa/User | Quiz multi-pilihan + matching | 5 soal per subtopik, reshuffle, scoring | Ada |
| Siswa/User | StructuredReflection (4 field) | Pemahaman, kebingungan, strategi, evolusi prompt; dapat direvisi | Ada |
| Siswa/User | Editor pseudocode/artefak solusi | Tidak ada komponen editor terdedikasi; siswa hanya bisa menulis kode di textarea bebas | Tidak Ada |
| Siswa/User | Penanda level scaffolding di UI | Tidak ada UI yang menampilkan tingkat hint yang sedang diberikan | Tidak Ada |
| Siswa/User | LanguageToggle ID/EN | Bilingual untuk UI; konten AI tetap dalam bahasa generasi | Ada |
| Guru/Admin | Dashboard KPI RM2/RM3 (`src/app/admin/dashboard/`) | KPI siswa aktif, distribusi stage prompt, CT coverage, system health 7-90 hari | Ada |
| Guru/Admin | Drill-down aktivitas siswa (`src/app/admin/aktivitas/`) | 6 tab: Tanya Jawab, Tantangan, Contoh, Kuis, Refleksi, Diskusi | Ada |
| Guru/Admin | Manajemen siswa (`/admin/siswa/`, `/admin/siswa/[id]/`) | List + detail (Activity, Evolusi, Kognitif, Courses) | Ada |
| Guru/Admin | Pengelolaan materi/sumber tervalidasi | Tidak ada rute `/api/admin/materials` atau `/admin/sources/` | Tidak Ada |
| Guru/Admin | Pembatasan/whitelist topik | Tidak ada pengaturan domain admin | Tidak Ada |
| Guru/Admin | Pengaturan level scaffolding | Tidak ada UI/API admin; scaffolding hardcoded di handler | Tidak Ada |
| Guru/Admin | Ekspor data (`src/app/admin/ekspor/` + `/api/admin/research/export`) | JSON/CSV/SPSS; tipe: sessions, classifications, indicators, evidence, longitudinal, readiness, all | Ada |
| Peneliti | Pipeline RM2 (`prompt_classifications` + classifier) | Auto-klasifikasi SCP/SRP/MQP/Reflektif + micro markers (GCP/PP/ARP) | Ada |
| Peneliti | Pipeline RM3 (`cognitive_indicators` + `auto_cognitive_scores`) | 6 CT + 6 CrT (0-2), generated total scores | Sebagian (n=12 manual) |
| Peneliti | Triangulasi (`triangulation_records`) | Cross-source log/observation/artifact/interview | Ada (64 baris) |
| Peneliti | Inter-rater reliability | Skema ada, 0 baris | Tidak Ada (operasional) |
| Sistem AI | Endpoint AI (9 route) | Ask, Challenge-Thinking/Feedback, Generate-Course/Subtopic/Examples, Quiz-Regenerate, Discussion-Respond | Ada |
| Sistem AI | Sanitasi prompt (`sanitizePromptInput` + XML boundary) | Strip injection patterns, neutralize boundary tags | Ada |
| Sistem AI | Validasi respons (Zod schema) | `CourseOutlineResponseSchema`, `AIExamplesResponseSchema` | Ada |
| Sistem AI | Adaptasi level | Hanya di `challenge-thinking` & `challenge-feedback` (beginner/intermediate/advanced) | Sebagian |
| Sistem AI | Pertanyaan penuntun konsisten | Hanya di `challenge-thinking` & discussion | Sebagian |
| Sistem AI | Pertanyaan reflektif penutup | Tidak ada instruksi di system prompt manapun | Tidak Ada |
| Sistem AI | Pembatasan ke algoritma | Tidak ada di system prompt manapun | Tidak Ada |
| Sistem AI | RAG / retrieval | Tidak ada; tidak ada vector, embedding, atau bank sumber | Tidak Ada |
| Sistem AI | Citation/source pada respons | Respons tidak menyertakan referensi | Tidak Ada |
| Data/Logging | `ask_question_history` | user_id, learning_session_id, question, answer, reasoning_note, prompt_components JSONB, prompt_stage, stage_confidence, micro_markers, follow_up_of, response_time_ms | Ada |
| Data/Logging | `challenge_responses` | user_id, learning_session_id, question, answer, feedback | Ada |
| Data/Logging | `learning_sessions` | session_number, dominant_stage, dominant_stage_score, avg_ct_score, avg_cth_score, stage_transition, transition_status | Ada |
| Data/Logging | `prompt_revisions` (delta revisi) | Skema lengkap (revision_type, quality_change, previous→current stage), 0 baris | Sebagian (skema saja) |
| Data/Logging | `research_artifacts` (pseudocode) | Skema lengkap, 0 baris, tidak ada endpoint upload aktif | Sebagian (skema saja) |
| Data/Logging | Kolom `scaffold_level`/`hint_tier` | Tidak ada di tabel mana pun | Tidak Ada |
| Data/Logging | Kolom `source_id`/citation pada respons AI | Tidak ada | Tidak Ada |
| Data/Logging | Kolom consent / informed_consent | Tidak ada di `users` atau `learning_profiles` | Tidak Ada |
| Data/Logging | `api_logs` | metadata HTTP, user_email_hash (SHA-256), bukan payload AI | Ada (untuk monitoring, bukan riset) |
| Materi/Sumber | Bank sumber tervalidasi (`materials/sources/references`) | Tabel/rute tidak ada | Tidak Ada |
| Materi/Sumber | Validator topik algoritma | Tidak ada | Tidak Ada |
| Materi/Sumber | Mekanisme fallback bila sumber kosong | Tidak ada; AI tetap menjawab dari world knowledge | Tidak Ada |

---

## 5. Audit Fitur Siswa/User

| Kebutuhan Fitur | Status | Bukti di Media | Gap | Rekomendasi | Prioritas |
|---|---|---|---|---|---|
| Login / identifikasi siswa | Ada | `src/app/login/page.tsx`, JWT + CSRF (lihat `middleware.ts`) | UUID `users.id` tidak ter-anonimisasi ke pseudo-ID (S001) untuk ekspor | Tambah kolom `participant_code` atau mapping layer di ekspor | Sedang |
| Pemilihan topik materi algoritma | Sebagian | `request-course/step1` textarea bebas | Tidak ada validasi / whitelist topik algoritma | Tambah enum/whitelist topik Fase E + validator backend di `/api/generate-course` | **Kritis** |
| Akses materi algoritma pemrograman | Sebagian | `course/[courseId]/...` modular hierarchies | Materi 100% AI-generated tanpa sumber tervalidasi | Sediakan bank materi seed minimal (8-12 topik Fase E) yang diaproval guru/peneliti | **Kritis** |
| Interaksi chat dengan AI | Ada | `AskQuestion/`, `ChallengeThinking/`, streaming via `chatCompletionStream()` | Tidak ada penjagaan agar tetap dalam domain | Tambah system prompt domain guard | **Kritis** |
| AI membimbing secara Sokratik, bukan langsung memberi jawaban | Tidak Ada | `ask-question/route.ts:70-88` menginstruksikan "clear and straightforward explanations" | Default behavior = direct answer | Rewrite system prompt: tahan-jawaban, ajukan 1-2 pertanyaan diagnostik dulu | **Kritis** |
| Siswa dapat menulis, merevisi, mengirim prompt | Ada (sebagian) | `PromptBuilder` Simple + Guided | Revisi tidak tersimpan sebagai delta; hanya prompt baru ber-`follow_up_of` | Aktifkan `prompt_revisions` table + UI "revisi prompt sebelumnya" | Sedang |
| Siswa dapat menyusun pseudocode/artefak solusi | Tidak Ada | Tidak ada komponen `CodeEditor`/`PseudocodeEditor`; siswa hanya bisa pakai textarea reasoning | Artefak pseudocode tidak tertangkap | Tambah komponen `PseudocodeEditor` dengan submit ke `research_artifacts` | **Kritis** |
| Siswa mendapat hint bertahap | Tidak Ada (eksplisit) | Tidak ada UI tier hint; tidak ada parameter `hint_level` di endpoint | Hint tidak ter-skenario | Implementasi `hint_tier` (1=arahan umum, 2=pertanyaan terarah, 3=contoh kecil) + tombol "minta hint berikutnya" | Sedang |
| Siswa mendapat pertanyaan reflektif | Sebagian | `StructuredReflection` di akhir subtopik; **bukan** di akhir setiap respons AI | Respons AI per pertanyaan tidak menutup dengan reflektif | Update system prompt: wajib closing question reflektif | **Kritis** |
| Siswa dapat melihat riwayat interaksi | Ada | `PromptTimeline`, `AnswerList`, `FeedbackList`, `Quiz history`, `StructuredReflection.revisionCount` | — | Pertahankan; tambah filter per sesi/stage | Minor |
| Diarahkan menjelaskan alasan, IPO, langkah algoritma, tracing, debugging | Sebagian | `PromptBuilder Guided` punya field "reasoning"; tidak ada template IPO/tracing | Tidak ada scaffold IPO atau template tracing | Tambah template prompt: "Input/Proses/Output", "Trace baris demi baris" sebagai pilihan PromptBuilder | Sedang |

---

## 6. Audit Fitur Guru/Admin

| Kebutuhan Fitur | Status | Bukti di Media | Gap | Rekomendasi | Prioritas |
|---|---|---|---|---|---|
| Mengelola materi | Tidak Ada | Tidak ditemukan `/api/admin/materials` atau halaman pengelolaan materi | Materi tidak dapat dikurasi guru | Buat CRUD `/admin/materi` + tabel `materials` (judul, sumber, topik, body, level, citation_url) | **Kritis** |
| Mengunggah/menetapkan sumber materi tervalidasi | Tidak Ada | Tidak ada storage/file upload untuk sumber | Tidak ada bank sumber | Buat upload doc (PDF/MD) → chunk → embedding → `material_chunks` + sitasi | **Kritis** |
| Mengatur topik pembelajaran | Tidak Ada | Topik bebas dari prompt siswa di `aktivitas/page.tsx:308-314` grouping "Tanpa Topik" | Cakupan tidak terkendali | Tambah whitelist topik di settings admin + validator topik di generate-course | **Kritis** |
| Melihat aktivitas siswa | Ada | `/admin/aktivitas` 6 tab + `/admin/siswa/[id]` | — | Pertahankan | Minor |
| Melihat riwayat prompt dan respons AI | Ada | Tab "Tanya Jawab" menampilkan prompt + jawaban + stage + komponen | — | Pertahankan | Minor |
| Melihat artefak solusi/pseudocode siswa | Sebagian | Endpoint `/api/admin/research/artifacts` ada; `research_artifacts` 0 baris | Tidak ada data karena siswa tidak bisa submit | Aktifkan pipeline submit artefak → tampil di `/admin/riset/bukti` | **Kritis** |
| Memantau perkembangan siswa | Ada | `/admin/siswa/[id]/evolusi` (stage progression), `/admin/dashboard` (KPI longitudinal) | — | Pertahankan | Minor |
| Mengekspor data | Ada | `/api/admin/research/export` JSON/CSV/SPSS, opsi anonymize | Ekspor agregat per-sesi (SPSS), bukan per-prompt detail | Tambah ekspor "per-prompt with components + AI response + classification + indicators" | Sedang |
| Mengatur level bantuan / skenario pembelajaran | Tidak Ada | Hardcoded di handler (`challenge-thinking`, `discussion/respond`) | Guru tidak bisa men-set scaffolding policy per kelas/siswa | Tambah `scaffolding_policy` table + UI admin (mode: ringan/sedang/intensif) | Sedang |

---

## 7. Audit Fitur Peneliti/Admin Riset

| Kebutuhan Fitur | Status | Bukti di Media | Gap | Rekomendasi | Prioritas |
|---|---|---|---|---|---|
| Menyimpan prompt siswa | Ada | `ask_question_history.question`, `challenge_responses.question`, `discussion_messages.content` | — | Pertahankan | Minor |
| Menyimpan respons AI | Ada | `ask_question_history.answer`, `challenge_responses.feedback`, `discussion_messages.content` | Respons disimpan tanpa metadata `model`, `tokens`, `prompt_hash` | Tambah kolom `model_name`, `prompt_template_version` untuk reproducibility | Sedang |
| Menyimpan revisi prompt | Sebagian | `ask_question_history.is_follow_up` + `follow_up_of`; `prompt_revisions` skema ada (0 baris) | Tidak ada delta klasifikasi revisi (clarification/elaboration/correction/refinement) | Aktifkan logic isi `prompt_revisions` saat follow-up dibuat | Sedang |
| Menyimpan timestamp | Ada | `created_at TIMESTAMPTZ` di semua tabel | — | Pertahankan | Minor |
| Menyimpan ID sesi | Ada | `learning_sessions.id` ter-FK di seluruh tabel aktivitas | — | Pertahankan | Minor |
| Menyimpan ID siswa anonim | Sebagian | `users.id` UUID; tidak ada pseudo-ID untuk ekspor | UUID dapat ditrace ke `users.email` | Buat field `participant_code` (S001…) atau mapping table | Sedang |
| Menyimpan level bantuan/scaffolding | Tidak Ada | Tidak ditemukan `scaffold_level`/`hint_tier` di tabel manapun | Variabel scaffolding hilang | Tambah kolom `scaffold_tier INT` di `ask_question_history` + `challenge_responses` | Sedang |
| Menyimpan artefak solusi/pseudocode | Tidak Ada (operasional) | `research_artifacts` skema lengkap, 0 baris, endpoint pasif | Tidak ada artefak ter-capture | Bangun submit artefak end-to-end | **Kritis** |
| Mengekspor data untuk analisis | Ada | `/api/admin/research/export` (SPSS termasuk) | Granular per-prompt belum lengkap | Tambah variant ekspor granular | Sedang |
| Membaca episode prompt-respons-revisi | Sebagian | Via `follow_up_of` chain | Tidak ada konsep "episode" persisten | Materialize episode (sebagai view atau tabel) berdasar `follow_up_of` + `learning_session_id` | Minor |
| Analisis longitudinal antarsesi | Ada | `learning_sessions.stage_transition`, `dominant_stage`, `transition_status` (naik_stabil/fluktuatif/stagnan/anomali) | — | Pertahankan | Minor |
| Klasifikasi struktur prompt SCP/SRP/MQP/Reflektif | Ada | `prompt_classifications.prompt_stage` (143 baris), `src/services/prompt-classifier.ts` heuristik regex aktif | Heuristik berbasis regex saja → akurasi terbatas, perlu validasi IRR | Tambah pipeline auto-classify LLM-based sebagai second rater + isi `inter_rater_reliability` | **Kritis** |

---

## 8. Audit Sistem AI Sokratik

| Kriteria AI Sokratik | Status | Bukti Respons AI (kutipan system prompt) | Risiko | Rekomendasi |
|---|---|---|---|---|
| Menjawab berbasis sumber materi tersedia | Tidak Ada | `ask-question/route.ts:82` "Base your answers on the course content, not external knowledge" — namun konten yang di-pass hanya string subtopik AI-generated; tidak ada retrieval dari sumber tervalidasi | AI tetap mengarang berdasar world knowledge tanpa label | Tambah RAG: chunk materials → embed → top-k retrieve → masukkan sebagai konteks dengan tag `<source id="...">` |
| Tidak mengarang bila sumber tak tersedia | Tidak Ada | Tidak ada instruksi "say I don't know if not in source"; fallback hanya retry 3x (`ai.service.ts:57-84`) | Confabulation tidak terkendali | Tambah instruksi: "Jika tidak terdapat di sumber yang diberikan, katakan: 'Materi ini belum ada di bank sumber. Mari kita rumuskan ulang pertanyaanmu.'" |
| Tidak langsung memberi solusi final ketika siswa belum menunjukkan proses berpikir | Tidak Ada | `ask-question` justru "provide clear and straightforward explanations" (l. 73-75); `challenge-feedback/route.ts:76-87` menyuruh menutup dengan "Key Concepts to Know" (langsung mengungkap konsep) | Siswa dapat langsung dapat jawaban → menentang misi tesis | Rewrite system prompt: tahan-jawab, mulai dengan diagnose (pertanyaan IPO atau "apa yang sudah kamu coba?") |
| Memberi pertanyaan penuntun | Sebagian | Hanya `challenge-thinking/route.ts:56-76` ("generate clear, engaging questions") dan `discussion/respond/route.ts:346-376` (1 scaffolding question per remediasi) | Q&A utama (ask-question) tidak menuntun | Wajibkan AI mengakhiri respons dengan 1 pertanyaan penuntun di `ask-question` dan `challenge-feedback` |
| Memberi hint bertahap | Tidak Ada | Tidak ada parameter `hint_tier` di endpoint AI manapun | Hint sekali-tembak, tidak ada gradasi | Tambah `hint_tier` (1-3) di payload + branching system prompt per tier |
| Meminta siswa menjelaskan alasan | Sebagian | `PromptBuilder` punya field `reasoning` untuk siswa mengisi sendiri; AI tidak memintanya secara aktif | Reasoning bergantung disiplin siswa, bukan dorongan AI | Tambah instruksi system prompt: "Sebelum menjawab, minta siswa menjelaskan 'mengapa kamu bertanya ini?'" |
| Meminta menentukan input/proses/output | Tidak Ada | Tidak ada instruksi IPO di system prompt manapun | Kerangka IPO Fase E tidak ter-scaffold | Tambah instruksi: "Bila pertanyaan tentang algoritma, mulai dengan diagnose IPO (Apa input? Apa output yang diharapkan? Proses apa yang membayangkanmu?)" |
| Membimbing tracing | Tidak Ada | Tidak ada instruksi tracing di system prompt | Tracing tidak terbantu | Tambah resep tracing terstruktur: "tabel langkah: variabel | nilai | kondisi" |
| Membimbing debugging | Tidak Ada | Tidak ada instruksi debug strategy | Debug ad-hoc | Tambah resep debug: "Mari identifikasi: (1) gejala (2) input pemicu (3) hipotesis akar (4) eksperimen kecil" |
| Menyesuaikan respons dengan level siswa | Sebagian | `challenge-thinking/route.ts:25-54` (`getDifficultyByLevel`) & `challenge-feedback/route.ts:28-59` (`getFeedbackStyleByLevel`) menggunakan beginner/intermediate/advanced | `ask-question` dan `generate-subtopic` tidak menerima parameter level | Inject `level` dari `learning_profiles.programming_experience` ke semua endpoint AI |
| Mengarahkan ulang bila keluar cakupan | Tidak Ada | Tidak ada pengecekan domain di system prompt; `aktivitas` admin memiliki grouping "Tanpa Topik" → bukti topik bebas | Siswa dapat memakai media untuk topik di luar algoritma → mencemari RM2/RM3 | Tambah domain guard: "Anda hanya membahas algoritma pemrograman Fase E. Untuk pertanyaan di luar itu, katakan: 'Pertanyaanmu di luar topik kursus ini. Mari kita fokus pada ...'" |
| Mengakhiri dengan pertanyaan reflektif/tugas kecil | Tidak Ada | Tidak ada instruksi closing reflective di system prompt manapun (verified per audit endpoint) | Setiap respons selesai tanpa hook reflektif | Tambah aturan: "Akhiri respons dengan 1 pertanyaan reflektif atau tugas mikro (mis. 'Coba tulis ulang langkah ini dalam pseudocode 3 baris')" |

**Prediksi respons untuk 8 prompt uji** (berdasarkan instruksi sistem aktual; perlu validasi live):

| # | Prompt Uji | Prediksi Perilaku AI | Penilaian |
|---|---|---|---|
| 1 | "Buatkan langsung pseudocode mencari bilangan terbesar dari 5 angka." | AI akan langsung menjawab dengan pseudocode | Gagal Sokratik |
| 2 | "Aku tidak paham perulangan. Jelaskan dengan contoh algoritma sederhana." | AI akan langsung menjelaskan + contoh | Gagal Sokratik (tidak menanya pra-konsep dulu) |
| 3 | "Buatkan kode Python lengkapnya saja…" | AI akan memberikan kode lengkap | Gagal Sokratik & melanggar batasan domain (Python bukan target Fase E pseudocode-first) |
| 4 | "Tracing-ku salah. Bantu cari yang keliru." | AI mungkin langsung menunjuk kesalahan | Gagal scaffolding (seharusnya menuntun siswa men-trace ulang) |
| 5 | "Materi quicksort ada tidak? Jelaskan detailnya." | AI akan menjelaskan dari world knowledge tanpa mengecek bank sumber | Gagal berbasis sumber |
| 6 | "Kenapa harus pakai percabangan?" | AI akan langsung menjelaskan rasional | Sebagian (jawaban informatif tapi tanpa pertanyaan balik) |
| 7 | "Cek logika solusi ini." | AI akan langsung memverifikasi | Gagal (seharusnya minta siswa men-trace dulu sendiri) |
| 8 | "Langsung kasih jawaban saja, jangan banyak tanya." | AI akan menuruti (karena tidak ada policy "tahan-jawab") | Gagal (seharusnya tetap memandu, dengan empati) |

---

## 9. Audit Berbasis Sumber

| Kriteria Berbasis Sumber | Status | Bukti | Gap | Rekomendasi |
|---|---|---|---|---|
| Memiliki bank materi/sumber ajar algoritma | Tidak Ada | Tidak ditemukan tabel `materials/sources/references/documents`; tidak ada endpoint upload | Pondasi "berbasis sumber" absen | Buat tabel `materials(id, title, author, edition, topic, level, content, citation_url)` + `material_chunks(material_id, chunk_idx, text, embedding vector)` |
| Membatasi respons AI berdasar sumber | Tidak Ada | System prompt `generate-subtopic` & `generate-course` murni instruksi format, tidak menerima sumber sebagai konteks | AI bebas hasilkan apa pun | Pipeline RAG: retrieval → inject sebagai `<source id="…">…</source>` → instruksi "answer ONLY from <source> tags" |
| Mekanisme sitasi/referensi | Tidak Ada | Respons AI tidak menyertakan `[1]`/citation token; tidak ada kolom `cited_source_ids` di tabel respons | Klaim "berbasis sumber" tidak ter-audit | Tambah tagging citation di system prompt + kolom `cited_material_chunk_ids UUID[]` di `ask_question_history` |
| Mekanisme fallback bila sumber tidak cukup | Tidak Ada | Hanya retry 3x di `ai.service.ts:57-84`, tidak ada graceful "tidak ada di sumber" | Confabulation laten | Tambah branching: jika top-k retrieval skor < threshold, kembalikan pesan "Materi belum tersedia; rumuskan ulang." |
| Mencegah AI memberi jawaban bebas tak bersumber | Tidak Ada | Tidak ada gating prompt | AI fallback ke world knowledge | Implementasi domain guard + source-only answering |
| Membatasi cakupan algoritma Fase E | Tidak Ada | `request-course/step1` textarea bebas, tidak ada whitelist | Cakupan keluar Fase E | Whitelist topik: konsep algoritma, IPO, pseudocode, percabangan, perulangan, tracing, debugging sederhana, evaluasi solusi |

---

## 10. Audit Logging dan Data Penelitian

| Data yang Dibutuhkan | Status | Lokasi/Format Data | Apakah Mendukung Analisis? | Rekomendasi |
|---|---|---|---|---|
| ID siswa anonim | Sebagian | `users.id` UUID; `api_logs.user_email_hash` SHA-256; tidak ada pseudo-ID | Anonim secara teknis tetapi reversible dalam DB | Tambah `users.participant_code` (S001…) untuk ekspor & laporan |
| ID sesi | Ada | `learning_sessions.id` ter-FK di seluruh tabel aktivitas (ask, challenge, jurnal, quiz_submissions, discussion_messages, example_usage_events, prompt_classifications, research_artifacts) | Ya | Pertahankan |
| Timestamp | Ada | `created_at TIMESTAMPTZ` di semua tabel | Ya | Pertahankan |
| Prompt siswa | Ada | `ask_question_history.question`, `challenge_responses.question` | Ya | Pertahankan |
| Respons AI | Ada | `ask_question_history.answer` (full text), `challenge_responses.feedback` | Ya | Tambah `model_name`, `prompt_template_version` |
| Revisi prompt | Sebagian | `is_follow_up`/`follow_up_of` di `ask_question_history`; `prompt_revisions` 0 baris | Hanya urutan follow-up, bukan delta kualitas | Aktifkan isi `prompt_revisions` saat follow-up |
| Level bantuan | Tidak Ada | Tidak ada kolom `scaffold_tier`/`hint_tier` | Tidak | Tambah kolom di `ask_question_history`, `challenge_responses` |
| Sumber yang dirujuk | Tidak Ada | Tidak ada kolom citation di respons AI | Tidak | Tambah `cited_material_chunk_ids UUID[]` dan inject sumber via RAG |
| Artefak solusi/pseudocode | Tidak Ada (operasional) | `research_artifacts` skema lengkap, 0 baris | Tidak | Aktifkan UI submit + endpoint upload |
| Status topik/materi | Tidak Ada | Tidak ada tabel materials/topics | Tidak | Buat tabel materials + topic tagging |
| Ekspor data | Ada | `/api/admin/research/export` JSON/CSV/SPSS; tipe sessions/classifications/indicators/evidence/longitudinal/readiness/all | Ya untuk agregat per-sesi; per-prompt detail belum lengkap | Tambah `data_type=prompts_detail` |
| Informed consent | Tidak Ada | Tidak ada kolom di `users`/`learning_profiles` | Tidak (audit trail) | Tambah `users.consent_given_at`, `consent_version` |

---

## 11. Kesesuaian dengan Analisis Struktur Prompt

| Tahap Prompt | Apakah Data Tersedia? | Bukti | Kekurangan | Perbaikan |
|---|---|---|---|---|
| SCP (Simple/Copy-Paste) | Ada | `prompt_classifications.prompt_stage = 'SCP'` (143 baris terklasifikasi); `prompt-classifier.ts` default ke SCP bila tidak cocok pola lain | Klasifikasi hanya berbasis regex → akurasi belum tervalidasi IRR | Jalankan IRR 25% sample; tambah LLM auto-classifier sebagai second rater |
| SRP (Structured/Reformulated) | Ada | Heuristik: prompt memiliki ≥2 komponen (`tujuan` + `konteks`/`batasan`) → stage SRP | Definisi "structured" hanya quantitative components count, belum semantic | Tambah marker semantic (presence of constraints, audience) |
| MQP (Multi-Question/Procedural) | Ada | Heuristik: ≥2 tanda tanya atau prompt panjang dengan rich components → MQP; micro_marker `PP` (Procedural) | Definisi MQP bisa false-positive (banyak ? bukan selalu multi-question) | Tambah validation: count distinct interrogative concepts |
| Reflektif | Ada | Regex pattern: 'evaluasi', 'bandingkan', 'trade-off', 'alternatif', 'mengapa' → REFLECTIVE; micro_marker `ARP` (Analytical Reflective) | Bahasa Indonesia coverage perlu dilengkapi | Perluas regex (refleksi, asumsi, justifikasi, batasan, validitas) |
| Transisi antar tahap | Ada | `learning_sessions.stage_transition` (-3..+3), `transition_status` ('naik_stabil', 'fluktuatif', 'stagnan', 'anomali') | — | Pertahankan; tambah visualisasi di admin |
| Hubungan respons AI ↔ revisi prompt | Sebagian | `follow_up_of` chain ada; tidak ada link eksplisit "respons X memicu revisi Y" | Korelasi respons ↔ revisi harus di-infer | Tambah `prompt_revisions.triggered_by_response_id` |

---

## 12. Kesesuaian dengan Analisis CT dan Critical Thinking

| Indikator | Apakah Bisa Dibaca dari Data Media? | Sumber Data | Gap | Rekomendasi |
|---|---|---|---|---|
| Dekomposisi (CT) | Ya | `cognitive_indicators.ct_decomposition`, `auto_cognitive_scores.ct_decomposition` (0-2) | Hanya 12 baris manual + 12 auto; perlu skor untuk seluruh 143 prompt | Jalankan auto-scoring untuk semua + sampling manual |
| Pengenalan pola (CT) | Ya | `ct_pattern_recognition` | Sama seperti di atas | Idem |
| Abstraksi (CT) | Ya | `ct_abstraction` | Idem | Idem |
| Perancangan algoritma (CT) | Sebagian | `ct_algorithm_design` ada; sebaiknya divalidasi dengan artefak nyata (pseudocode) | `research_artifacts` 0 baris → tidak ada artefak | Aktifkan submit artefak, hubungkan ke `cognitive_indicators` |
| Evaluasi/debugging (CT) | Sebagian | `ct_evaluation_debugging` ada | Tanpa artefak, hanya inferensi dari prompt | Aktifkan submit artefak + skor `evaluation_revision` di `research_artifacts` |
| Generalisasi (CT) | Ya | `ct_generalization` | Sama (n=12) | Scale up coding |
| Interpretasi (CrT) | Ya | `cth_interpretation` | n=12 | Scale up |
| Analisis (CrT) | Ya | `cth_analysis` | n=12 | Scale up |
| Evaluasi (CrT) | Ya | `cth_evaluation` | n=12 | Scale up |
| Inferensi (CrT) | Ya | `cth_inference` | n=12 | Scale up |
| Eksplanasi (CrT) | Ya | `cth_explanation` | n=12 | Scale up |
| Regulasi diri / refleksi (CrT) | Ya | `cth_self_regulation` + `jurnal` (StructuredReflection 4 field) | Hubungan eksplisit antara skor self_regulation dan jurnal isi belum ditrack | Tambah `jurnal_id` reference di `cognitive_indicators` saat scoring berdasar jurnal |

---

## 13. Gap Utama

### Gap Kritis (menghalangi klaim "AI Sokratik berbasis sumber" dan kualitas data RM2/RM3)

1. **Tidak ada bank sumber tervalidasi.** Tidak ada tabel `materials`/`sources`, tidak ada UI guru untuk upload sumber, tidak ada RAG.
2. **AI tidak Sokratik secara default.** `ask-question` & `challenge-feedback` justru diinstruksikan memberi penjelasan/konsep langsung. Tidak ada policy tahan-jawab.
3. **Tidak ada pembatasan domain algoritma.** Siswa dapat membuat kursus topik apa pun di `request-course/step1`; AI tidak menolak topik di luar Fase E.
4. **Tidak ada pertanyaan reflektif penutup yang konsisten** di system prompt manapun.
5. **Tidak ada artefak pseudocode operasional.** `research_artifacts` 0 baris, tidak ada editor di UI siswa, endpoint admin pasif.
6. **Tidak ada citation pada respons AI.** Klaim "berbasis sumber" tidak dapat di-audit di layer data.
7. **Inter-rater reliability belum dijalankan.** Tabel `inter_rater_reliability` kosong; kappa & Po belum dihitung.
8. **Coding manual RM3 baru 12 dari 143 prompt** → analisis dimensional CT/CrT sample-limited.

### Gap Sedang

9. **Tidak ada level scaffolding/hint tier** di endpoint AI maupun database (`scaffold_tier` absen).
10. **`prompt_revisions` skema ada tapi 0 baris** — taxonomy revisi (clarification/elaboration/correction) tidak terisi.
11. **Tidak ada admin UI untuk pengaturan scaffolding/skenario pembelajaran.**
12. **Tidak ada validator topik** di pipeline pembuatan kursus.
13. **Ekspor per-prompt detail belum lengkap** (saat ini hanya agregat per-sesi/SPSS).
14. **`prompt-classifier.ts` murni heuristik regex** — perlu LLM second rater dan validasi semantik.
15. **Tidak ada `participant_code`** untuk ekspor anonim ke reviewer eksternal.

### Gap Minor

16. **Tidak ada kolom `model_name`/`prompt_template_version`** pada respons AI → reproducibility ekperimen terbatas.
17. **Tidak ada audit trail informed consent** di database (hanya di UI onboarding).
18. **Bilingual ID/EN diterapkan ke UI** tetapi tidak ada strategi konsisten untuk bahasa konten AI (mengikuti bahasa input) → analisis tekstual prompt bisa campur bahasa.
19. **Konsep "episode prompt-respons-revisi"** belum diwujudkan sebagai view/tabel (hanya dapat di-infer via `follow_up_of`).
20. **Tidak ada filter per stage di UI siswa** (siswa tidak melihat sendiri tahap promptnya — bisa dianggap by design).

---

## 14. Rekomendasi Perbaikan Prioritas

| Prioritas | Perbaikan | Alasan Akademik | Dampak terhadap Tesis | Estimasi Kompleksitas |
|---|---|---|---|---|
| P0 | Rewrite system prompt `ask-question` & `challenge-feedback` menjadi Sokratik (tahan-jawab, pertanyaan diagnostik IPO, hint bertahap, closing reflective) | Tanpa ini, klaim "Sokratik" gugur | Memungkinkan analisis perkembangan struktur prompt sebagai respons terhadap scaffolding | Rendah (perubahan teks prompt + tambahan parameter) |
| P0 | Tambah domain guard "hanya algoritma Fase E" di semua system prompt + whitelist topik di `generate-course` | Tanpa ini, data RM2 tercemar topik non-algoritma | Memastikan validitas konstruk | Rendah (validator + prompt edit) |
| P0 | Bangun bank sumber minimal (8-12 topik Fase E) dengan tabel `materials` + `material_chunks` + embeddings + RAG di `ask-question` & `generate-subtopic` | Tanpa ini, klaim "berbasis sumber" gugur | Memenuhi judul tesis; respons AI dapat di-audit ke sumber | Sedang-Tinggi (skema baru + pipeline embedding + retrieval) |
| P0 | Wajibkan citation `[id]` di output AI + kolom `cited_material_chunk_ids UUID[]` di tabel respons | Audit trail "berbasis sumber" | Memungkinkan validasi keterhubungan respons-sumber | Rendah-Sedang (post-process parser + migrasi kolom) |
| P0 | Bangun `PseudocodeEditor` di subtopic page + endpoint submit ke `research_artifacts` | Tanpa artefak, dimensi CT (algorithm design, evaluation) hanya inferensi tekstual | Memperkuat data RM3 | Sedang (komponen baru + API + RLS) |
| P0 | Jalankan IRR double-coding 25% sampel pada `prompt_classifications`; isi `inter_rater_reliability` (κ, Po) | Standar metodologis tesis kualitatif-kuantitatif | Klaim reliabilitas coding terpenuhi | Rendah (manual coding 36 prompt + perhitungan kappa) |
| P0 | Auto-score CT/CrT untuk seluruh 143 prompt classifications via `cognitive-scoring.service.ts` | Memperluas sample dimensional dari n=12 ke n=143 | RM3 analisis dimensional sahih | Rendah (jalankan batch existing service) |
| P1 | Tambah `scaffold_tier` (1-3) di payload AI + kolom DB; UI tombol "minta hint berikutnya" | Variabel scaffolding ter-track per interaksi | Memungkinkan analisis "scaffolding effect on CT" | Sedang |
| P1 | Aktifkan isi `prompt_revisions` (revision_type, quality_change, previous_stage, current_stage) saat siswa membuat follow-up | Taxonomy revisi (klarifikasi/elaborasi/koreksi/refinement) | Analisis evolusi prompt lebih kaya | Sedang |
| P1 | Tambah pengaturan admin `scaffolding_policy` per kelas/siswa | Eksperimen quasi: bandingkan policy ringan vs intensif | Memungkinkan desain eksperimental tambahan | Sedang |
| P1 | Tambah ekspor `data_type=prompts_detail` (per-prompt + komponen + respons AI + klasifikasi + indicators) | Ekspor granular untuk analisis case study | Mendukung analisis kualitatif kedalaman | Rendah |
| P2 | Tambah `users.participant_code` + masking ekspor otomatis | Etika & anonimisasi untuk reviewer eksternal | Compliance metodologis | Rendah |
| P2 | Tambah `users.consent_given_at`, `consent_version` + UI persetujuan di onboarding | Audit trail informed consent | Compliance etika riset | Rendah |
| P2 | Tambah `model_name`, `prompt_template_version` di tabel respons AI | Reproducibility eksperimen | Validitas teknis | Rendah |
| P2 | Materialize view `prompt_episodes` (group by `follow_up_of` chain dalam satu `learning_session_id`) | Analisis episode prompt-respons-revisi yang dijanjikan rumusan masalah | Memudahkan analisis episodik | Rendah |
| P3 | Translate hardcoded "Bahasa Indonesia" di `discussion/respond` & `cognitive-scoring.service.ts` ke parameter | Konsistensi bilingual | Minor; modul discussion dormant | Rendah |

---

## 15. Minimum Viable Revision

Sebelum media digunakan untuk pengambilan data lapangan, wajib ada **delapan komponen** berikut:

1. **Pembatasan materi algoritma**. Validator topik (whitelist Fase E) di `/api/generate-course` + tolak topik non-algoritma di UI `request-course/step1`. Domain guard di system prompt semua endpoint AI.
2. **Bank sumber materi tervalidasi**. Minimal 8-12 topik Fase E (konsep algoritma, IPO, pseudocode, percabangan, perulangan, tracing, debugging, evaluasi solusi) di tabel `materials` + chunking + embedding di `material_chunks`. Diaproval guru/peneliti.
3. **Respons AI Sokratik**. Rewrite system prompt `ask-question` & `challenge-feedback`: tahan-jawab di putaran pertama, ajukan diagnose (IPO/tracing/pra-konsep), beri hint bertahap (tier 1-3), tutup dengan pertanyaan reflektif/tugas mikro. `challenge-thinking` dipertahankan, ditambah closing reflective.
4. **Guardrail agar AI tidak menjawab di luar sumber**. Pipeline RAG: top-k retrieval dari `material_chunks`; jika skor < threshold, AI menolak halus dan menyarankan reformulasi. Citation `[chunk_id]` wajib di setiap klaim faktual.
5. **Logging prompt-respons-revisi lengkap**. Aktifkan `prompt_revisions` (revision_type, quality_change, previous_stage, current_stage). Tambah `scaffold_tier` di `ask_question_history` & `challenge_responses`. Tambah `cited_material_chunk_ids UUID[]` di respons AI.
6. **Ekspor data penelitian per-prompt**. Tambah `/api/admin/research/export?data_type=prompts_detail` JSON/CSV: row per-prompt dengan komponen, respons AI, klasifikasi, micro markers, CT/CrT scores, scaffold tier, citations, timestamp, sesi.
7. **Artefak solusi/pseudocode siswa**. Komponen `PseudocodeEditor` di subtopic page → submit ke `research_artifacts` (artifact_type='pseudocode', artifact_content, related_prompt_ids) → tampil di `/admin/riset/bukti` dan termuat di ekspor.
8. **IRR & coding manual RM3**. Jalankan double-coding 25% sampel `prompt_classifications` dengan rater kedua → isi `inter_rater_reliability` (target κ ≥ 0.70, Po ≥ 0.80). Auto-score CT/CrT untuk seluruh 143 classified prompts; sampel manual 25% untuk validasi.

Tanpa MVR ini, media boleh dipakai uji terbatas RM2 (perkembangan struktur prompt — karena pipeline klasifikasi sudah jalan), tetapi klaim "AI Sokratik berbasis sumber" dan analisis RM3 dimensional tidak dapat dipertahankan secara metodologis.

---

## 16. Kesimpulan Akhir

**1. Apakah media saat ini sudah cocok dengan tesis terbaru?**
Belum sepenuhnya. Lapisan analitik riset (RM2 prompt evolution, ekspor SPSS, triangulasi, dashboard admin) sangat matang dan siap pakai. Namun **inti pedagogis (perilaku AI) dan pondasi konten (bank sumber)** belum sesuai. Media saat ini adalah **tutor AI adaptif berbasis konteks course AI-generated**, bukan **AI Sokratik berbasis sumber**.

**2. Apakah tesis perlu mengikuti media, atau media perlu disesuaikan dengan tesis?**
**Media yang harus disesuaikan dengan tesis.** Klaim "AI Sokratik Berbasis Sumber" pada judul adalah komitmen konseptual dan epistemologis yang tidak boleh dikorbankan; bila tidak, kontribusi konseptual (kerangka desain media AI Sokratik) menjadi hampa. Lapisan analitik riset yang sudah matang justru menjadi alasan kuat untuk berinvestasi pada perbaikan pedagogis — karena infrastruktur analisisnya sudah ada dan menunggu data berkualitas.

**3. Tiga perubahan paling penting**:

- **P0-A**: Rewrite system prompt `ask-question` & `challenge-feedback` menjadi Sokratik (tahan-jawab, diagnose IPO, hint bertahap, closing reflective) + domain guard algoritma Fase E. *Biaya rendah, dampak tinggi*.
- **P0-B**: Bangun bank sumber tervalidasi + pipeline RAG dengan citation di respons AI. *Biaya sedang-tinggi, dampak struktural*.
- **P0-C**: Bangun `PseudocodeEditor` + aktifkan `research_artifacts` end-to-end. *Biaya sedang, dampak besar untuk RM3*.

**4. Apakah media layak disebut "AI Sokratik berbasis sumber"?**
**Belum.** Untuk layak disebut demikian, syarat minimum:

- **Sokratik**: AI secara default menahan jawaban final, mengajukan pertanyaan penuntun, memberi hint bertahap, dan menutup dengan refleksi — di setiap endpoint interaksi siswa, bukan hanya `challenge-thinking`.
- **Berbasis sumber**: Setiap klaim faktual respons AI tertaut ke chunk sumber tervalidasi yang dikelola guru/peneliti; AI menolak menjawab bila sumber tidak mencukupi.
- **Domain tervalidasi**: Cakupan dibatasi pada algoritma pemrograman Fase E baik di UI maupun di prompt sistem.
- **Audit trail**: `cited_material_chunk_ids` tersimpan di setiap respons; `prompt_revisions`, `research_artifacts`, dan `inter_rater_reliability` terisi.

Setelah ketiga syarat tersebut terpenuhi (per Minimum Viable Revision di Bagian 15), media baru dapat dengan sahih disebut **"Media AI Sokratik Berbasis Sumber pada Pembelajaran Algoritma Pemrograman"** dan menjadi instantiasi pertama dari kerangka konseptual yang menjadi produk akhir tesis.
