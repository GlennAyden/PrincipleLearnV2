# Rencana Eksekusi Minimum Viable Revision (MVR)

**Konteks**: Dokumen ini menerjemahkan keputusan arahan media (lihat `rencana-penyelarasan-media-ai-sokratik.md` + sesi klarifikasi 2026-05-16) menjadi rencana sprint 8 minggu yang dapat dieksekusi oleh peneliti tunggal atau dibagi ke agent.

**Tujuan akhir**: Seluruh 8 item MVR siap sebelum uji lapangan tesis "Pengembangan Media AI Sokratik Berbasis Sumber pada Pembelajaran Algoritma Pemrograman".

**Arsitektur final yang dipakai sepanjang rencana**:

- **Dua mode** ditetapkan per-course di `request-course/step1`: Mode Umum (preserve fitur lama) + Mode Penelitian (semua kerasanan riset).
- **Mode Penelitian** mengaktifkan: domain guard Fase E, RAG bank sumber + citation, AI Sokratik graduated (tier 1→2→3), PseudocodeEditor.
- **Data**: kedua mode disimpan dengan kolom `mode VARCHAR CHECK IN ('general','research')`; dashboard & ekspor RM2/RM3 default filter `mode='research'`.
- **Course riset**: siswa pilih dari 8 template Fase E pre-created admin.
- **Hint tier**: tombol manual "Minta Hint Berikutnya"; `scaffold_tier INT` auto-tracked.
- **Bank sumber**: admin upload PDF → ekstrak → chunk → embed → `material_chunks` (pgvector).
- **IRR**: rater manusia kedua (S2/dosen pembimbing) + LLM sebagai tiebreaker.

---

## 1. Asumsi & Dependency Teknis

| Asumsi | Catatan |
|---|---|
| pgvector tersedia di Supabase project `wesgoqdldgjbwgmubfdm` | Sudah default-available di Supabase Postgres; perlu `CREATE EXTENSION vector;` |
| Node.js 22.x | Sudah sesuai `package.json#engines.node` |
| PDF parser dipakai `pdf-parse` (atau `unpdf` untuk pure ESM) di Node | Tambah dependency baru; jalankan di server (API route) |
| Embedding pakai OpenAI `text-embedding-3-small` (1536 dim) | Sudah ada `OPENAI_API_KEY`; tambah env `OPENAI_EMBEDDING_MODEL=text-embedding-3-small` |
| Chunk strategy: 600 token per chunk, overlap 80 token | Standar RAG untuk teks edukasi; tunable |
| Top-k retrieval: k=4, threshold cosine similarity ≥ 0.65 | Tunable; di-fallback "sumber tidak cukup" jika threshold tidak tercapai |
| Storage PDF: Supabase Storage bucket `materials/` | Akses via service role; siswa tidak punya akses |
| Drag-drop library: `@dnd-kit/core` + `@dnd-kit/sortable` | Untuk ParsonsProblem & PseudocodeBlockBuilder; lightweight (~30KB), accessible |
| Flowchart library: `reactflow` (atau custom SVG) | Untuk FlowchartBuilder; reactflow lebih kaya tapi 100KB+; custom SVG ringan tapi development time +3 hari |
| Visual animasi pseudocode execution: custom React komponen (no Pyodide) | Step-by-step simulator tertulis manual per topik; tidak perlu runtime Python di browser |

---

## 2. Dependency Graph 12 Item MVR (8 utama + 4 sub-item baru)

```text
                         [Item 1: Mode flag + toggle]
                                    │
              ┌─────────────────────┼─────────────────────┐
              ▼                     ▼                     ▼
   [Item 2: 4 Templates    [Item 3: Bank sumber  [Item 6: PseudocodeEditor
    + 26 subtopik + domain  + multi-topic mapping  + artefak submission]
    guard + unlock-deps]    + admin uploader]            │
              │                     │                     │
              │                     ▼                     │
              │           [Item 4: RAG pipeline           │
              │            + citation logging]            │
              │                     │                     │
              │                     ▼                     │
              │           [Item 4b: Cache lock + QA       │
              │            workflow konten subtopik]      │
              │                     │                     │
              └──────────┬──────────┘                     │
                         ▼                                │
              [Item 5: Rewrite system prompt              │
               Sokratik graduated + closing               │
               reflective + citation injection]           │
                         │                                │
                         ▼                                │
              [Item 7: Hint tier mechanism                │
               (button UI + scaffold_tier col)]           │
                         │                                │
                         ▼                                │
              [Item 7b: Unlock progresif                  │
               4 course Fase E (gate + UI)]               │
                         │                                │
                         ▼                                │
              [Item 9: Komponen Interaktif Subtopik       │
               (Foundation + 6 komponen + AI auto-trigger │
               reflektif + content authoring ~22 instans)]│
                         │                                │
                         └──────────────┬─────────────────┘
                                        ▼
                         [Item 8: Prompt revisions logging
                          + ekspor per-prompt + IRR workflow]
                                        │
                                        ▼
                         [Item 10: Admin Mode Toggle
                          + Filter Propagation
                          (cookie + UI + 7 pages + 16 endpoints)]
```

**Critical path**: Item 1 → Item 3 → Item 4 → Item 4b → Item 5 → Item 7 → Item 7b → Item 9 → Item 8 → Item 10.
**Parallel tracks**: Item 2 (template + 26 subtopik + unlock-deps) dan Item 6 (PseudocodeEditor) dapat dikerjakan paralel setelah Item 1. Item 4b memerlukan retrieval service dari Item 4 sudah jalan. Item 7b memerlukan struktur Item 2 (unlock-deps table) + Item 1 (mode flag). Item 9 Foundation (9.1) memerlukan Item 5 (untuk AI auto-trigger pakai socratic prompt) + Item 6 (research_artifacts pipeline sudah aktif); 9.2 dan 9.3 dapat dibangun paralel oleh dua track jika ada developer kedua. Item 10 paling akhir karena perlu seluruh halaman admin (yang dibangun di Item 3, 4b, 7b, 9.4) sudah ada — toggle dipasang setelah semua page jadi.

---

## 3. Sprint Timeline (13 Minggu)

| Minggu | Fokus | Item MVR | Output |
|---|---|---|---|
| **W1** | Foundation mode + skema | Item 1 (sebagian) | Migration `mode` column di 7 tabel kunci; flag terpropagasi di seluruh write path |
| **W2** | Mode toggle UI + 4 Templates + 26 subtopik + unlock-deps | Item 1 (selesai) + Item 2 (penuh) | Toggle di `request-course/step1`; seed 4 course (mengikuti Bab 2 Mushthofa dkk. 2023) + 26 leaf-subtopik kanonik; `course_unlock_dependencies` terisi 3 baris |
| **W3** | Bank sumber: skema multi-topic + upload | Item 3 (skema + upload) | `materials.template_topics VARCHAR[]`, `material_chunks` table; admin upload PDF UI dengan multi-select topik; PDF parser pipeline |
| **W4** | Bank sumber: chunking + embedding | Item 3 (selesai) + Item 4 (skema) | Chunker + embedder berjalan; `material_chunks.embedding vector(1536)` terisi; GIN index aktif |
| **W5** | RAG retrieval + citation + Cache lock + QA UI | Item 4 (selesai) + Item 4b | `ask-question` & `challenge-thinking` panggil retrieval; citation `[c123]` injected; subtopic cache lock + admin `/sumber/cache-review` queue |
| **W6** | Sokratik prompts + Hint tier | Item 5 + Item 7 | System prompt graduated baru; tombol Hint Berikutnya; `scaffold_tier` tersimpan |
| **W7** | PseudocodeEditor + artefak + Unlock progresif | Item 6 + Item 7b | Editor component live; submit ke `research_artifacts`; helper unlock + gate backend + 8-card jalur Fase E di dashboard |
| **W8** | Interaktif: Foundation + Pre-generate 26 subtopik | Item 9.1 + Item 4b (pre-gen) | Skema `interactive_blocks` + enum baru artifact_type + `useInteractionTracking` hook + AI auto-trigger pipeline; peneliti jalankan pre-generate konten 26 leaf + review |
| **W9** | Interaktif: Komponen Ringan (3) | Item 9.2 | TraceTable + OutputPredictor + ParsonsProblem live; semua submit ke `research_artifacts`; AI auto-trigger reflektif jalan untuk ketiganya |
| **W10** | Interaktif: Komponen Kompleks (3) | Item 9.3 | BugHunt + FlowchartBuilder + PseudocodeBlockBuilder live; integrasi `reactflow` & `dnd-kit` |
| **W11** | Content authoring (peneliti) + Admin Mode Toggle Foundation (developer paralel) | Item 9.4 + Item 10.1-10.2 | Peneliti tulis JSON config untuk ~22 instansiasi komponen di 18+ leaf-subtopik; developer bangun `AdminModeProvider` + cookie + header toggle UI + helper `applyAdminModeFilter` |
| **W12** | Revisi logging + ekspor + IRR pilot + Admin Mode Filter Propagation | Item 8 + Item 10.3-10.5 | `prompt_revisions` aktif; ekspor `data_type=prompts_detail`; IRR codebook + 25% sampel double-coded; integrasi filter mode di 7 page + 16 endpoint admin + navigation visibility + audit log |
| **W13** | Pilot test 3 siswa + bug fixing buffer | Pilot + DoD checklist | 3 siswa selesai minimal 1 course Mode Penelitian; admin verifikasi Mode Penelitian filter berjalan benar; bug & UX fix; tag `mvr-final` |

**Buffer**: minggu 1-13 sudah padat. Jika ada delay, prioritas penyelamatan:

- **Critical path tidak bisa di-slip**: Item 1, 3, 4, 4b, 5, 7b, 9.1 Foundation, 8.
- **Yang boleh di-defer ke post-MVR (data collection round 2)** kalau timeline mepet: 2-3 komponen Item 9.3 paling kompleks (FlowchartBuilder paling berat; BugHunt & PseudocodeBlockBuilder bisa dipotong jadi versi minimal). Risiko: kehilangan beberapa dimensi RM3 evidence untuk topik tertentu.
- **Yang boleh di-skip total kalau krisis waktu**: 5-7 dari 20-25 instansiasi interaktif (pilih topik yang paling penting: percabangan, perulangan, tracing, debugging).

---

## 4. Breakdown per Item MVR

### Item 1: Mode toggle + flag `mode` di skema

**Tujuan**: Setiap aktivitas siswa tertaut ke salah satu dari dua mode (`general` atau `research`).

**Sub-task**:

1. **DB migration** (`docs/sql/2026-05-XX_add_mode_column.sql`):
   - Tambah `mode VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (mode IN ('general','research'))` di:
     - `courses`
     - `learning_sessions`
     - `ask_question_history`
     - `challenge_responses`
     - `jurnal`
     - `quiz_submissions`
     - `prompt_classifications`
   - Indeks: `CREATE INDEX idx_<table>_mode ON <table>(mode);`
   - Backfill existing rows: `UPDATE ... SET mode = 'general' WHERE mode IS NULL;`
2. **Skema TypeScript** (`src/lib/database.ts`, `src/lib/schemas.ts`):
   - Tambah enum `LearningMode = 'general' | 'research'`.
   - Update Zod schema `GenerateCourseSchema` agar menerima `mode: z.enum(['general','research'])`.
3. **Context propagation** (`src/context/RequestCourseContext.tsx`):
   - Tambah field `mode` di `RequestCourseAnswers`; default `'general'`.
4. **UI toggle** (`src/app/request-course/step1/page.tsx`):
   - Tambah radio group "Mode Pembelajaran": Umum (default) | Penelitian.
   - Tambah deskripsi singkat per mode + tooltip.
5. **Write-path propagation** — pastikan setiap API route yang menulis ke tabel di atas membaca `course.mode` dan menyimpannya ke baris baru:
   - `/api/ask-question/route.ts`
   - `/api/challenge-thinking/route.ts` + `/api/challenge-response/route.ts` + `/api/challenge-feedback/route.ts`
   - `/api/jurnal/save/route.ts`
   - `/api/quiz/submit/route.ts`
   - `/api/learning-progress/route.ts` (untuk learning_sessions)
6. **Filter di admin** — foundation saja di Item 1: setiap query admin yang menyentuh tabel ber-`mode` flag wajib menerima parameter mode (default `'general'` untuk backward compat). Toggle UI global + propagasi penuh ke seluruh halaman admin dibangun terpisah di **Item 10: Admin Mode Toggle + Filter Propagation**.

**Acceptance criteria**:

- [ ] Migration di-apply tanpa error; backfill 100% baris existing → `mode='general'`.
- [ ] Buat 1 course Mode Umum dan 1 Mode Penelitian; semua aktivitas turunan (ask, challenge, jurnal, quiz, session) memiliki nilai `mode` yang konsisten dengan course-nya.
- [ ] Dashboard `/admin/dashboard` default hanya menghitung Mode Penelitian; toggle "lihat semua" mengembalikan angka penuh.
- [ ] Ekspor `/api/admin/research/export` default `mode=research`; opsional query param `&mode=all`.

---

### Item 2: 8 Course Template Fase E + Domain Guard

**Tujuan**: Siswa di Mode Penelitian hanya bisa pilih dari 8 course pre-created; AI menolak halus pertanyaan di luar Fase E.

**Spek kanonik 4 course + 26 leaf-subtopik** (mengikuti struktur Bab 2 buku resmi: **Mushthofa dkk., 2023, *Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi*, Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi RI**). Konten paragraf dikosongkan di seed — diisi via AI-from-bank-sumber di Item 4b cache lock.

| # | Slug `template_topic` | Judul Course (= subbab buku) | Halaman buku | Leaf-subtopik kanonik (urutan terkunci) | Unlock-prereq |
|---|---|---|---|---|---|
| 1 | `mengenal-algoritma` | Mengenal Algoritma dan Pemrograman | 29-44 | (1.1) Algoritma: Definisi & Hubungan Berpikir Komputasional · (1.2) Diagram Alir: Notasi ANSI/ISO · (1.3) Diagram Alir: Contoh & Latihan (Luas Persegi, Kubus, Membagi Bilangan, Hitung Mundur, Mencari Terbesar) · (1.4) Menelusuri Diagram Alir (Tracing) · (1.5) Pseudokode: Konvensi & Contoh · (1.6) Menelusuri Pseudokode | — (entry) |
| 2 | `struktur-kendali` | Membuat Program Sesuai Struktur Kendalinya | 45-79 | (2.1) Belajar Algoritma sambil Menyelesaikan Masalah · (2.2) Ekspresi: Operand & Operator · (2.3) Operator Matematika/Logika/Relasional/Kesamaan · (2.4) Percabangan If-Else · (2.5) Percabangan Switch-Case · (2.6) Percabangan Bersarang · (2.7) Perulangan For-Loop · (2.8) Perulangan While · (2.9) Perulangan Do-While · (2.10) Perulangan Bersarang & Perulangan Tak Terbatas · (2.11) Fungsi: Membuat & Memanggil · (2.12) Fungsi: Variabel Lokal | mengenal-algoritma |
| 3 | `memilih-algoritma` | Memilih Algoritma untuk Masalah di Kehidupan Nyata | 80-95 | (3.1) Pencarian (Searching): Konsep · (3.2) Pengurutan (Sorting): Pengantar · (3.3) Bubble Sort · (3.4) Insertion Sort · (3.5) Selection Sort | struktur-kendali |
| 4 | `struktur-data` | Memilih Struktur Data untuk Masalah di Kehidupan Nyata | 96-105 | (4.1) Pengantar Struktur Data · (4.2) Antrean (Queue) · (4.3) Tumpukan (Stack) | memilih-algoritma |

Total: **26 leaf-subtopik kanonik** (6 + 12 + 5 + 3). Course 2 paling padat (12 leaf) karena buku mengonsentrasikan ekspresi, percabangan, perulangan, dan fungsi di satu subbab — ini disengaja untuk mengikuti urutan kurikulum resmi. Setiap leaf-subtopik akan memunculkan: konten paragraf (AI-from-bank-sumber, cached + locked, lihat Item 4b), 1 quiz block (AI-generated per request dari bank sumber), 1 challenge thinking block (AI-generated per request), dan — khusus leaf yang melibatkan koding (1.2-1.6, semua 2.x, semua 3.x, 4.2, 4.3) — 1 slot PseudocodeEditor (Item 6) dan/atau komponen interaktif (Item 9).

**Justifikasi 4-course (bukan 8-course versi awal)**: Struktur 4 course mengikuti **1:1 Bab 2 buku Kemdikbudristek 2023** sebagai sumber primer kurikulum Fase E. Ini lebih mudah dipertahankan di sidang karena setiap klaim "berbasis kurikulum Fase E" dapat dirujuk langsung ke halaman buku (29-105). Topik seperti tracing, debugging, dan evaluasi solusi yang sebelumnya jadi course terpisah sekarang tertanam sebagai sub-praktik di dalam leaf-subtopik (mis. tracing di leaf 1.4 & 1.6; debugging diamati via komponen BugHunt di Item 9; evaluasi via challenge thinking + StructuredReflection).

**Sub-task**:

1. **Seed script** (`scripts/seed-research-templates.ts`):
   - Insert 4 `courses` dengan `mode='research'`, `is_template=true`, `template_topic=<slug>`, `created_by=<admin_id>`, `source_reference='Mushthofa dkk. 2023 Bab 2 hal. <range>'`.
   - Untuk setiap course: insert `subtopics` (sebagai modul tunggal pembungkus) + `leaf_subtopics` sesuai daftar di atas (total 26 leaf), dengan `title`, `normalized_title`, dan `display_order`. **Kolom `content` di leaf-subtopik dibiarkan kosong** — akan diisi oleh pipeline Item 4b.
   - Insert ke tabel baru `course_unlock_dependencies(course_template_topic VARCHAR(50) PRIMARY KEY, prereq_template_topic VARCHAR(50) REFERENCES course_unlock_dependencies(course_template_topic))` sesuai kolom Unlock-prereq di atas (3 baris: course 2 → prereq 1, course 3 → prereq 2, course 4 → prereq 3).
2. **Kolom baru** di `courses`: `is_template BOOLEAN DEFAULT false`, `template_topic VARCHAR(50)` (slug topik Fase E), `source_reference TEXT` (kutipan halaman buku sumber kurikulum).
3. **Endpoint baru** `/api/courses/research-templates`:
   - GET: list 4 template + status unlock per siswa (computed via Item 7b helper).
4. **UI** di `request-course/step1` saat Mode Penelitian dipilih:
   - Sembunyikan textarea topik bebas.
   - Tampilkan grid 4 card template dalam **urutan kanonik 1→4 sesuai Bab 2 buku**; card terkunci tampil disabled dengan badge "Selesaikan {prereq} dulu (≥70%)". Setiap card menampilkan referensi halaman buku.
   - Step 2-3 tetap (level + goal/problem), tapi `topic` auto-filled.
5. **Backend validator** di `/api/generate-course/route.ts`:
   - Jika `mode='research'`: reject jika `template_topic` tidak ada di whitelist 4 slug (`mengenal-algoritma`, `struktur-kendali`, `memilih-algoritma`, `struktur-data`) ATAU jika prereq belum 70% (gunakan helper Item 7b).
   - Jika `mode='general'`: passthrough seperti sekarang.
6. **Domain guard di system prompt** (lihat Item 5 untuk integrasi prompt):
   - Tambah instruksi: "Anda hanya membahas topik {template_topic} (Bab 2 hal. {source_reference} Mushthofa dkk. 2023). Untuk pertanyaan di luar itu, katakan: 'Pertanyaan ini di luar topik {template_topic}. Mari kita kembali ke ...'"

**Acceptance criteria**:

- [ ] 4 course template + 26 leaf-subtopik kanonik ada di DB; semua course dengan `mode='research'` dan `is_template=true`; setiap course punya `source_reference` ke halaman buku Mushthofa dkk. 2023.
- [ ] Tabel `course_unlock_dependencies` terisi 3 baris (course 2 → prereq 1, course 3 → prereq 2, course 4 → prereq 3).
- [ ] Siswa Mode Penelitian di step1 hanya melihat 4 template; course tanpa prereq selesai tampil disabled dengan badge prereq.
- [ ] `/api/generate-course` reject 400 jika body `mode='research'` tanpa `template_topic` valid (salah satu dari 4 slug) ATAU prereq belum 70%.
- [ ] Pertanyaan out-of-scope di `ask-question` Mode Penelitian → AI menjawab dengan redirect halus (validasi via 3 test prompt).

---

### Item 3: Bank Sumber + Admin Source Manager

**Tujuan**: Admin upload PDF buku/modul Fase E → sistem ekstrak + chunk + embed → siap untuk RAG.

**Sub-task**:

1. **DB migration** (`docs/sql/2026-05-XX_materials_and_chunks.sql`):
   - `CREATE EXTENSION IF NOT EXISTS vector;`
   - Tabel `materials`:
     ```sql
     CREATE TABLE materials (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       title VARCHAR(255) NOT NULL,
       author VARCHAR(255),
       edition VARCHAR(50),
       template_topics VARCHAR(50)[] NOT NULL,  -- multi-select: 1 PDF bisa cover beberapa slug Fase E
       source_url TEXT,
       storage_path TEXT NOT NULL,  -- supabase storage path
       file_size_bytes BIGINT,
       page_count INT,
       validation_status VARCHAR(20) DEFAULT 'draft' CHECK (validation_status IN ('draft','validated','retired')),
       validated_by UUID REFERENCES users(id),
       validated_at TIMESTAMPTZ,
       uploaded_by UUID REFERENCES users(id),
       created_at TIMESTAMPTZ DEFAULT now(),
       updated_at TIMESTAMPTZ DEFAULT now()
     );
     ```
   - Tabel `material_chunks`:
     ```sql
     CREATE TABLE material_chunks (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
       chunk_idx INT NOT NULL,
       chunk_text TEXT NOT NULL,
       page_number INT,
       token_count INT,
       embedding vector(1536),
       created_at TIMESTAMPTZ DEFAULT now(),
       UNIQUE (material_id, chunk_idx)
     );
     CREATE INDEX idx_material_chunks_topic ON material_chunks (material_id);
     CREATE INDEX idx_material_chunks_embedding ON material_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
     CREATE INDEX idx_materials_template_topics ON materials USING GIN (template_topics);  -- untuk query "topik X ANY template_topics"
     ```
2. **Supabase Storage** bucket `materials/` (private, service-role only).
3. **PDF parser** — dependency baru: `npm i pdf-parse` (atau `unpdf`).
4. **Chunker service** (`src/services/material-chunker.service.ts`):
   - Input: full text + metadata.
   - Output: array chunk { text, page, token_count } dengan target 600 token + overlap 80.
   - Gunakan `tiktoken` atau approximation 1 token ≈ 4 char.
5. **Embedder service** (`src/services/embedding.service.ts`):
   - Batch call OpenAI `text-embedding-3-small`; rate-limit aware (max 100 chunks per batch).
6. **Endpoint admin upload** `/api/admin/sumber/upload/route.ts`:
   - POST multipart form: file PDF + metadata (title, author, edition, `template_topics` sebagai array).
   - Pipeline: upload ke Storage → parse PDF → insert `materials` → chunk → embed → bulk insert `material_chunks`.
   - Return summary: total halaman, total chunks, topik yang dicakup, total embedding cost.
7. **Endpoint admin CRUD** `/api/admin/sumber/` (GET list, GET [id], PATCH validate, PATCH retag (ubah `template_topics`), DELETE retire).
8. **Admin UI** `/admin/sumber/page.tsx`:
   - Tabel materials dengan filter per topik (mencocokkan `topik = ANY(template_topics)`) + `validation_status`.
   - Tombol "Upload PDF Baru" → modal form dengan checkbox multi-select 8 topik Fase E.
   - Aksi per row: Validasi, Re-tag topik, Retire, Lihat Chunks.

**Acceptance criteria**:

- [ ] `vector` extension aktif di Supabase project.
- [ ] Upload 1 PDF (mis. 30 halaman buku algoritma) → 50-80 chunks tersimpan dengan embedding non-null.
- [ ] Admin dapat list, validasi, dan retire material via UI.
- [ ] `material_chunks` dapat di-query dengan `<=>` (cosine distance) dan menghasilkan top-k sesuai pertanyaan tes.

---

### Item 4: RAG Pipeline + Citation Logging

**Tujuan**: Saat siswa Mode Penelitian bertanya, AI hanya menjawab dari `material_chunks` yang ter-retrieve + cite chunk yang dipakai.

**Sub-task**:

1. **DB migration**:
   - Tambah `cited_material_chunk_ids UUID[]` di:
     - `ask_question_history`
     - `challenge_responses`
2. **Retrieval service** (`src/services/rag.service.ts`):
   - `retrieveContext(query: string, templateTopic: string, k=4, threshold=0.65)`:
     - Embed query via embedder.
     - Query: `SELECT mc.id, mc.chunk_text, mc.page_number, 1 - (mc.embedding <=> $1) AS similarity FROM material_chunks mc JOIN materials m ON mc.material_id = m.id WHERE $2 = ANY(m.template_topics) AND m.validation_status='validated' ORDER BY mc.embedding <=> $1 LIMIT $3`. Gunakan GIN index `idx_materials_template_topics`.
     - Filter hasil dengan `similarity >= threshold`.
     - Return `{ chunks: [{id, text, page, similarity}], totalRetrieved, aboveThreshold }`.
3. **Integrasi di `/api/ask-question/route.ts`** (Mode Penelitian saja):
   - Sebelum panggil OpenAI: panggil `retrieveContext()`.
   - Jika `aboveThreshold === 0` → kembalikan respons SSE dengan teks: "Materi ini belum tersedia di bank sumber kami. Mari kita rumuskan ulang pertanyaanmu — coba kaitkan dengan {template_topic}."
   - Jika ada chunks: build user message dengan tag `<source id="c{id}" page="{page}">{text}</source>` dan instruksi sistem "Jawab HANYA dari teks di dalam tag <source>; sertakan citation [c{id}] di setiap klaim faktual."
4. **Citation parser** (`src/services/citation-parser.service.ts`):
   - Setelah streaming selesai, regex parse `\[c([a-f0-9-]+)\]` dari respons → dedup → simpan ke `ask_question_history.cited_material_chunk_ids`.
5. **Sama untuk `/api/challenge-thinking/route.ts`** dan `/api/challenge-feedback/route.ts`.

**Acceptance criteria**:

- [ ] Mode Penelitian + pertanyaan terkait topik yang ada di bank sumber → respons AI mengandung minimal 1 citation `[c<uuid>]`; baris di `ask_question_history` memiliki `cited_material_chunk_ids` non-empty.
- [ ] Pertanyaan di luar bank sumber → respons fallback (tidak mengarang) + `cited_material_chunk_ids` empty array + `mode='research'`.
- [ ] Mode Umum tetap berperilaku seperti sekarang (tidak ada retrieval, tidak ada citation).

---

### Item 4b: Cache Lock + QA Workflow untuk Konten Subtopik Kanonik

**Tujuan**: Konten teks subtopik kanonik Mode Penelitian di-generate AI dari bank sumber **sekali saja** (siswa pertama trigger), lalu peneliti review & approve di admin UI sebelum siswa lain bisa akses. Menjamin comparability konten antar siswa untuk validitas RM2/RM3.

**Sub-task**:

1. **DB migration** (`docs/sql/2026-05-XX_subtopic_cache_lock.sql`):
   - Tambah kolom di `subtopic_cache`:

     ```sql
     ALTER TABLE subtopic_cache
       ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general' CHECK (mode IN ('general','research')),
       ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false,
       ADD COLUMN qa_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (qa_status IN ('pending','approved','needs_revision','rejected')),
       ADD COLUMN qa_reviewed_by UUID REFERENCES users(id),
       ADD COLUMN qa_reviewed_at TIMESTAMPTZ,
       ADD COLUMN qa_notes TEXT,
       ADD COLUMN source_chunk_ids UUID[] DEFAULT '{}',  -- chunks bank sumber yang dipakai
       ADD COLUMN generation_seed VARCHAR(64),  -- deterministic seed untuk reproducibility
       ADD COLUMN generated_by UUID REFERENCES users(id);
     CREATE INDEX idx_subtopic_cache_mode_qa ON subtopic_cache (mode, qa_status);
     ```

2. **Layer caching baru** (`src/services/subtopic-cache-research.service.ts`):
   - `getOrGenerateResearchSubtopic(courseId, leafSubtopicId, userId)`:
     - Cari row di `subtopic_cache` dengan `mode='research'` + matching `cache_key`.
     - Jika `qa_status='approved'` → return content (semua siswa boleh akses).
     - Jika `qa_status='pending'` dan `generated_by IS NOT NULL` → return error `CONTENT_UNDER_REVIEW` dengan pesan ramah ke siswa: "Materi ini sedang disiapkan peneliti. Coba lagi dalam 1-2 hari."
     - Jika tidak ada row → trigger generation: panggil `retrieveContext()` ambil top-8 chunks dari bank sumber untuk `template_topic` ini, build prompt "Generate konten ekspositoris terstruktur 3-5 paragraf, key takeaways 4-6 bullet, dari sumber berikut: <chunks>", call OpenAI (temp=0.2, seed=hash(leafSubtopicId)), simpan dengan `qa_status='pending'`, `locked=true`, `source_chunk_ids=[...]`, `generated_by=userId`.
3. **Endpoint admin QA** `/api/admin/sumber/cache-review/route.ts`:
   - GET: list semua row `mode='research'` dengan `qa_status IN ('pending','needs_revision')`, sorted by `created_at`.
   - GET `[id]`: detail row + tampilkan source_chunks untuk verifikasi.
   - PATCH `[id]`: body `{ action: 'approve'|'request_revision'|'regenerate'|'edit', qa_notes?, content_override? }`.
     - `approve` → set `qa_status='approved'`, `qa_reviewed_by`, `qa_reviewed_at`.
     - `request_revision` → set `qa_status='needs_revision'`, simpan notes; peneliti edit langsung lewat textarea atau trigger regenerate.
     - `regenerate` → ulang call OpenAI dengan instruksi tambahan dari `qa_notes`.
     - `edit` → simpan `content_override` ke kolom `content`, set `qa_status='approved'`.
4. **Admin UI** `src/app/admin/sumber/cache-review/page.tsx`:
   - Queue panel: row pending di kiri, preview content + sources di kanan.
   - Tombol per row: ✅ Approve · ✏️ Edit · 🔄 Regenerate dengan catatan · ❌ Reject.
   - Search & filter per `template_topic`.
5. **Integrasi di subtopic page handler** — `/api/generate-subtopic/route.ts` route Mode Penelitian ke layer baru; Mode Umum tetap pakai cache lama (tanpa lock + QA).
6. **Pre-generation script opsional** (`scripts/pre-generate-research-subtopics.ts`) — untuk dipakai di W7 jika peneliti ingin pre-generate semua 38 leaf-subtopik sekaligus (menghindari siswa pertama "menunggu").

**Acceptance criteria**:

- [ ] Siswa pertama akses leaf-subtopik Mode Penelitian → trigger generation; konten tersimpan dengan `qa_status='pending'`.
- [ ] Siswa kedua akses leaf-subtopik yang sama (masih `pending`) → mendapat pesan "Materi sedang disiapkan".
- [ ] Peneliti approve di `/admin/sumber/cache-review` → semua siswa berikutnya dapat konten **identik byte-for-byte**.
- [ ] Edit manual konten via UI berfungsi; `content_override` tersimpan dan ditampilkan ke siswa.
- [ ] Pre-generation script menghasilkan 38 row di `subtopic_cache mode='research'`.
- [ ] Mode Umum: cache lama tetap berjalan tanpa lock (tidak ada regresi).

---

### Item 5: Rewrite System Prompt Sokratik Graduated

**Tujuan**: Di Mode Penelitian, AI menahan jawaban tier 1-2, baru memberi solusi penuh di tier 3; selalu tutup dengan pertanyaan reflektif.

**Sub-task**:

1. **System prompt baru** untuk `/api/ask-question/route.ts` (Mode Penelitian):
   - Buat template di `src/services/prompts/socratic-ask-question.ts`:
     ```text
     Anda tutor AI Sokratik berbasis sumber untuk algoritma Fase E.
     Topik aktif: {template_topic}.
     Tier scaffolding saat ini: {scaffold_tier} (1=diagnostik, 2=hint terarah, 3=solusi penuh dengan walkthrough).
     Sumber tersedia: {sources_xml}.
     
     Aturan:
     1. Tier 1: JANGAN beri solusi. Ajukan 1-2 pertanyaan diagnostik (Apa input? Apa output? Asumsi apa yang sudah kamu buat?).
     2. Tier 2: Beri 1 hint konkret + 1 pertanyaan lanjutan; JANGAN tulis pseudocode lengkap.
     3. Tier 3: Boleh memberi solusi penuh dengan walkthrough; tetap diakhiri pertanyaan reflektif.
     4. Selalu jawab HANYA dari isi <source>; sertakan [c{id}] di setiap klaim faktual.
     5. Jika pertanyaan di luar {template_topic}, redirect halus.
     6. Tutup dengan SATU pertanyaan reflektif atau tugas mikro.
     ```
2. **Sama untuk `/api/challenge-feedback/route.ts`**: feedback tidak lagi langsung mengungkap "Key Concepts to Know" di tier 1-2.
3. **Pass `scaffold_tier`** dari payload request (lihat Item 7) ke prompt builder.
4. **Versioning prompt** — tambah kolom `prompt_template_version VARCHAR(20)` di `ask_question_history` dan `challenge_responses`; default `'socratic_v1'`.
5. **Mode Umum tetap pakai prompt lama** — branching by `course.mode`.

**Acceptance criteria**:

- [ ] Test prompt "Buatkan langsung pseudocode mencari bilangan terbesar dari 5 angka" di Mode Penelitian tier 1 → AI menjawab dengan pertanyaan IPO, **tidak** memberi pseudocode.
- [ ] Setelah siswa eskalasi ke tier 3 → AI memberi pseudocode penuh + walkthrough + citation + closing reflective question.
- [ ] Mode Umum dengan prompt sama → AI tetap memberi pseudocode langsung (perilaku lama dipertahankan).
- [ ] Setiap respons di Mode Penelitian diakhiri tanda tanya atau kata "Coba ..." (validasi via regex on 10 sampel response).

---

### Item 6: PseudocodeEditor + Artefak Submission

**Tujuan**: Siswa Mode Penelitian dapat menulis pseudocode/solusi dan submit ke `research_artifacts` untuk dianalisis dimensi CT.

**Sub-task**:

1. **Aktifkan `research_artifacts`** — sudah ada skema, perlu:
   - Tambah `learning_session_id` FK (jika belum) + `mode` flag.
   - Index `idx_research_artifacts_session` dan `idx_research_artifacts_user`.
2. **Komponen baru** `src/components/PseudocodeEditor/PseudocodeEditor.tsx`:
   - Textarea dengan line numbering (CSS counter atau react-textarea-code-editor).
   - Toolbar: insert template (BEGIN/END, INPUT/OUTPUT, IF/ENDIF, WHILE/ENDWHILE, FOR/ENDFOR).
   - Tombol "Simpan Draft" (autosave ke localStorage) + "Submit untuk Review" (POST ke API).
   - Counter: jumlah baris, jumlah blok kontrol.
3. **Endpoint** `/api/research-artifacts/submit/route.ts`:
   - POST `{ courseId, subtopicId, learningSessionId, artifactType='pseudocode', artifactContent, relatedPromptIds[] }`.
   - Insert `research_artifacts` dengan `mode='research'`, `coding_status='uncoded'`, `research_validity_status='pending'`.
4. **Integrasi di subtopic page** (`src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx`):
   - Tampilkan editor hanya jika `course.mode === 'research'`.
   - Letakkan di tab/accordion "Tulis Pseudocode".
5. **Admin view** — tampilkan artefak per siswa di `/admin/siswa/[id]/`:
   - Tab baru "Artefak" listing pseudocode submission + link ke prompt terkait.

**Acceptance criteria**:

- [ ] Editor muncul HANYA di subtopic Mode Penelitian.
- [ ] Submit pseudocode 10 baris → baris baru di `research_artifacts` dengan `artifact_content` utuh, `mode='research'`, terhubung ke `learning_session_id` aktif.
- [ ] Admin melihat artefak siswa di `/admin/siswa/[id]/` tab Artefak.
- [ ] Mode Umum: editor tidak muncul (tidak ada regresi).

---

### Item 7: Hint Tier Mechanism

**Tujuan**: Siswa dapat eskalasi bantuan tier 1→2→3 dengan tombol; sistem mencatat tier per request untuk analisis scaffolding.

**Sub-task**:

1. **DB migration**:
   - Tambah `scaffold_tier INT DEFAULT 1 CHECK (scaffold_tier BETWEEN 1 AND 3)` di:
     - `ask_question_history`
     - `challenge_responses`
2. **UI** di `AskQuestion/QuestionBox.tsx` dan `ChallengeThinking/ChallengeBox.tsx` (Mode Penelitian saja):
   - Tampilkan tier saat ini sebagai badge (Tier 1: Diagnostik / Tier 2: Hint / Tier 3: Solusi).
   - Tombol "Minta Hint Berikutnya" muncul setelah respons AI tier 1 atau 2.
   - Klik tombol → resubmit pertanyaan dengan `scaffold_tier + 1`.
   - Pertanyaan baru (bukan follow-up) → reset ke tier 1.
3. **Payload extension** — schema `AskQuestionSchema` dan `ChallengeThinkingSchema` tambah `scaffoldTier: z.number().int().min(1).max(3).default(1)`.
4. **Prompt integration** (Item 5) — `scaffold_tier` masuk ke prompt builder.
5. **Logging** — tier disimpan di kolom `scaffold_tier`.

**Acceptance criteria**:

- [ ] Mode Penelitian: tombol "Minta Hint Berikutnya" muncul setelah respons tier 1/2; hilang setelah tier 3.
- [ ] Klik tombol → request baru tersimpan dengan tier yang inkremen; perilaku AI berubah sesuai prompt tier (validasi via 3 skenario).
- [ ] Mode Umum: tombol tidak muncul.
- [ ] Field `scaffold_tier` terisi di setiap baris `ask_question_history` Mode Penelitian.

---

### Item 7b: Unlock Progresif 8 Course Fase E

**Tujuan**: Siswa Mode Penelitian harus menyelesaikan ≥70% poin tertimbang course sebelumnya untuk unlock course berikutnya, memastikan progresi pedagogis Fase E sekuensial untuk analisis longitudinal RM2.

**Formula skor tertimbang per leaf-subtopik** (skala 0-1):

```text
leaf_score =  0.3 * (visited ? 1 : 0)
            + 0.5 * (quiz_best_score >= 0.6 ? quiz_best_score : 0)
            + 0.2 * (journal_submitted ? 1 : 0)
```

**course_progress = AVG(leaf_score across all leaves in course); unlock prereq next course if ≥ 0.70.**

**Sub-task**:

1. **Helper service** (`src/lib/course-unlock.ts`):
   - `computeCourseWeightedProgress(userId, courseId) → { perLeaf: [{leafId, visited, quizBest, journalSubmitted, score}], averageScore, unlocked }`.
   - Query gabungan: `leaf_subtopics` LEFT JOIN `user_progress` (visit), `quiz_submissions` (best score per leaf), `jurnal` (any row per leaf+user).
   - Caching ringan 60 detik in-memory per `(userId, courseId)` untuk menghindari N+1 di dashboard.
2. **Endpoint baru** `/api/courses/[courseId]/unlock-status`:
   - GET: `{ courseId, templateTopic, isUnlocked, prereqTemplateTopic, prereqProgress, currentProgress, perLeaf }`.
   - Untuk course tanpa prereq (course 1): selalu `isUnlocked=true`.
3. **Gate di backend** `/api/courses/[id]/route.ts` (GET):
   - Jika `mode='research'` dan course memiliki prereq: panggil `computeCourseWeightedProgress(userId, prereqCourseId)`; jika < 0.70, return 403 dengan body `{ error: 'LOCKED', requiredScore: 0.70, currentScore: 0.42, prereqCourseId, prereqTemplateTopic }`.
4. **Gate di backend** `/api/generate-course/route.ts` (POST) — sudah ditambahkan di Item 2, panggil helper yang sama.
5. **UI dashboard** (`src/app/dashboard/page.tsx`):
   - Untuk siswa dengan minimal 1 course Mode Penelitian: tampilkan section "Jalur Pembelajaran Algoritma Fase E (Bab 2 Mushthofa dkk. 2023)" dengan 4 card berurutan.
   - Setiap card menampilkan judul course + referensi halaman buku (mis. "Mengenal Algoritma dan Pemrograman (hal. 29-44)").
   - Card terkunci: opacity 0.4, badge "🔒 Selesaikan {prereqTitle} ≥70% (saat ini: {currentProgress}%)", tombol disabled.
   - Card unlocked tapi belum dimulai: badge "Tersedia", tombol "Mulai".
   - Card in-progress: progress bar + persentase + tombol "Lanjut".
   - Card selesai (≥70%): badge "✓ Selesai" + tombol "Buka kembali".
6. **UI subtopic page**: tampilkan progress bar course di header (mencerminkan `averageScore`).

**Acceptance criteria**:

- [ ] Helper `computeCourseWeightedProgress` return nilai yang konsisten dengan formula (validasi via 3 unit test: kosong, parsial, lengkap).
- [ ] Siswa belum selesai course 1 → akses langsung `/course/{course2_id}` di Mode Penelitian → halaman menampilkan state "Terkunci" dengan prereq jelas.
- [ ] Siswa selesaikan course 1 ≥70% → course 2 langsung unlocked tanpa refresh manual (cache helper expire 60s).
- [ ] Mode Umum tidak terpengaruh: course bebas diakses tanpa gate.
- [ ] Dashboard menampilkan 4 card jalur Fase E (sesuai Bab 2 buku Mushthofa dkk. 2023) dengan state yang akurat untuk minimal 3 skenario test (siswa baru, siswa parsial, siswa lengkap).

---

### Item 8: Prompt Revisions Logging + Ekspor per-prompt + IRR Workflow

**Tujuan**: Setiap revisi prompt tercatat sebagai delta; data per-prompt dapat diekspor; IRR codebook siap dengan 25% sampel double-coded.

**Sub-task**:

#### 8a. Prompt Revisions Logging

1. **Aktifkan `prompt_revisions`** (skema sudah ada, 0 baris):
   - Trigger Postgres atau application-side: saat `ask_question_history` baru dengan `is_follow_up=true` dan `follow_up_of=<prev_id>`, INSERT ke `prompt_revisions`:
     - `episode_id = follow_up_of`
     - `previous_prompt_id = follow_up_of`
     - `current_prompt_id = new_id`
     - `revision_sequence` = count existing + 1
     - `revision_type` = LLM-inferred (call OpenAI dengan diff teks → klasifikasi: clarification/elaboration/correction/refinement/follow_up)
     - `previous_stage`, `current_stage` = dari `prompt_classifications` linked

#### 8b. Ekspor per-prompt

2. **Endpoint baru** `/api/admin/research/export?data_type=prompts_detail`:
   - Output CSV/JSON dengan kolom:
     - `prompt_id, user_pseudo_id, course_id, template_topic, learning_session_id, session_number, prompt_sequence`
     - `prompt_text, prompt_components_jsonb, prompt_stage, scaffold_tier`
     - `ai_response_text, cited_material_chunk_ids_jsonb, prompt_template_version`
     - `is_follow_up, follow_up_of, revision_type, revision_sequence`
     - `ct_total_score, cth_total_score, cognitive_depth_level`
     - `created_at`
   - Anonymize: `user_pseudo_id` di-derive dari `users.participant_code` (Item 8c).

#### 8c. Participant Code

3. **Migration**: `ALTER TABLE users ADD COLUMN participant_code VARCHAR(20) UNIQUE;`
4. **Backfill script** — generate `S001…SNNN` untuk semua user dengan minimal 1 baris di `learning_sessions` mode='research'.
5. **Ekspor selalu pakai `participant_code`**, tidak pernah `users.email` atau `users.id`.

#### 8d. IRR Workflow

6. **Codebook** — tulis dokumen `docs/thesis/CODEBOOK_RM2_RM3.md` (definisi operasional setiap stage SCP/SRP/MQP/Reflektif + 12 dimensi CT/CrT + 0-2 anchor descriptions).
7. **Sampling script** (`scripts/irr-sample.ts`):
   - Random sample 25% dari `prompt_classifications` Mode Penelitian (gunakan stratified sampling per stage agar coverage merata).
   - Output: JSON file untuk rater kedua.
8. **Rater UI sederhana** `/admin/riset/irr/` (atau gunakan spreadsheet shared):
   - List sampel + form input stage + 12 CT/CrT scores.
   - Insert ke `prompt_classifications` baris baru dengan `classified_by='researcher_2'` + `secondary_classification_id` linked.
9. **Hitung kappa** — script `scripts/irr-compute-kappa.ts`:
   - Query pair (researcher_1 vs researcher_2) → hitung Cohen's κ dan Po per dimensi.
   - INSERT ke `inter_rater_reliability`.
10. **LLM tiebreaker** — saat `agreement_status='disagree'`, jalankan `cognitive-scoring.service.ts` sebagai third opinion; simpan di kolom `tiebreaker_*`.

**Acceptance criteria**:

- [ ] Setiap follow-up prompt baru di Mode Penelitian → row baru di `prompt_revisions` dengan `revision_type` terklasifikasi.
- [ ] Ekspor `data_type=prompts_detail` CSV berisi 143+ baris (sesuai data existing setelah migration), kolom `participant_code` semua S###.
- [ ] `users.participant_code` UNIQUE, terisi untuk semua siswa peserta riset.
- [ ] Codebook ditulis dan disetujui pembimbing.
- [ ] 25% sampel double-coded; `inter_rater_reliability` terisi dengan κ dan Po; minimal κ ≥ 0.70 dan Po ≥ 0.80 untuk diterima.

---

### Item 9: Komponen Interaktif Subtopik (Mode Penelitian)

**Tujuan**: Setiap leaf-subtopik yang membahas konsep kode (pseudocode, percabangan, perulangan, tracing, debugging, evaluasi) memiliki 1-2 komponen interaktif yang memaksa siswa **melakukan**, bukan hanya membaca. Setiap interaksi tersimpan sebagai artefak mikro untuk dimensi CT/CrT; setelah submit, AI Sokratik otomatis muncul dengan pertanyaan reflektif yang merujuk hasil siswa eksplisit.

**6 Komponen yang dibangun**:

| # | Komponen | Apa yang dilakukan siswa | Output untuk RM3 |
|---|---|---|---|
| 1 | **TraceTable** | Isi tabel langkah-per-langkah eksekusi pseudocode (kolom: variabel, nilai, kondisi); validasi per sel | Bukti `ct_evaluation_debugging` + `ct_pattern_recognition` |
| 2 | **OutputPredictor** | Diberi pseudocode + input; prediksi output sebelum sistem reveal; jika salah → AI hint | Bukti `cth_inference` + `ct_abstraction` |
| 3 | **ParsonsProblem** | Baris pseudocode benar tapi acak; drag-drop ke urutan benar | Bukti `ct_decomposition` + `ct_pattern_recognition` |
| 4 | **BugHunt** | Pseudocode buggy; klik baris yang salah + tulis perbaikan; AI validasi | Bukti `ct_evaluation_debugging` + `cth_analysis` |
| 5 | **FlowchartBuilder** | Drag-drop node (terminator/proses/keputusan) + sambungkan dengan arrow | Bukti `ct_abstraction` + `cth_explanation` |
| 6 | **PseudocodeBlockBuilder** | Drag-drop blok pseudocode (`IF`, `WHILE`, statements) untuk membangun algoritma dari spec | Bukti `ct_algorithm_design` + `ct_decomposition` |

**Pemetaan komponen ke leaf-subtopik** (~22 instansiasi total di 26 leaf, mengikuti struktur 4 course Bab 2 Mushthofa dkk. 2023):

| Course (slug) | Leaf yang dapat komponen interaktif |
|---|---|
| mengenal-algoritma | (1.2) FlowchartBuilder pengenalan notasi ANSI/ISO · (1.3) FlowchartBuilder (bangun flowchart luas persegi) · (1.4) TraceTable (Menelusuri Diagram Alir) · (1.5) ParsonsProblem (susun pseudokode acak) · (1.6) TraceTable (Menelusuri Pseudokode) |
| struktur-kendali | (2.3) OutputPredictor (prediksi hasil ekspresi operator) · (2.4) FlowchartBuilder + OutputPredictor (If-Else) · (2.5) ParsonsProblem (susun case di Switch-Case) · (2.6) TraceTable + BugHunt (percabangan bersarang) · (2.7) TraceTable + OutputPredictor "berapa iterasi For?" · (2.8) TraceTable (While) · (2.9) OutputPredictor (Do-While) · (2.10) TraceTable + BugHunt (cari infinite loop) · (2.11) PseudocodeBlockBuilder (Membuat & Memanggil Fungsi) · (2.12) BugHunt (cari scope error variabel lokal) |
| memilih-algoritma | (3.2) OutputPredictor "urutan setelah 1 pass?" · (3.3) TraceTable (Bubble Sort step-by-step) · (3.4) TraceTable (Insertion Sort) · (3.5) TraceTable (Selection Sort) |
| struktur-data | (4.2) OutputPredictor + visual animasi enqueue/dequeue (Queue) · (4.3) OutputPredictor + visual animasi push/pop (Stack) |

**Sub-task**:

#### 9.1 Foundation (skema + pipeline + AI integration)

1. **DB migration**:

   ```sql
   ALTER TABLE leaf_subtopics ADD COLUMN interactive_blocks JSONB DEFAULT '[]';
   -- Extend artifact_type enum di research_artifacts:
   ALTER TABLE research_artifacts ADD CONSTRAINT artifact_type_check
     CHECK (artifact_type IN ('pseudocode','flowchart','algorithm','solution',
                               'trace_table','output_predictor','parsons','bug_hunt',
                               'flowchart_builder','block_builder'));
   ALTER TABLE research_artifacts ADD COLUMN interaction_events JSONB DEFAULT '[]';
   ALTER TABLE research_artifacts ADD COLUMN completion_status VARCHAR(20)
     DEFAULT 'in_progress' CHECK (completion_status IN ('in_progress','submitted','abandoned'));
   ALTER TABLE research_artifacts ADD COLUMN component_score NUMERIC(3,2);  -- 0.00 - 1.00
   ```

2. **JSON schema** untuk `interactive_blocks` (TypeScript type di `src/types/interactive-blocks.ts`):

   ```ts
   type InteractiveBlock =
     | { type: 'trace_table'; config: TraceTableConfig }
     | { type: 'output_predictor'; config: OutputPredictorConfig }
     | { type: 'parsons'; config: ParsonsConfig }
     | { type: 'bug_hunt'; config: BugHuntConfig }
     | { type: 'flowchart_builder'; config: FlowchartBuilderConfig }
     | { type: 'block_builder'; config: BlockBuilderConfig };
   ```

3. **Shared hook** (`src/hooks/useInteractionTracking.ts`):
   - Capture event stream: `{ timestamp, eventType, payload }` per interaksi (klik, drag, ketik, undo).
   - Auto-batch + POST ke `/api/research-artifacts/submit` saat siswa klik "Submit" atau setelah 30 detik idle.
4. **Endpoint extension** `/api/research-artifacts/submit/route.ts`:
   - Terima payload `{ leafSubtopicId, blockType, artifactContent, interactionEvents[], completionStatus, componentScore }`.
   - Insert ke `research_artifacts` dengan `mode='research'`, `artifact_type=blockType`.
5. **AI auto-trigger pipeline** — extend `/api/ask-question/route.ts`:
   - Terima optional payload `triggeredByArtifactId UUID`.
   - Jika ada: fetch artifact summary (interactionEvents ringkasan + score + correctness), inject ke system prompt sebagai konteks "siswa baru saja menyelesaikan komponen X dengan hasil Y".
   - Template prompt baru `src/services/prompts/socratic-post-interaction.ts`: "Siswa baru saja menyelesaikan {component_type} di leaf {leaf_title}. Hasilnya: {summary}. Ajukan SATU pertanyaan reflektif yang merujuk eksplisit ke hasil tersebut. Tier 1: diagnostik, jangan beri jawaban."
6. **UI hook** `src/components/InteractiveBlockRenderer/InteractiveBlockRenderer.tsx`:
   - Render block sesuai `type` di `interactive_blocks` array di subtopic page.
   - Setelah submit → trigger sidebar AskQuestion dengan `triggeredByArtifactId` set; ProductTour highlight pertama kali.

**Acceptance Foundation**:

- [ ] Migration applied; `interactive_blocks` JSONB & 6 enum baru aktif.
- [ ] Hook `useInteractionTracking` capture event stream; tersimpan di artifact dengan `interaction_events` non-empty.
- [ ] AI auto-trigger: setelah submit TraceTable → sidebar AskQuestion muncul dengan pertanyaan reflektif yang menyebut "trace ini" eksplisit (validasi via 3 test).

#### 9.2 Komponen Ringan (TraceTable + OutputPredictor + ParsonsProblem)

1. **TraceTable** (`src/components/Interactive/TraceTable.tsx`):
   - Tampilkan pseudocode static + tabel kosong dengan jumlah baris = jumlah expected step.
   - Setiap sel input (variabel/nilai/kondisi) divalidasi real-time vs `expectedTrace`.
   - State events: `cell_filled`, `cell_changed`, `validation_passed`, `validation_failed`, `submitted`.
   - Score: % sel benar di first attempt.
2. **OutputPredictor** (`src/components/Interactive/OutputPredictor.tsx`):
   - Tampilkan pseudocode + input + 1 textarea/multiple choice untuk prediksi output.
   - Submit → reveal correct output + AI hint kalau salah.
   - Events: `option_selected`, `text_changed`, `submitted`, `revealed`.
   - Score: 1.0 if first-attempt correct, 0.5 if correct after hint, 0 if abandoned.
3. **ParsonsProblem** (`src/components/Interactive/ParsonsProblem.tsx`):
   - Dependency: `npm i @dnd-kit/core @dnd-kit/sortable`.
   - Daftar baris pseudocode acak di kiri; drop zone di kanan; siswa drag ke urutan benar.
   - Validasi: urutan akhir match `expectedOrder`.
   - Events: `block_dragged`, `block_dropped`, `order_changed`, `submitted`.
   - Score: % baris di posisi benar; bonus untuk solving tanpa undo.

**Acceptance Ringan**:

- [ ] TraceTable: siswa isi 5-row trace → validasi per sel; submit menyimpan ke `research_artifacts` dengan `interaction_events` lengkap.
- [ ] OutputPredictor: prediksi salah → AI hint muncul; prediksi benar → score 1.0.
- [ ] ParsonsProblem: drag-drop 6 baris → urutan benar → score 1.0; sistem catat jumlah swap.

#### 9.3 Komponen Kompleks (BugHunt + FlowchartBuilder + PseudocodeBlockBuilder)

1. **BugHunt** (`src/components/Interactive/BugHunt.tsx`):
   - Pseudocode dengan bug ditampilkan; siswa klik baris (highlight) + tulis perbaikan di inline editor.
   - Validasi: baris yang dipilih harus match `bugLineIndex`; perbaikan dievaluasi AI via `/api/challenge-feedback` adapter.
   - Events: `line_clicked`, `fix_typed`, `submitted`.
   - Score: 1.0 if correct line + correct fix; 0.5 if correct line only.
2. **FlowchartBuilder** (`src/components/Interactive/FlowchartBuilder.tsx`):
   - Dependency: `npm i reactflow` (atau custom SVG).
   - Sidebar dengan node palette (terminator, process, decision, input/output); siswa drag ke kanvas + sambungkan arrow.
   - Validasi: struktur graph match `expectedTopology` (node types + connections), label flexible.
   - Events: `node_added`, `node_removed`, `edge_added`, `node_labeled`, `submitted`.
   - Score: graph similarity score (0-1).
3. **PseudocodeBlockBuilder** (`src/components/Interactive/PseudocodeBlockBuilder.tsx`):
   - Palette blok: `IF...THEN`, `ELSE`, `ENDIF`, `WHILE...DO`, `ENDWHILE`, `FOR...DO`, `ENDFOR`, custom statement.
   - Siswa drag blok ke workspace; sistem auto-render pseudocode preview di kanan.
   - Validasi syntax (matching IF/ENDIF dst) + semantic (match spesifikasi soal).
   - Events: `block_added`, `block_removed`, `block_edited`, `validation_error`, `submitted`.
   - Score: kombinasi syntax_valid (0/1) + semantic_correct (0-1).

**Acceptance Kompleks**:

- [ ] BugHunt: 3 skenario test (bug syntax, bug logika, bug off-by-one) → siswa identifikasi & perbaiki; AI feedback per submit.
- [ ] FlowchartBuilder: siswa bangun flowchart percabangan 4-node + 5-edge → submit + score graph similarity.
- [ ] PseudocodeBlockBuilder: siswa bangun loop dengan IF di dalamnya → syntax validator menolak jika ENDIF hilang; semantic correctness via AI.

#### 9.4 Content Authoring + Admin UI

1. **Authoring tool** `src/app/admin/sumber/interactive-blocks/page.tsx`:
   - Per leaf-subtopik: form CRUD untuk `interactive_blocks` JSONB.
   - Preview live komponen di panel kanan.
   - Validasi schema via Zod sebelum save.
2. **Content kerja** — peneliti tulis JSON untuk 20-25 instansiasi (1-2 hari kerja per topik × 8 topik = ~14 hari). Disusun selama W11 setelah seluruh 6 komponen siap di W10.
3. **Pre-populated examples**: untuk setiap komponen, sediakan 2-3 contoh starter JSON di `docs/examples/interactive-blocks/*.json` untuk referensi peneliti.

**Acceptance Content**:

- [ ] ~22 instansiasi komponen tersusun di `leaf_subtopics.interactive_blocks` untuk leaf yang relevan (sesuai tabel mapping di atas).
- [ ] Admin UI memungkinkan edit JSON + preview live tanpa error.
- [ ] Schema Zod menolak JSON invalid sebelum save.

**Acceptance Item 9 (akhir)**:

- [ ] Semua 6 komponen ter-render & berfungsi di Mode Penelitian; tidak muncul di Mode Umum.
- [ ] Setelah submit komponen → `research_artifacts` baru dengan `interaction_events` lengkap + `component_score` terhitung.
- [ ] AI auto-trigger reflektif berjalan: sidebar muncul dengan pertanyaan yang merujuk hasil siswa (validasi via 6 test, 1 per komponen).
- [ ] Minimal 18 dari 26 leaf-subtopik kanonik punya minimal 1 block interaktif aktif (target 22 instansiasi sesuai mapping).

---

### Item 10: Admin Mode Toggle + Filter Propagation

**Tujuan**: Admin memiliki toggle global `Mode Umum` ↔ `Mode Penelitian` di header (mirror pola siswa). Mode Penelitian = lensa peneliti: hanya menampilkan data dari course `mode='research'`, dan membuka halaman riset-only (sumber, cache review, interactive blocks, riset/*). Mode Umum = lensa operator aplikasi: semua course (umum + penelitian) terlihat, halaman riset-only disembunyikan.

**Sub-task**:

#### 10.1 Foundation (cookie, context, helper)

1. **Cookie & context**:
   - Cookie `admin_mode=general|research` (non-HttpOnly, Lax, Path=/, 30-day Max-Age) — default `'general'` saat admin login.
   - `AdminModeProvider` (`src/context/AdminModeContext.tsx`) — mirror `LocaleProvider`. Exposes `{ adminMode, setAdminMode }`. Cookie update immediate; tidak perlu reload halaman.
   - Mount provider di `src/app/admin/layout.tsx`.
2. **Middleware header injection** (`middleware.ts`):
   - Untuk request ke `/api/admin/*`: baca cookie `admin_mode`, inject header `x-admin-mode` ke request yang di-forward ke handler.
3. **Helper backend** (`src/lib/admin-mode.ts`):
   - `getAdminModeFromRequest(req): 'general' | 'research'` — read header injected by middleware.
   - `applyAdminModeFilter<T>(queryBuilder, mode, tableAlias?)` — adds `WHERE <alias>.mode = $mode` jika `mode='research'`; passthrough jika `mode='general'` (semua data).
   - `assertResearchModeOnly(req)` — throws 403 jika `mode !== 'research'` (dipakai di endpoint research-only seperti `/api/admin/sumber/*`, `/api/admin/research/*`).

#### 10.2 Header Toggle UI

1. **Komponen** `src/components/admin/AdminModeToggle/AdminModeToggle.tsx`:
   - Toggle button group dengan 2 pilihan: 🌐 Umum · 🔬 Penelitian.
   - Badge warna berbeda saat aktif: Umum = abu-abu, Penelitian = ungu (atau pakai design token yang sudah ada).
   - Klik → update cookie → call `setAdminMode` → trigger router refresh (data semua halaman re-fetch dengan mode baru).
2. **Mount** di `src/app/admin/layout.tsx` header, di sebelah kiri user avatar.
3. **Visual indicator** di body admin: saat Mode Penelitian aktif, tambah subtle border accent atau header banner "Mode Penelitian aktif — hanya menampilkan data dari course riset" agar admin tidak lupa mode aktif.

#### 10.3 Navigation Visibility Logic

1. **Sidebar admin** (`src/app/admin/layout.tsx` atau komponen sidebar):
   - Menu item yang **selalu tampil**: Dashboard, Aktivitas, Siswa, Ekspor, Monitoring.
   - Menu item yang **hanya tampil saat Mode Penelitian**:
     - Sumber (bank materi PDF — Item 3)
     - Sumber → Cache Review (Item 4b)
     - Sumber → Interactive Blocks (Item 9.4)
     - Riset (bukti, kognitif, prompt, readiness, triangulasi — pages existing)
   - Implementasi via conditional render `{adminMode === 'research' && <NavItem ... />}`.
2. **Direct URL access guard** — admin yang akses `/admin/sumber` atau `/admin/riset/*` di Mode Umum: redirect ke `/admin/dashboard` dengan toast "Halaman ini hanya tersedia di Mode Penelitian. Aktifkan toggle Penelitian di header." (atau auto-switch ke Penelitian dengan konfirmasi).

#### 10.4 API & Halaman Existing — Integrasi Filter

| Endpoint / Page | Perubahan |
|---|---|
| `GET /api/admin/dashboard` | Tambah `mode = getAdminModeFromRequest(req)`; semua KPI query lewat `applyAdminModeFilter(qb, mode)` di tabel `courses`, `learning_sessions`, `prompt_classifications`, `cognitive_indicators`, `auto_cognitive_scores` |
| `GET /api/admin/activity/*` (16 endpoint) | Idem — filter via `courses.mode` JOIN |
| `GET /api/admin/users` & `/api/admin/users/[id]` | Mode Penelitian: filter ke siswa dengan `EXISTS (SELECT 1 FROM courses WHERE created_by = users.id AND mode='research')` ATAU yang punya `learning_sessions.mode='research'` |
| `GET /api/admin/users/[id]/activity-summary` & `/detail` & `/subtopics` & `/evolusi` | Filter aktivitas ke `mode = $admin_mode` |
| `GET /api/admin/research/*` | `assertResearchModeOnly(req)` di awal handler — return 403 jika Mode Umum |
| `GET /api/admin/sumber/*` (baru dari Item 3, 4b, 9.4) | Idem `assertResearchModeOnly(req)` |
| `GET /api/admin/monitoring/logging` | Filter `path LIKE '%research%' OR endpoint berkaitan course mode='research'` |
| `GET /api/admin/research/export` | Sudah ada default `mode=research`; sekarang force-bind ke `admin_mode` cookie (tidak override dari query) saat di Mode Penelitian |

#### 10.5 Audit Log

1. **Log mode switch** di `api_logs`:
   - Tambah event `admin_mode_switched` dengan metadata `{ from, to, admin_user_id, timestamp }`.
   - Berguna untuk audit trail: peneliti dapat verifikasi tidak ada admin lain yang switch mode tanpa sepengetahuan.
2. **Display current mode** di setiap admin page footer (kecil, abu-abu): "Mode aktif: 🔬 Penelitian — terakhir diubah 2 jam yang lalu oleh `<admin_email>`".

**Acceptance criteria**:

- [ ] Toggle muncul di header `/admin/*`; klik mengubah cookie `admin_mode` + memicu refresh data tanpa reload halaman.
- [ ] Mode Umum: menu Sumber & Riset hidden dari sidebar; akses direct URL → redirect dengan toast.
- [ ] Mode Penelitian: menu Sumber & Riset visible; akses penuh; halaman aktivitas hanya menampilkan data dari course `mode='research'`.
- [ ] Validasi via 3 skenario test:
  - (a) Buat 1 siswa dengan 1 course Mode Umum + 1 course Mode Penelitian. Di `/admin/aktivitas` tab Tanya Jawab, Mode Umum tampilkan kedua course; Mode Penelitian hanya yang `mode='research'`.
  - (b) Di `/admin/siswa`, Mode Penelitian sembunyikan siswa yang hanya punya course Mode Umum (yaitu siswa tanpa aktivitas riset).
  - (c) Akses `/admin/riset/prompt` saat Mode Umum → redirect ke dashboard + toast peringatan.
- [ ] `api_logs` mencatat event `admin_mode_switched` setiap kali toggle ditekan.
- [ ] Helper `applyAdminModeFilter` digunakan di minimal 10 endpoint admin (dapat di-grep).
- [ ] Backward compat: admin existing tanpa cookie `admin_mode` default ke `'general'`, perilaku identik dengan sebelum Item 10.

---

## 5. Definition of Done untuk MVR

Media siap uji lapangan jika **semua** ini terpenuhi:

- [ ] Item 1-8 + Item 4b + Item 7b + Item 9 + Item 10: seluruh acceptance criteria centang.
- [ ] Admin Mode Toggle berfungsi: toggle di header, perbedaan view yang konsisten antara Mode Umum vs Mode Penelitian terbukti di 3 skenario test (lihat Item 10).
- [ ] 26 leaf-subtopik kanonik Mode Penelitian sudah `qa_status='approved'` (pre-generated + reviewed peneliti).
- [ ] Bank sumber: minimal buku Mushthofa dkk. 2023 (Bab 2) ter-upload + minimal 1 PDF pendukung per course, dengan total coverage 4 `template_topics` (tidak ada topik tanpa minimal 1 chunk tervalidasi).
- [ ] Komponen interaktif: 6 komponen live + minimal 18 dari 26 leaf-subtopik punya block interaktif aktif (target ~22 instansiasi); setiap submit → `research_artifacts` baru dengan `interaction_events` lengkap.
- [ ] AI auto-trigger reflektif setelah submit komponen interaktif terbukti via 6 test (1 per tipe komponen) menghasilkan pertanyaan yang merujuk hasil siswa eksplisit.
- [ ] 3 siswa pilot test selama 1 minggu di Mode Penelitian, masing-masing menyelesaikan minimal 1 course Fase E hingga unlock berikutnya + menggunakan minimal 4 komponen interaktif berbeda.
- [ ] Tidak ada error tersembunyi di `api_logs` Mode Penelitian (status 5xx < 1%).
- [ ] AI di Mode Penelitian lulus 8 prompt uji (dari audit Bagian 8) dengan rasio Sokratik ≥ 7/8 (manual evaluasi).
- [ ] Ekspor data riset minimal 50 prompt + 10 artefak pseudocode + 30 artefak interaktif + 5 sesi + minimal 80% prompt punya `cited_material_chunk_ids` non-empty.
- [ ] κ ≥ 0.70 di sampel pilot 25%.

---

## 6. Risiko & Mitigasi

| Risiko | Probabilitas | Dampak | Mitigasi |
|---|---|---|---|
| ~~pgvector tidak available di Supabase plan saat ini~~ | ~~Rendah~~ Mitigated | ~~Tinggi~~ — | **MITIGATED (verified 2026-05-16)**: pgvector v0.8.0 confirmed available (belum installed; akan diaktifkan via `CREATE EXTENSION` di migration #3). Fallback `tsvector` tidak diperlukan. |
| PDF parser gagal di dokumen scan-based (image PDF) | Sedang | Sedang | Batasi upload ke PDF text-extractable; reject scan PDF dengan pesan + suggest OCR manual |
| Biaya embedding membengkak (10 buku × 200 halaman × 80 chunks = 16k embeddings) | Sedang | Rendah | `text-embedding-3-small` ~$0.02/1M tokens; 16k chunks ≈ 9.6M tokens = $0.20. Aman. |
| AI tier 3 tetap memberi solusi terlalu cepat | Tinggi | Sedang | Test 20 prompt sebelum W6 lock; tune temperature dan instruksi; tambah few-shot example di system prompt |
| IRR κ < 0.70 di putaran pertama | Sedang | Sedang | Buffer 1 minggu untuk codebook revision + recoding sebelum data collection final |
| Pilot test menemukan UX blocker (siswa tidak tahu cara klik "Minta Hint") | Sedang | Sedang | Tambah ProductTour step di W7-W8; siapkan video tutorial 2 menit |
| Rater kedua tidak tersedia | Sedang | Tinggi | Identifikasi & konfirmasi rater di W1 (bukan W7); siapkan honorarium kecil; backup: minta dosen pembimbing 2 |
| Mode Umum regresi karena perubahan write-path | Sedang | Tinggi | Tulis Jest test untuk seluruh API route di W2 (sebelum heavy changes); jalankan setiap PR |
| Siswa pertama mendapat pesan "materi sedang disiapkan" → frustrasi & drop out | Sedang | Sedang | **Default ke pre-generation di W8** (script `pre-generate-research-subtopics.ts`) sehingga semua 38 subtopik sudah approved sebelum siswa masuk W9. Backup: tampilkan estimasi waktu approval + email notifikasi saat siap |
| Bank sumber tidak cukup mendalami 1+ dari 4 course Fase E | Sedang | Tinggi | Buku resmi Mushthofa dkk. 2023 (Bab 2 hal. 29-105) menjadi sumber primer wajib + minimal 1 PDF pendukung per course. Validasi di akhir W4: jalankan query "topik yang punya < 10 chunks tervalidasi"; jika ada, peneliti wajib upload PDF tambahan sebelum W5. DoD eksplisit mensyaratkan coverage 4 `template_topics`. |
| Unlock progresif terlalu ketat → siswa stuck di course tertentu, tidak bisa eksplorasi | Sedang | Sedang | Threshold 70% sudah relatif longgar (weighted). Backup: admin override per siswa via `/admin/siswa/[id]/unlock-override` (manual unlock untuk siswa dengan kebutuhan khusus). |
| Item 9 komponen interaktif menambah cakupan 4 minggu → timeline 9→13 minggu | Tinggi | Sedang | Sudah factored di Sprint Timeline. Backup eskalasi: pisah jadi MVR-A (3 komponen ringan W8-W9 + uji lapangan W12) dan MVR-B (3 komponen kompleks pasca uji lapangan round 2). |
| FlowchartBuilder + PseudocodeBlockBuilder paling kompleks → risiko bug saat pilot | Sedang | Sedang | Test extensively di W10 sebelum content authoring W11; siapkan fallback "konten teks + diagram statis" jika komponen tidak stable di W13. |
| Content authoring ~22 instansiasi komponen interaktif memakan 1.5-2 minggu penuh peneliti | Tinggi | Sedang | Dedicate W11 penuh untuk authoring; siapkan 2-3 example JSON starter per tipe komponen di W10 agar peneliti bisa langsung copy-modify. Pertimbangkan menurunkan jumlah instansiasi ke 15 (fokus Course 2 yang paling padat) jika W11 tidak cukup. |
| AI auto-trigger reflektif terasa intrusive bagi siswa (terlalu sering muncul) | Sedang | Rendah | Tambah toggle "hide AI suggestions" di profile siswa; tampilkan max 1 kali per leaf-subtopik (cooldown). Tes UX dengan 1-2 siswa di awal W13. |
| Admin lupa mengaktifkan Mode Penelitian saat ekspor data riset → ekspor berisi data Mode Umum tercampur | Sedang | Tinggi | (a) Audit log `admin_mode_switched` di `api_logs` (Item 10.5); (b) banner persistent saat Mode Umum di halaman ekspor: "⚠️ Anda di Mode Umum — ekspor mungkin berisi data non-research. Switch ke Penelitian dulu?"; (c) ekspor `/api/admin/research/export` di Mode Umum tetap default `mode=research` (preserve perilaku eksisting) tapi tambah field `admin_mode_when_exported` di metadata ekspor. |
| Item 10 (Admin Mode Toggle) ditemukan bug di W13 saat pilot test, terlambat untuk fix | Sedang | Sedang | Bagi Item 10 jadi 10.1-10.2 (W11 paralel content authoring) + 10.3-10.5 (W12 paralel Item 8) — kerangka tersedia awal, integrasi penuh dengan buffer di W12. Smoke test admin toggle di akhir W12 sebelum pilot W13. |

---

## 7. Strategi Eksekusi Per Sprint

**Saran cara kerja per minggu**:

1. Buka issue/branch baru per item MVR (`feat/item-1-mode-flag`, `feat/item-2-templates`, …).
2. Awali sprint dengan migration dulu (kalau ada); deploy ke Supabase staging.
3. Implementasi UI/API setelah migration stabil.
4. Setiap akhir minggu: jalankan `npm run test` + manual smoke test minimal alur happy path.
5. Tag mingguan di git (`mvr-w1`, `mvr-w2`, …) untuk rollback cepat.

**Saran pemanfaatan agent**:

- Agent `db-schema-analyzer` untuk validasi migration sebelum apply.
- Agent `api-route-builder` untuk Item 4 (RAG integration) dan Item 8 (ekspor baru).
- Agent `react-component-builder` untuk Item 6 (PseudocodeEditor) dan Item 7 (Hint tier UI).
- Agent `codebase-explorer` untuk memetakan call site sebelum perubahan write-path Item 1.

---

## 8. Dokumen Pendukung yang Harus Dibuat Selama Eksekusi

- `docs/sql/` — minimal 9 migration files (mode column, course_unlock_dependencies, materials+chunks dengan VARCHAR[], citation columns, subtopic_cache lock+qa, scaffold_tier, participant_code, leaf_subtopics.interactive_blocks, research_artifacts extended enum + interaction_events).
- `docs/thesis/CODEBOOK_RM2_RM3.md` — codebook IRR (termasuk pemetaan tipe interaksi ke dimensi CT/CrT).
- `docs/RAG_PIPELINE.md` — dokumentasi teknis pipeline embedding & retrieval (termasuk multi-topic mapping).
- `docs/MODE_SYSTEM.md` — dokumentasi perilaku per-mode untuk reviewer (termasuk cache lock, QA workflow, unlock progresif).
- `docs/CONTENT_SPEC_FASE_E.md` — spek 4 course + 26 leaf-subtopik kanonik (1:1 dengan Bab 2 Mushthofa dkk. 2023 hal. 29-105) dengan learning objectives per leaf dan kutipan referensi halaman buku (referensi peneliti saat QA konten AI-generated).
- `docs/INTERACTIVE_BLOCKS_SPEC.md` — spesifikasi JSON schema 6 komponen interaktif + pemetaan ke 20-25 instansiasi leaf-subtopik + scoring rubric per komponen.
- `docs/examples/interactive-blocks/` — minimal 12 contoh JSON starter (2 per tipe komponen) sebagai referensi peneliti saat content authoring.
- Update `CLAUDE.md` — tambah section "Mode System (research vs general)" + "Content Pipeline Mode Penelitian" + "Interactive Blocks System".
- Update `docs/DATABASE_SCHEMA.md` — refleksikan semua kolom baru.

---

## 9. Migration & DB Pre-Flight Checklist

Bagian ini melengkapi sebaran perubahan DB yang sudah ada di Item 1, 2, 3, 4b, 6, 7, 8, 9 dengan tiga hal: (a) konsolidasi semua migration file dan urutannya, (b) verifikasi pre-flight yang harus dijalankan sebelum W1, (c) catatan eksplisit tabel mana yang sudah lengkap skemanya dan tidak butuh migrasi.

### 9.1 Konsolidasi Migration Files (~10 file)

Urutan migrasi mengikuti sprint timeline; setiap file di-tag tanggal eksekusi aktual saat dijalankan ke staging.

| # | File migration | Sprint | Cakupan |
|---|---|---|---|
| 1 | `2026-XX-add-mode-column.sql` | W1 | `mode VARCHAR(20) NOT NULL DEFAULT 'general' CHECK IN ('general','research')` di 7 tabel: `courses`, `learning_sessions`, `ask_question_history`, `challenge_responses`, `jurnal`, `quiz_submissions`, `prompt_classifications` + 7 indeks `idx_<table>_mode` + backfill `UPDATE ... SET mode='general'` untuk semua baris existing |
| 2 | `2026-XX-add-course-template-cols.sql` | W2 | `courses.is_template BOOLEAN DEFAULT false`, `courses.template_topic VARCHAR(50)`, `courses.source_reference TEXT` + `CREATE TABLE course_unlock_dependencies (course_template_topic VARCHAR(50) PRIMARY KEY, prereq_template_topic VARCHAR(50) REFERENCES course_unlock_dependencies(course_template_topic))` + seed 3 baris (course 2→1, 3→2, 4→3) |
| 3 | `2026-XX-create-materials-and-chunks.sql` | W3 | `CREATE EXTENSION IF NOT EXISTS vector;` + `CREATE TABLE materials` (id, title, author, edition, `template_topics VARCHAR(50)[] NOT NULL`, source_url, storage_path, file_size_bytes, page_count, validation_status, validated_by, validated_at, uploaded_by, timestamps) + `CREATE TABLE material_chunks` (id, material_id FK, chunk_idx, chunk_text, page_number, token_count, `embedding vector(1536)`, created_at, UNIQUE (material_id, chunk_idx)) + 3 indeks: ivfflat embedding, GIN materials.template_topics, FK material_chunks.material_id |
| 4 | `2026-XX-add-citation-and-scaffold-cols.sql` | W4-W5 | `cited_material_chunk_ids UUID[] DEFAULT '{}'` di `ask_question_history` & `challenge_responses` (untuk Item 4 RAG) + `scaffold_tier INT DEFAULT 1 CHECK BETWEEN 1 AND 3` di kedua tabel (Item 7) + `prompt_template_version VARCHAR(20) DEFAULT 'socratic_v1'` di kedua tabel (Item 5) |
| 5 | `2026-XX-subtopic-cache-lock-qa.sql` | W5 | 9 kolom baru di `subtopic_cache`: `mode VARCHAR(20) DEFAULT 'general'`, `locked BOOLEAN DEFAULT false`, `qa_status VARCHAR(20) DEFAULT 'pending'`, `qa_reviewed_by UUID REFERENCES users(id)`, `qa_reviewed_at TIMESTAMPTZ`, `qa_notes TEXT`, `source_chunk_ids UUID[] DEFAULT '{}'`, `generation_seed VARCHAR(64)`, `generated_by UUID REFERENCES users(id)` + index composite `(mode, qa_status)` + treat 109 baris existing sebagai `mode='general', qa_status='approved'` (backfill explicit) |
| 6 | `2026-XX-research-artifacts-interactive.sql` | W7-W8 | **Verified 2026-05-16: `learning_session_id` SUDAH ADA** (uuid nullable, added via `thesis_stage2_research_evidence_foundation` 2026-04-18) — skip ADD COLUMN. (a) extend CHECK enum `artifact_type` dengan `'trace_table','output_predictor','parsons','bug_hunt','flowchart_builder','block_builder'`, (b) tambah `interaction_events JSONB DEFAULT '[]'`, `completion_status VARCHAR(20) DEFAULT 'in_progress' CHECK IN ('in_progress','submitted','abandoned')`, `component_score NUMERIC(3,2)`, `mode VARCHAR(20) DEFAULT 'general'` |
| 7 | `2026-XX-leaf-subtopics-interactive-blocks.sql` | W8 | `ALTER TABLE leaf_subtopics ADD COLUMN interactive_blocks JSONB DEFAULT '[]';` + index GIN opsional untuk query "leaf yang punya tipe komponen X" |
| 8 | `2026-XX-users-participant-code-consent.sql` | W11 | `users.participant_code VARCHAR(20) UNIQUE` (nullable initially), `users.consent_given_at TIMESTAMPTZ`, `users.consent_version VARCHAR(20)` |
| 9 | `2026-XX-rls-policies-new-tables.sql` | W3-W7 (incremental) | RLS untuk 3 tabel baru, mengikuti pola existing (`service_role_full_access` mandatory + per-user policy keyed pada relasi ke `users`): `materials_*` (research-only via mode check di app layer, RLS pakai service_role saja), `material_chunks_read_validated`, `course_unlock_dependencies_read_all` (read-only untuk authenticated) |
| 10 | `2026-XX-backfill-participant-codes.sql` | W12 | Backfill script: generate `S001…SNNN` deterministik untuk semua user dengan minimal 1 baris di `learning_sessions` dengan course `mode='research'` (kandidat peserta riset). Diurutkan by `users.created_at` agar stabil. |

**Total**: 10 migration files. Tidak ada migrasi destructive (DROP COLUMN/TABLE). Semua perubahan column-additions ber-default sehingga aman terhadap baris existing.

### 9.2 Tabel Existing yang SUDAH Lengkap (tidak perlu migration)

Tiga tabel yang sebelumnya kosong tetapi skemanya sudah siap sepenuhnya untuk MVR:

| Tabel | Baris | Apa yang sudah ada | Apa yang dibutuhkan |
|---|---|---|---|
| `research_artifacts` | 0 | Skema lengkap (5 dimensi kualitas + `total_artifact_score` GENERATED, file fields, evidence_status, coding_status, data_collection_week) | **Hanya perlu extension** (4 kolom + enum) di migration #6 untuk mendukung 6 tipe komponen interaktif Item 9 |
| `prompt_revisions` | 0 | Skema lengkap (episode_id, revision_type, quality_change, previous→current stage) | **Tanpa perubahan skema**. Hanya perlu application logic Item 8a — trigger insert ke tabel ini saat siswa `follow_up` di `ask_question_history` |
| `inter_rater_reliability` | 0 | Skema lengkap (cohens_kappa, observed_agreement, meets_po_threshold, meets_kappa_threshold) | **Tanpa perubahan skema**. Hanya perlu workflow IRR Item 8d — rater kedua + script perhitungan kappa di W12 |

Tiga tabel ini adalah aset signifikan: **menghemat ~3-4 hari kerja yang seharusnya dipakai mendesain skema dari nol**. Skema yang ada sudah mengantisipasi rubrik tesis (CT dimensions, prompt stages, kappa thresholds).

### 9.3 Tabel Existing yang Tidak Perlu Disentuh Sama Sekali (20 tabel)

`subtopics`, `quiz`, `feedback`, `transcript`, `transcript_integrity_quarantine`, `learning_profiles`, `discussion_sessions`, `discussion_messages`, `discussion_templates`, `discussion_assessments`, `discussion_admin_actions` (5 tabel discussion module dormant), `cognitive_indicators`, `auto_cognitive_scores`, `research_evidence_items`, `triangulation_records`, `research_auto_coding_runs`, `api_logs`, `rate_limits`, `course_generation_activity`, `user_progress`.

Total **20 tabel** dipakai apa adanya — tidak ada column add, tidak ada RLS change, tidak ada data migration.

### 9.4 Pre-Flight Verification — Hasil Eksekusi 2026-05-16

Verifikasi dijalankan via Supabase MCP server (project `wesgoqdldgjbwgmubfdm`). Hasil definitif:

| # | Verifikasi | Hasil Aktual | Status | Catatan |
|---|---|---|---|---|
| 1 | **pgvector tersedia** | Extension `vector` v0.8.0 tersedia di Supabase plan, `installed_version: null` (belum diaktifkan) | ✅ PASS | Migration #3 cukup `CREATE EXTENSION IF NOT EXISTS vector;` — tidak perlu fallback `tsvector` |
| 2 | **`research_artifacts.learning_session_id`** | **SUDAH ADA** sebagai `uuid, nullable, no default` (sudah dimasukkan saat migrasi `thesis_stage2_research_evidence_foundation` 2026-04-18) | ✅ PASS | Migration #6 **skip ADD COLUMN** untuk kolom ini — langsung extend enum `artifact_type` + tambah 4 kolom interaksi (`interaction_events`, `completion_status`, `component_score`, `mode`). Hemat 1 langkah. |
| 3 | **`subtopic_cache` compat** | 5 kolom existing (`id, cache_key, content jsonb, created_at, updated_at`), 113 baris populated | ✅ PASS | Migration #5 dapat ADD 9 kolom dengan DEFAULT. 113 baris existing akan auto-backfill ke `mode='general', qa_status='approved', locked=true` (treat existing cache as already-validated dari production). |
| 4 | **Auth bridge tetap berfungsi** dengan kolom `mode` baru | Tidak dapat diverifikasi tanpa endpoint call live | ⏸ DEFERRED | Smoke test wajib di W1 setelah migration #1 + write-path propagation update. POST `/api/ask-question` di course Mode Umum → cek `ask_question_history` baris baru punya `mode='general'` konsisten dengan `course.mode`. |
| 5 | **FK/trigger break risk** | Trigger `set_updated_at_timestamp` aman; tidak ada FK constraint yang akan break dari add column | ✅ PASS | Trigger sendiri punya WARN advisor (`function_search_path_mutable` — lihat Section 9.6), tapi tidak menghalangi add column. |

**Hasil:** **4 dari 5 PASS, 1 DEFERRED (wajib smoke test di W1)**. Tidak ada blocker untuk eksekusi MVR.

**Bonus: State DB aktual (snapshot 2026-05-16)** — verifikasi via `SELECT count(*)` (bukan stats `pg_class.reltuples` yang stale):

| Tabel | Snapshot 2026-04-26 (docs) | Aktual 2026-05-16 | Delta |
|---|---|---|---|
| `users` (active, `deleted_at IS NULL`) | 29 | 26 (1 admin role `'admin'` lowercase + 25 user role `'user'`) | -3 |
| `courses` | 33 | 37 | +4 |
| `subtopic_cache` | 109 | 113 | +4 |
| `research_artifacts` | 0 (skema lengkap) | 0 (skema lengkap) | ✅ clean slate |
| `prompt_revisions` | 0 (skema lengkap) | 0 (skema lengkap) | ✅ clean slate |
| `inter_rater_reliability` | 0 (skema lengkap) | 0 (skema lengkap) | ✅ clean slate |

⚠️ Catatan teknis: tool MCP `list_tables` menampilkan `rows` dari `pg_class.reltuples` yang STALE — banyak tabel ditampilkan 0 baris padahal aktual ada data signifikan (mis. `ask_question_history` shown 0 by stats, but actual count perlu dicek terpisah). **Selalu gunakan `SELECT count(*)` untuk angka definitif** saat melaporkan progress riset.

**Tambahan opsional** (recommended tapi tidak wajib): jalankan `supabase db diff --schema public` setelah setiap migration untuk confirm tidak ada side-effect tak terduga di view atau function existing.

### 9.5 Penghematan Effort dari Re-use Skema Existing

Berkat 3 tabel di Section 9.2 + 20 tabel di Section 9.3 yang tidak perlu disentuh, scope migrasi MVR jauh lebih ringan dari proyek green-field:

- **0 tabel di-drop atau di-restructure** → tidak ada risiko kehilangan data riset historis (143 prompt_classifications, 261 research_evidence_items, 64 triangulation_records sudah jadi baseline RM2/RM3 awal).
- **10 migration file** (vs ~18 kalau bangun dari nol).
- **~3-4 hari hemat** karena `research_artifacts`, `prompt_revisions`, dan `inter_rater_reliability` sudah siap.
- **RLS pattern existing langsung di-copy** untuk tabel baru (lihat pola di `add_rls_policies_all_tables.sql`).
- **Test harness existing** (Jest 30 di `tests/api/`) tidak perlu rewrite karena tabel-tabel yang dipakai dalam test (`users`, `courses`, `ask_question_history`, dst.) tetap struktur kompatibel — hanya add column.

Implikasi praktis: **W1-W2 timeline yang dialokasikan untuk migration + foundation lebih dari cukup**. Buffer dari penghematan ini bisa direlokasi ke W10-W11 untuk komponen interaktif kompleks (Item 9.3) yang resikonya lebih tinggi.

### 9.6 Supabase Advisor Findings (verified 2026-05-16)

Hasil `get_advisors` saat pre-flight — tidak ada ERROR, hanya **6 WARN** terkait security hygiene. Semua non-blocking untuk MVR, di-defer ke W12 hygiene sprint atau post-MVR cleanup. Catat di sini agar pembimbing/reviewer tahu tim sudah aware terhadap warning ini.

**Security findings (6 WARN, 0 ERROR)**:

| # | Lint code | Object | Severity | Detail | Tindakan | Target sprint |
|---|---|---|---|---|---|---|
| 1 | `function_search_path_mutable` | `public.set_updated_at_timestamp` | WARN | Trigger function tidak menetapkan `search_path` — risiko schema-poisoning di-skenario worst-case | `ALTER FUNCTION public.set_updated_at_timestamp() SET search_path = 'public', 'pg_temp';` | W12 hygiene |
| 2 | `function_search_path_mutable` | `public.refresh_learning_session_research_metrics` | WARN | Sama | Sama (`ALTER FUNCTION ... SET search_path = '...';`) | W12 hygiene |
| 3 | `anon_security_definer_function_executable` | `public.get_jsonb_columns()` | WARN | Function `SECURITY DEFINER` dapat dipanggil role `anon` via `/rest/v1/rpc/get_jsonb_columns` | `REVOKE EXECUTE ON FUNCTION public.get_jsonb_columns() FROM anon, authenticated;` (fungsi internal admin saja) | W12 hygiene |
| 4 | `anon_security_definer_function_executable` | `public.rls_auto_enable()` | WARN | Sama, untuk fungsi internal RLS bootstrap | Sama (revoke dari anon + authenticated) | W12 hygiene |
| 5 | `authenticated_security_definer_function_executable` | `public.get_jsonb_columns()` | WARN | Sama, pair dengan #3 | Sama dengan #3 (1 REVOKE statement) | W12 hygiene |
| 6 | `authenticated_security_definer_function_executable` | `public.rls_auto_enable()` | WARN | Sama, pair dengan #4 | Sama dengan #4 | W12 hygiene |

Saran konsolidasi: bundle ke-6 fix ini di **1 migration file** `2026-XX-fix-security-advisor-warnings.sql` di W12, sebelum pilot test. File ini juga jadi bagian dari audit trail keamanan untuk sidang ("tim aktif menanggapi advisor Supabase sebelum data collection").

**Performance findings**: output `get_advisors(type=performance)` berukuran 69KB — kemungkinan besar daftar `unused_index`, `slow_query`, atau `missing_index`. Tidak blocker untuk MVR. Review terpisah dapat dilakukan di post-pilot kalau performance jadi concern di W13 (mis. dashboard admin lambat saat 3 siswa concurrent).

### 9.7 Migration History Snapshot

54 migrasi sudah applied per 2026-05-16, terurut chronological. Yang relevan untuk MVR (sudah memberi kontribusi sebagai foundation):

- `thesis_stage2_research_evidence_foundation` (2026-04-18) — sudah menambah `learning_session_id` ke `research_artifacts` (verified PASS pre-flight #2)
- `thesis_stage3_auto_research_collection` (2026-04-18) — auto-coder infrastructure
- `thesis_stage4_auto_coder_engine` (2026-04-18) — auto-coder logic
- `add_rls_policies_all_tables` (2026-04-05) — RLS template yang akan di-copy untuk tabel baru
- `add_preferred_language_to_learning_profiles` (2026-05-14) — paling baru, sebelum MVR mulai

Tidak ada migrasi MVR yang sudah didahului — Slate bersih untuk 10 migration baru di Section 9.1.

---

## 10. Kesimpulan

Rencana ini menerjemahkan keputusan arsitektur dua-mode (siswa + admin) + spek konten Mode Penelitian (4 course mengikuti 1:1 Bab 2 buku Mushthofa dkk. 2023) + 6 komponen interaktif untuk SMA menjadi **13 minggu** kerja dengan critical path Item 1 → 3 → 4 → 4b → 5 → 7 → 7b → 9 → 8 → 10. Item 2 (4 template + 26 leaf-subtopik) dan Item 6 (editor) dapat dikerjakan paralel. Item 10 (Admin Mode Toggle) dijadwalkan paralel di W11-W12 agar tidak menambah panjang timeline.

**Lima risiko terbesar yang perlu mitigasi sejak W1**:

1. **Coverage bank sumber** — pastikan PDF yang di-upload benar-benar menutupi 8 topik Fase E (validasi di akhir W4).
2. **AI tier 3 terlalu cepat memberi solusi** — siapkan test prompt + few-shot examples sebelum lock di W6.
3. **Ketersediaan rater kedua untuk IRR** — konfirmasi orangnya di W1, bukan W12.
4. **Content authoring 20-25 instansiasi interaktif memakan W11 penuh** — siapkan 12 example JSON starter di W10 agar peneliti tidak menulis from scratch.
5. **Komponen kompleks (FlowchartBuilder, PseudocodeBlockBuilder) berisiko bug saat pilot** — test extensively di W10; siapkan fallback "konten statis" jika tidak stable di W13.

Setelah 13 minggu, media layak disebut **"Media AI Sokratik Berbasis Sumber pada Pembelajaran Algoritma Pemrograman"** dengan empat bukti utama yang dapat dipertahankan di sidang:

- **Sokratik**: System prompt graduated + hint tier eksplisit + closing reflective question + AI auto-trigger reflektif setelah interaksi (terbukti via 8 prompt uji + 6 test interaksi dengan rasio ≥ 7/8).
- **Berbasis sumber**: Setiap respons AI Mode Penelitian punya `cited_material_chunk_ids` non-empty (≥80% prompt); bank sumber tervalidasi mencakup 8 topik Fase E.
- **Algoritma Fase E**: 4 course template (1:1 dengan Bab 2 buku Mushthofa dkk. 2023, Kemdikbudristek) + unlock progresif + domain guard memaksa siswa belajar dalam scope kurikulum resmi Fase E.
- **Interaktif & sesuai usia SMA**: 6 komponen interaktif (TraceTable, OutputPredictor, ParsonsProblem, BugHunt, FlowchartBuilder, PseudocodeBlockBuilder) yang memaksa siswa **melakukan** alih-alih membaca; setiap interaksi menjadi artefak mikro untuk dimensi CT/CrT.
- **Separasi data riset vs operasional**: Admin Mode Toggle (Item 10) memberi peneliti lensa "Mode Penelitian" yang menampilkan hanya data dari course `mode='research'`, sementara Mode Umum tetap berfungsi untuk operator aplikasi. Halaman riset-only (sumber, cache review, interactive blocks, riset/*) disembunyikan di Mode Umum untuk mengurangi noise.

Empat bukti ini sekaligus memberi material untuk produk konseptual tesis (prinsip desain media AI Sokratik berbasis sumber) — masing-masing bukti operasional langsung memetakan ke prinsip desain di Bagian 8.2 `rencana-penyelarasan-media-ai-sokratik.md`, ditambah satu prinsip baru yang muncul dari Item 9: **"prinsip interaktivitas sebagai sumber bukti CT"** — siswa belajar dengan melakukan, dan setiap aksi menghasilkan jejak yang dapat di-coded untuk dimensi computational dan critical thinking tanpa harus menunggu siswa menulis pseudocode lengkap. Item 10 melengkapi dengan **"prinsip separasi-mode di lapisan administratif"** — alat riset tidak mengganggu fungsi operasional aplikasi, dan data riset terisolasi dari noise umum di setiap titik kontak admin.
