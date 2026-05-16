# Spesifikasi Konten Mode Penelitian — 4 Course × 26 Leaf-Subtopik

Dokumen ini menetapkan spesifikasi kanonik kurikulum yang dipakai Mode Penelitian PrincipleLearn V3, beserta dasar pemilihannya, struktur unlock, dan jaminan reproducibility.

## 1. Sumber Primer Kurikulum

**Mushthofa, M., dkk. (2023). *Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi*. Pusat Perbukuan, Badan Standar, Kurikulum, dan Asesmen Pendidikan, Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi Republik Indonesia.** Bab 2 (hal. 29-105) menjadi sumber kurikulum utama untuk Fase E pada elemen Algoritma dan Pemrograman.

Salinan PDF buku tersedia di [`docs/Informatika_BS_KLS_X_Rev.pdf`](Informatika_BS_KLS_X_Rev.pdf); peta sub-bab terhadap course di sistem mengikuti pemetaan 1:1 di Section 3.

## 2. Justifikasi 4 Course

Versi awal media (pra-MVR) mendefinisikan 8 course terpisah untuk algoritma. Setelah review pembimbing, struktur direduksi menjadi **4 course mengikuti 1:1 sub-bab Bab 2 buku Kemdikbudristek 2023**. Dua alasan inti:

1. **Dapat dipertahankan di sidang.** Setiap klaim "course X mengikuti kurikulum Fase E" dapat dirujuk langsung ke halaman buku. Mapping 8-course versi awal mencampurkan beberapa topik buku ke dalam satu course (mis. memisahkan "tracing" dan "debugging" sebagai course mandiri) — ini menciptakan beban justifikasi pedagogis tambahan yang sulit dibela tanpa kajian literatur pembanding.
2. **Topik praktik tertanam sebagai sub-aktivitas, bukan course.** Tracing dijalankan via komponen interaktif TraceTable di leaf 1.4 dan 1.6 (lihat [INTERACTIVE_BLOCKS_SPEC.md](INTERACTIVE_BLOCKS_SPEC.md)). Debugging diamati via komponen BugHunt. Evaluasi solusi muncul lewat ChallengeThinking + StructuredReflection. Reduksi struktur tidak menghilangkan domain praktik; ia memindahkannya ke level yang lebih dekat dengan aktivitas siswa.

## 3. Tabel Kanonik 4 Course × 26 Leaf-Subtopik

Sumber: verifikasi via DB Supabase project `wesgoqdldgjbwgmubfdm` per 2026-05-16 (query `SELECT c.template_topic, l.module_index, l.subtopic_index, l.title FROM courses c JOIN leaf_subtopics l ON l.course_id=c.id WHERE c.is_template=true AND c.mode='research' ORDER BY c.template_topic, l.module_index, l.subtopic_index`). Total: 6 + 12 + 5 + 3 = **26 leaf**.

| # | Slug `template_topic` | Judul Course (= sub-bab buku) | Halaman buku | Leaf-subtopik kanonik | Unlock-prereq |
|---|---|---|---|---|---|
| 1 | `mengenal-algoritma` | Mengenal Algoritma dan Pemrograman | 29-44 | (1.1) Algoritma: Definisi & Hubungan Berpikir Komputasional · (1.2) Diagram Alir: Notasi ANSI/ISO · (1.3) Diagram Alir: Contoh & Latihan · (1.4) Menelusuri Diagram Alir (Tracing) · (1.5) Pseudokode: Konvensi & Contoh · (1.6) Menelusuri Pseudokode | — (entry) |
| 2 | `struktur-kendali` | Membuat Program Sesuai Struktur Kendalinya | 45-79 | (2.1) Belajar Algoritma sambil Menyelesaikan Masalah · (2.2) Ekspresi: Operand & Operator · (2.3) Operator Matematika/Logika/Relasional/Kesamaan · (2.4) Percabangan If-Else · (2.5) Percabangan Switch-Case · (2.6) Percabangan Bersarang · (2.7) Perulangan For-Loop · (2.8) Perulangan While · (2.9) Perulangan Do-While · (2.10) Perulangan Bersarang & Perulangan Tak Terbatas · (2.11) Fungsi: Membuat & Memanggil · (2.12) Fungsi: Variabel Lokal | `mengenal-algoritma` |
| 3 | `memilih-algoritma` | Memilih Algoritma untuk Masalah di Kehidupan Nyata | 80-95 | (3.1) Pencarian (Searching): Konsep · (3.2) Pengurutan (Sorting): Pengantar · (3.3) Bubble Sort · (3.4) Insertion Sort · (3.5) Selection Sort | `struktur-kendali` |
| 4 | `struktur-data` | Memilih Struktur Data untuk Masalah di Kehidupan Nyata | 96-105 | (4.1) Pengantar Struktur Data · (4.2) Antrean (Queue) · (4.3) Tumpukan (Stack) | `memilih-algoritma` |

Course 2 paling padat (12 leaf) karena buku mengonsentrasikan ekspresi + percabangan + perulangan + fungsi dalam satu sub-bab. Ini disengaja agar urutan progresi konsep mengikuti urutan buku resmi tanpa fragmentasi artifisial.

## 4. Tabel `course_unlock_dependencies`

Skema: `course_unlock_dependencies(course_template_topic VARCHAR(50) PRIMARY KEY, prereq_template_topic VARCHAR(50) NULLABLE)`. Verifikasi DB:

| course_template_topic | prereq_template_topic |
|---|---|
| `mengenal-algoritma` | `NULL` (entry course) |
| `struktur-kendali` | `mengenal-algoritma` |
| `memilih-algoritma` | `struktur-kendali` |
| `struktur-data` | `memilih-algoritma` |

Total 4 baris (3 baris dengan prereq + 1 entry sebagai NULL). Helper unlock progresif (Item 7b MVR) menggunakan tabel ini untuk menentukan apakah siswa berhak membuka course berikutnya (gate: ≥70% completion pada prereq).

## 5. Domain Guard

Sub-task Item 2 MVR menambahkan instruksi domain guard pada system prompt Mode Penelitian: AI hanya membahas topik dari `template_topic` aktif (dirujuk ke halaman buku Mushthofa dkk. 2023). Untuk pertanyaan di luar Fase E, AI menjawab dengan redirect halus: "Pertanyaan ini di luar topik {template_topic}. Mari kita kembali ke …". Implementasi prompt ada di `src/services/prompts/socratic-ask-question.ts` dan diintegrasikan via pipeline `chatCompletionStream` di `ask-question` + `challenge-thinking` route.

Validator backend di `/api/generate-course/route.ts` menolak 400 jika body `mode='research'` tidak menyebutkan salah satu dari 4 slug whitelist (`mengenal-algoritma`, `struktur-kendali`, `memilih-algoritma`, `struktur-data`) atau jika prereq belum mencapai threshold.

## 6. Cache Lock + QA Workflow

Konten paragraf di setiap leaf-subtopik **tidak diseed di DB** — kolom konten dibiarkan kosong dan diisi lazily oleh pipeline RAG saat siswa pertama mengakses leaf. Mekanisme detailnya (lock, generation_seed, QA review oleh peneliti, byte-equality lintas siswa) dijabarkan di [RAG_PIPELINE.md](RAG_PIPELINE.md) Section 8. Konsekuensi praktis untuk dokumen ini: spesifikasi struktur ini (judul leaf + halaman buku + unlock) adalah kontrak tetap, sedangkan teks konten adalah artefak generation yang harus melalui approval `/admin/sumber/cache-review` sebelum dilihat siswa lain.

Peneliti dapat pre-generate seluruh 26 leaf via `scripts/pre-generate-research-subtopics.ts` (opsional, untuk menghindari siswa pertama menanggung delay).

## 7. Bank Sumber per Course

Direktori [`docs/bank-sumber/`](bank-sumber/) berisi 14 PDF terkurasi yang menjadi bahan upload ke tabel `materials`. Pemetaan filename ke `template_topics` mengikuti prefix angka:

| Course | File PDF di `docs/bank-sumber/` |
|---|---|
| `mengenal-algoritma` | `01-mengenal-algoritma-Informatika-BG-KLS-X-Rev-Mirror.pdf` · `01-mengenal-algoritma-MembuatAlgoritmaDanProgram-UPNYK.pdf` · `01-mengenal-algoritma-Modul-Logika-Algoritma-NusaMandiri.pdf` |
| `struktur-kendali` | `02-struktur-kendali-Buku-Algoritma-Pemrograman-UNESA.pdf` · `02-struktur-kendali-Percabangan-UNIKOM.pdf` · `02-struktur-kendali-Perulangan-UNIKOM.pdf` |
| `memilih-algoritma` | `03-memilih-algoritma-Pengurutan-UNIKOM.pdf` · `03-memilih-algoritma-Searching-ModulPraktikum3-UM.pdf` · `03-memilih-algoritma-Searching-Pertemuan05-UPI-YAI.pdf` · `03-memilih-algoritma-Sorting-Modul8-UM.pdf` |
| `struktur-data` | `04-struktur-data-Queue-Antrian-BinaDarma.pdf` · `04-struktur-data-Queue-Antrian-PENS.pdf` · `04-struktur-data-Queue-Pertemuan3-UNIKOM.pdf` · `04-struktur-data-Stack-Tumpukan-BinaDarma.pdf` |

Buku utama Kemdikbudristek 2023 ([`docs/Informatika_BS_KLS_X_Rev.pdf`](Informatika_BS_KLS_X_Rev.pdf)) di-upload terpisah dan diberi `template_topics = ['mengenal-algoritma','struktur-kendali','memilih-algoritma','struktur-data']` (semua 4 slug) karena Bab 2 mencakup keempat course. Kolom `template_topics` di tabel `materials` adalah `VARCHAR(50)[]` justru untuk mengakomodasi cakupan multi-topik per PDF.

## 8. Reproducibility

Kolom `generation_seed VARCHAR(64)` di `subtopic_cache` menyimpan `sha256(cache_key).slice(0,16)`. Karena gpt-5-mini tidak mengekspos parameter `seed` di API, nilai ini berfungsi sebagai *provenance tag* — bukan jaminan determinisme — yang memungkinkan peneliti mendeteksi regenerasi tidak disengaja (mis. saat baris cache dihapus dan dibuat ulang dengan `cache_key` sama). `source_chunk_ids UUID[]` di baris yang sama menyimpan daftar chunk persis yang dipakai saat generation, sehingga pertanyaan reviewer "konten subtopik ini sumbernya halaman berapa di buku?" dijawab oleh `SELECT page_number FROM material_chunks WHERE id = ANY(source_chunk_ids)`.

## Catatan untuk Reviewer Sidang

Tiga klaim yang akan diuji di sidang dapat dibuktikan dari dokumen + DB ini sekaligus: (a) bahwa 4 course mencerminkan struktur kurikulum nasional — verifikasi via mapping halaman 29-105 buku Mushthofa dkk. 2023 ke kolom Halaman buku di tabel Section 3; (b) bahwa urutan leaf sengaja terkunci progresif — verifikasi via `course_unlock_dependencies` (Section 4) dan helper unlock di [`src/lib/learning-progress.ts`]; (c) bahwa konten subtopik tidak dikarang — verifikasi via `cited_material_chunk_ids` di baris `ask_question_history` dan `source_chunk_ids` di `subtopic_cache`, di-join ke `material_chunks.page_number` untuk merujuk halaman buku/modul yang dipakai. Status operasional saat dokumen ini ditulis: 26 leaf sudah di-seed di DB (verified); cache lock belum berisi konten produksi karena upload PDF ke `materials` belum dijalankan (`COUNT(*) materials = 0`, pre-uji lapangan).
