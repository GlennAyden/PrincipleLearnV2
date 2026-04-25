# PrincipleLearn V3 — Application Overview untuk Konteks Tesis

Dokumen ini memberikan gambaran aplikasi PrincipleLearn V3 dari sudut pandang riset Magister.
Tujuannya bukan untuk dokumentasi produk, melainkan untuk menjelaskan kepada pembaca tesis
(dosen pembimbing, penguji, peneliti lain) modul-modul apa saja yang digunakan sebagai
instrumen pengumpulan data RM1, RM2, dan RM3.

> Tanggal pembaruan: 2026-04-26
> Status aplikasi: aktif digunakan untuk pengumpulan data tesis (n = 29 partisipan,
> 33 course, 157 subtopic, 685 quiz, 255 quiz submissions, 143 prompt classification).

Referensi teknis pelengkap:

- [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) — arsitektur teknis Next.js 15 + Supabase
- [`docs/DATABASE_SCHEMA.md`](../DATABASE_SCHEMA.md) — definisi seluruh tabel
- [`docs/admin-and-research-ops.md`](../admin-and-research-ops.md) — alur operasi admin/riset
- [`docs/feature-flows.md`](../feature-flows.md) — peta alur fitur per halaman

---

## 1. Konsep Aplikasi dalam Konteks Riset

PrincipleLearn V3 adalah platform pembelajaran berbantuan AI yang dirancang sebagai
**media intervensi sekaligus instrumen pengukuran** untuk tesis Magister tentang
perkembangan struktur prompt dan manifestasi Computational Thinking (CT) serta
Critical Thinking (CTh) pada siswa SMA dalam pembelajaran algoritma Informatika Fase E.

Setiap interaksi mahasiswa dengan modul aplikasi merekam jejak data pada tabel-tabel
yang dirancang khusus untuk analisis longitudinal (RM2) dan analisis manifestasi
indikator berpikir (RM3). Lihat
[`ADMIN_RM2_RM3_DATA_COMPLETENESS.md`](./ADMIN_RM2_RM3_DATA_COMPLETENESS.md) untuk
status kelengkapan data per tabel.

### Posisi Aplikasi terhadap RM

| RM | Pertanyaan Riset | Modul Aplikasi yang Menjadi Instrumen |
| --- | --- | --- |
| **RM1** | Bagaimana proses dan hasil pengembangan media? | Seluruh aplikasi sebagai produk; instrumen ekspor LORI/SUS dilakukan terpisah. |
| **RM2** | Bagaimana tahapan perkembangan struktur prompt siswa? | Ask Question, Challenge Thinking, Prompt Builder, Prompt Timeline, Reasoning Note. |
| **RM3** | Bagaimana CT dan CTh termanifestasi pada tiap tahap prompt? | Quiz, Structured Reflection (jurnal), Examples, Key Takeaways, Challenge Feedback. |

---

## 2. Stack Teknis Singkat

| Lapisan | Teknologi |
| --- | --- |
| Framework | Next.js 15 (App Router), React 19, TypeScript |
| Styling | Sass modules per komponen |
| Database | Supabase PostgreSQL dengan Row Level Security |
| Otentikasi | JWT custom (access + refresh) dengan CSRF double-submit cookie |
| AI | OpenAI Responses API (`gpt-5-mini` default), streaming via `chatCompletionStream()` |
| Observabilitas | Tabel `api_logs` (3.801 baris per 2026-04-26) dan `rate_limits` |
| Deployment | Vercel |

Detail jalur kode dapat ditelusuri pada [`CLAUDE.md`](../../CLAUDE.md) di root repo.

---

## 3. Modul Utama yang Relevan untuk Tesis

Aplikasi terdiri atas tiga area besar: onboarding, ruang belajar siswa per subtopic,
dan admin riset. Bagian ini hanya membahas modul yang menghasilkan data riset.

### 3.1 Onboarding Dua Tahap

Sebelum siswa dapat meminta course, sistem mewajibkan dua tahap onboarding.

| Tahap | Halaman | Tujuan Pedagogis | Data yang Direkam |
| --- | --- | --- | --- |
| Profile wizard | [`/onboarding`](../../src/app/onboarding/page.tsx) | Identifikasi prior knowledge, learning goal, gaya belajar | tabel `learning_profiles` (6 baris aktif) |
| Intro slides | [`/onboarding/intro`](../../src/app/onboarding/intro/page.tsx) | Orientasi cara berinteraksi dengan AI secara reflektif | flag `intro_slides_completed` pada profil + cookie gate |

Onboarding dibatasi oleh middleware sehingga siswa tidak bisa melompati tahap ini —
penting untuk memastikan baseline data tersedia sebelum sesi belajar pertama.

### 3.2 Request Course (3 Langkah)

Halaman [`/request-course/step1` … `step3`](../../src/app/request-course/) memandu
siswa merumuskan kebutuhan belajar:

- **Step 1**: topik dan tujuan
- **Step 2**: level, masalah konkret, asumsi pengetahuan, topik terkait
- **Step 3**: review dan konfirmasi generate

State antar-langkah dipegang oleh `RequestCourseContext`. Hasilnya memicu
`/api/generate-course` yang menulis ke tabel `courses` (33 baris), `subtopics`
(157 baris), `leaf_subtopics` (106 baris), dan `quiz` (685 baris). Aktivitas
generasi disimpan ke `course_generation_activity` (38 baris) untuk audit.

### 3.3 Ruang Belajar per Subtopic

Halaman [`/course/[courseId]/subtopic`](../../src/app/course/[courseId]/subtopic/)
menampilkan satu subtopic sekaligus dengan komponen-komponen berikut:

| Komponen | Fungsi Pedagogis | Endpoint AI Terkait | Tabel Riset |
| --- | --- | --- | --- |
| `AILoadingIndicator` | Indikator status streaming | — | — |
| `Examples` | Contoh kontekstual yang di-generate AI | `/api/generate-examples` | `example_usage_events` (18) |
| `AskQuestion` | Tanya jawab streaming | `/api/ask-question` | `ask_question_history` (17) |
| `ChallengeThinking` | Tantangan kognitif streaming | `/api/challenge-thinking`, `/api/challenge-feedback` | `challenge_responses` (15) |
| `Quiz` | Asesmen formatif per subtopic | — (soal di-cache) | `quiz`, `quiz_submissions` (255) |
| `StructuredReflection` | Jurnal refleksi terstruktur | — | `jurnal` (43), `feedback` (40) |
| `KeyTakeaways` | Ringkasan otomatis | — | termuat dalam `subtopic_cache` (109) |
| `PromptBuilder` | Alat membantu siswa menyusun prompt yang lebih baik | — | dipakai oleh classifier |
| `PromptTimeline` | Visualisasi evolusi prompt siswa di subtopic | — | turunan dari `prompt_classifications` (143) |
| `ReasoningNote` | Catatan alur penalaran sebelum bertanya | — | metadata pada `ask_question_history` |
| `NextSubtopics` | Rekomendasi subtopic lanjutan | — | `user_progress` (13) |
| `WhatNext` | Penutup subtopic dan call-to-action | — | — |
| `HelpDrawer`, `ProductTour` | Onboarding kontekstual | — | telemetri ringan |

Modul-modul di atas dipakai sebagai sumber bukti utama RM2 (struktur prompt) dan
RM3 (manifestasi indikator berpikir). Lihat
[`THINKING_SKILL.md`](./THINKING_SKILL.md) untuk pemetaan komponen ke indikator.

### 3.4 Admin Riset

Area [`/admin`](../../src/app/admin/) menyediakan tujuh sub-area: dashboard,
siswa, aktivitas, riset (prompt, kognitif, readiness, bukti, triangulasi),
ekspor, dan management user. Untuk tesis, area yang relevan adalah:

- [`/admin/riset/prompt`](../../src/app/admin/riset/prompt/) — coding RM2.
- [`/admin/riset/kognitif`](../../src/app/admin/riset/kognitif/) — coding RM3.
- [`/admin/riset/readiness`](../../src/app/admin/riset/readiness/) — kelengkapan data.
- [`/admin/riset/bukti`](../../src/app/admin/riset/bukti/) — evidence ledger
  (terhubung ke `research_evidence_items` — 261 baris per 2026-04-26).
- [`/admin/riset/triangulasi`](../../src/app/admin/riset/triangulasi/) — triangulasi
  lintas sumber (`triangulation_records` — 64 baris).
- [`/admin/siswa/[id]`](../../src/app/admin/siswa/) — profil longitudinal per siswa.

---

## 4. Modul yang TIDAK Aktif Dipakai untuk Tesis

Beberapa modul ada di kode tetapi tidak digunakan sebagai sumber data analisis
tesis. Pembaca tesis tidak perlu mempertimbangkannya.

| Modul | Status | Alasan |
| --- | --- | --- |
| Discussion (Socratic engine) | Non-aktif | Hanya 5 sesi historis pada `discussion_sessions` dan 157 pesan di `discussion_messages`; modul tidak dijalankan pada periode pengumpulan data tesis. |
| Ekspor admin (`/admin/ekspor`) | Non-aktif | Skip karena ekstraksi dataset dilakukan langsung via SQL ad-hoc dari Supabase. |
| Kesehatan Sistem / health monitor | Non-aktif | Tidak menjadi instrumen riset. |
| Transcript module | Kosong | Tabel `transcript` 0 baris; modul tidak digunakan. |

Kebijakan ini sudah dicatat dalam memori proyek (`project_scope.md`).

---

## 5. Pemetaan Fitur Aplikasi ke Konstruk Riset

Tabel ringkas yang menjawab "fitur apa menghasilkan bukti apa untuk konstruk apa".
Detail rubrik terdapat pada [`ASSESSMENT_RUBRIC.md`](./ASSESSMENT_RUBRIC.md) dan
detail pemetaan indikator pada [`THINKING_SKILL.md`](./THINKING_SKILL.md).

| Fitur | Konstruk Utama RM2 (Prompt) | Konstruk Utama RM3 (CT/CTh) |
| --- | --- | --- |
| Request Course (Step 1–3) | Baseline rumusan kebutuhan (proxy SCP) | Self-Regulation, Decomposition, Abstraction |
| Ask Question | Klasifikasi SCP / SRP / MQP / Reflective | Analysis, Explanation, Self-Regulation, Abstraction |
| Challenge Thinking | Reformulasi prompt setelah cognitive conflict | Evaluation, Inference, Algorithmic Thinking |
| Prompt Builder + Timeline | Visualisasi tahap & transisi prompt | — (instrumen scaffolding) |
| Reasoning Note | Marker Reflective / metakognitif | Self-Regulation, Explanation |
| Quiz | — | Pattern Recognition, Algorithmic Thinking, Debugging |
| Structured Reflection (jurnal) | — | Self-Regulation, Explanation |
| Examples + Key Takeaways | — | Abstraction, Pattern Recognition |
| Feedback per subtopic | — | Evaluation, Self-Regulation |

---

## 6. Pipeline Klasifikasi RM2/RM3 (Status Pendek)

- **Auto-classifier prompt**: berjalan di `src/services/prompt-classifier.ts`
  dengan output ditulis ke `prompt_classifications` (143 baris, aktif).
- **Auto-cognitive scoring**: `cognitive-scoring.service.ts` menulis ke
  `auto_cognitive_scores` (12 baris, aktif).
- **Manual coding researcher**: melalui `/admin/riset/prompt` dan
  `/admin/riset/kognitif`; tabel `cognitive_indicators` baru terisi seed (12 baris).
- **Evidence ledger**: `research_evidence_items` (261 baris) menyimpan cuplikan
  bukti per kode.
- **Auto-coder run log**: `research_auto_coding_runs` (41 baris) sebagai audit
  trail batch klasifikasi.
- **Triangulasi**: `triangulation_records` (64 baris) sebagai keputusan
  konvergensi antar sumber.
- **Inter-rater reliability**: tabel `inter_rater_reliability` masih kosong;
  workflow double-coding belum dijalankan untuk siklus pengumpulan saat ini.

---

## 7. Catatan Penting untuk Pembaca Tesis

1. Semua data partisipan disimpan di Supabase dengan RLS aktif. Hanya admin
   (akun peneliti tunggal) yang dapat membaca data lintas siswa.
2. Anonimisasi dilakukan ringan pada tahap ekspor; akun admin dan akun
   `sal@expandly.id` adalah akun cadangan peneliti, bukan partisipan.
3. Modul Discussion ada di kode tetapi tidak dianalisis untuk RM2/RM3.
4. Transkrip otomatis tidak digunakan; pengumpulan kualitatif (wawancara dan
   observasi) dilakukan di luar aplikasi dan dimasukkan secara manual ke
   `research_evidence_items` ketika relevan.
