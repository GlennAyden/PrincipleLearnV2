# RAG Pipeline — Mode Penelitian

Dokumen ini mendeskripsikan pipeline Retrieval-Augmented Generation (RAG) yang dipakai untuk men-generate konten subtopik kanonik Mode Penelitian (Item 4 MVR), serta menjawab pertanyaan siswa via `ask-question` dan `challenge-thinking` agar AI hanya merespons dari Bank Sumber yang sudah divalidasi peneliti.

## 1. Tujuan & Posisi dalam Arsitektur

Mode Umum mengandalkan LLM murni untuk konten subtopik dan tanya-jawab. Untuk Mode Penelitian, pendekatan murni LLM ditolak karena dua alasan operasional:

1. **Validitas konstruk RM2/RM3.** Setiap siswa harus melihat materi yang identik byte-for-byte agar analisis longitudinal terhadap evolusi prompt dan dimensi kognitif tidak terkontaminasi oleh varian konten yang berbeda antar siswa.
2. **Kemampuan rujuk balik (provenance).** Setiap klaim faktual yang dilihat siswa harus dapat dirujuk ke halaman buku/modul Fase E. Tanpa retrieval, sumber tidak dapat dijelaskan di sidang.

RAG menyelesaikan keduanya: konten + jawaban AI dibangun dari `material_chunks` yang sudah dikurasi peneliti, dan setiap potongan teks yang dipakai diserap kembali ke baris audit (`cited_material_chunk_ids`).

Cross-reference: lihat [MODE_SYSTEM.md](MODE_SYSTEM.md) untuk separasi mode admin/siswa, dan [CONTENT_SPEC_FASE_E.md](CONTENT_SPEC_FASE_E.md) untuk struktur 4 course × 26 leaf yang menjadi target retrieval.

## 2. Skema Data

Pipeline bertumpu pada dua tabel baru + ekstensi pgvector (≥0.8.0) di Supabase project `wesgoqdldgjbwgmubfdm`:

- `materials(id UUID PK, title, author, edition, template_topics VARCHAR(50)[], source_url, storage_path, file_size_bytes, page_count, validation_status CHECK IN ('draft','validated','retired'), validated_by, validated_at, uploaded_by, …)` — satu baris per PDF buku/modul. Kolom `template_topics` adalah array karena satu PDF (mis. buku Kemdikbudristek) sering mencakup beberapa slug kurikulum sekaligus. Indeks GIN dipasang di kolom ini agar query "topik X = ANY(template_topics)" berjalan cepat.
- `material_chunks(id UUID PK, material_id FK CASCADE, chunk_idx INT, chunk_text TEXT, page_number INT, token_count INT, embedding vector(1536), …)` dengan `UNIQUE(material_id, chunk_idx)` + indeks `ivfflat (embedding vector_cosine_ops) WITH (lists=100)`. Pemilihan ivfflat (bukan HNSW) menyesuaikan versi pgvector default Supabase serta jumlah chunk yang relatif kecil (proyeksi ≤16k row).

Tabel `subtopic_cache` diperluas dengan kolom `mode`, `locked`, `qa_status`, `qa_reviewed_by`, `qa_reviewed_at`, `qa_notes`, `source_chunk_ids UUID[]`, `generation_seed`, dan `generated_by` untuk QA workflow (Item 4b — lihat Section 5).

## 3. Pipeline Upload (Admin → Bank Sumber)

Endpoint: [`src/app/api/admin/sumber/route.ts`](../src/app/api/admin/sumber/route.ts). Dijaga oleh `assertResearchModeOnly(req)` sehingga hanya admin yang sedang aktif di Mode Penelitian dapat upload.

Tahapan untuk satu PDF:

1. **Decode base64 → buffer Uint8Array.** PDF dikirim sebagai `pdfBase64` di body (Vercel route, pure-ESM compatible).
2. **Ekstrak teks per-halaman via `unpdf`.** `extractText(data, { mergePages: false })` mengembalikan array string per halaman. Heuristik penolakan: rata-rata <40 karakter per halaman atau total <200 karakter → respons 400 "PDF tampak berbasis gambar (lakukan OCR manual)".
3. **Chunking via [`src/services/material-chunker.service.ts`](../src/services/material-chunker.service.ts).** Target 600 token, overlap 80 token (approximated `text.length / 4`, lihat catatan di file). Mempertahankan boundary halaman, sehingga setiap `ChunkRecord` membawa `pageNumber` untuk citation. Paragraf raksasa di-cut di boundary kalimat (`. `) terdekat agar tidak melebihi 1.4× target.
4. **Embedding via [`src/services/embedding.service.ts`](../src/services/embedding.service.ts).** Memakai `text-embedding-3-small` (1536 dim) dalam batch maksimal 100 input — di atas itu OpenAI sering menyentuh timeout 60 detik dan menggugurkan seluruh batch. Tidak ada fallback model: kegagalan embedder me-rollback baris `materials` agar admin bisa upload ulang.
5. **Insert chunk dalam batch 100 row** agar di bawah limit body 1MB Supabase JS client.
6. **Respons** berisi `chunk_count`, `total_tokens`, dan `estimated_cost_usd` (= tokens / 1e6 × $0.02). Baris baru masuk dengan `validation_status='draft'` — peneliti harus eksplisit promote ke `validated` sebelum chunk-nya dipakai retrieval (RPC `match_material_chunks` memfilter validation_status).

## 4. Pipeline Retrieval (Query → Top-k Chunk)

Service: [`src/services/rag.service.ts`](../src/services/rag.service.ts).

```
embedQuery(query)  →  vector(1536)
    ↓
RPC `match_material_chunks`(embedding, template_topic, k, threshold)
    ↓
ORDER BY mc.embedding <=> $1   (cosine distance, ascending)
    ↓
filter: similarity >= threshold AND m.validation_status='validated'
    ↓
RetrievedChunk[] sorted by similarity desc
```

Fungsi `retrieveContext({ query, templateTopic, k, threshold })` mengembalikan `{ chunks, totalRetrieved, aboveThreshold }`. Karena RPC sudah memfilter threshold di sisi server, `aboveThreshold === chunks.length` di response.

`renderSourcesForPrompt(chunks)` membungkus tiap chunk dalam tag XML `<source id="c{uuid}" page="N" similarity="0.74">text</source>` yang kemudian disuntikkan ke konten user prompt; format `c{uuid}` ini sengaja dipaksa karena `citation-parser.service.ts` (Section 5) bergantung padanya verbatim.

**Default parameter berdasarkan call-site:**

| Konsumen | k | threshold | Justifikasi |
|---|---|---|---|
| Generasi konten subtopik ([`subtopic-cache-research.service.ts`](../src/services/subtopic-cache-research.service.ts), line 95-100) | 8 | 0.55 | Konten ekspositoris 3-5 paragraf butuh basis sumber lebih luas; threshold lebih longgar agar tidak terlalu sering kosong di topik dengan PDF tipis. |
| Q&A `ask-question` & `challenge-thinking` (default `rag.service.ts`) | 4 | 0.65 | Jawaban pendek; presisi (relevansi tinggi) lebih penting daripada recall. |

## 5. Citation Flow

Parser: [`src/services/citation-parser.service.ts`](../src/services/citation-parser.service.ts). Regex tight `/\[c([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi` memastikan hanya UUID v4-ish yang ter-extract, deduplikasi mempertahankan order kemunculan pertama (signal mana chunk yang AI sandari paling awal).

Hasilnya disimpan ke kolom `cited_material_chunk_ids UUID[]` di:

- `ask_question_history` — Q&A siswa.
- `challenge_responses` — feedback challenge thinking.
- `subtopic_cache.source_chunk_ids` — chunk yang dipakai saat generate konten subtopik (langsung tanpa lewat parser karena daftar chunk sudah ditahu pre-prompt).

Pada sidang ini menjadi material untuk klaim "AI tidak halusinasi" — peneliti dapat membuka satu baris `ask_question_history`, jalankan join ke `material_chunks` lewat array tersebut, dan menunjuk halaman buku.

## 6. Fallback Behavior

Tiga jalur kegagalan ditangani secara graceful, bukan sebagai 500:

- **Embedder error** (rate limit, network) → `retrieveContext` mengembalikan `chunks: []` dengan warning log; tidak melempar agar streaming Q&A tetap dapat menjawab "materi belum tersedia".
- **RPC error** → idem, return empty.
- **`aboveThreshold === 0`** → di endpoint Q&A AI di-instruksikan untuk menjawab dengan pesan redirect halus ("Materi ini belum tersedia di bank sumber; mari kita kaitkan dengan {template_topic}"); di pipeline cache-generation `subtopic-cache-research.service.ts` mengembalikan `status: 'error'` dengan pesan "Bank sumber kosong untuk topik ini" sehingga admin harus mengunggah materi dulu.

Tujuan eksplisit: **AI tidak boleh mengarang** ketika tidak ada chunk di atas threshold.

## 7. Biaya Operasional

Embedding satu kali per chunk (text-embedding-3-small = $0.02 / 1M token). Estimasi 14 PDF di [`docs/bank-sumber/`](bank-sumber/) ≈ 1.500 halaman × ~500 token/halaman ≈ ~750k token sumber. Setelah chunking dengan overlap 13% (80/600), token ter-embed ≈ ~850k → biaya satu kali ≈ **$0.017** (kurang dari satu sen). Bahkan pada skenario 10× lebih besar (16k chunks ≈ 9.6M token), biaya tetap ≈ **$0.19**. Konsekuensi: biaya re-embed bukan kendala, sehingga keputusan mengganti model embedding di masa depan tidak terblokir budget.

Biaya retrieval per query = 1× embed query ≈ ~20 token = praktis nol. Biaya generation konten subtopik (gpt-5-mini, maxTokens 1800) jauh lebih dominan dan dibatasi sekali per leaf via cache lock (Section 8).

## 8. Cache Lock + QA (Item 4b)

[`src/services/subtopic-cache-research.service.ts`](../src/services/subtopic-cache-research.service.ts) menjamin determinisme konten: siswa pertama yang mengakses leaf X memicu generation, baris masuk dengan `qa_status='pending'` + `locked=true`. Siswa kedua menerima `status: 'under_review'` (UI: "Materi sedang disiapkan peneliti"). Peneliti approve via `/admin/sumber/cache-review` (lihat [MODE_SYSTEM.md](MODE_SYSTEM.md) untuk navigation visibility) — setelah itu semua siswa berikutnya mendapat baris yang **sama**.

`generation_seed` = `sha256(cache_key).slice(0,16)`. gpt-5-mini tidak mengekspos parameter `seed` di API, sehingga seed di sini berfungsi sebagai *provenance tag* untuk mendeteksi regenerasi yang tidak disengaja — bukan jaminan determinisme di level model.

## Catatan untuk Reviewer Sidang

Dua keputusan parameter dapat diadvokasi: pemilihan **k=4 / threshold=0.65 untuk Q&A** vs **k=8 / threshold=0.55 untuk generation konten** mengikuti prinsip bahwa Q&A presisi-sensitif (jawaban pendek, satu klaim salah segera terlihat) sedangkan ekspositoris recall-sensitif (3-5 paragraf perlu sintesis dari beberapa sub-konteks). Threshold 0.65 dipilih dari uji manual pada teks Bab 2 Mushthofa dkk. 2023 — di bawah angka tersebut, chunk yang ter-retrieve mulai membahas topik tetangga (mis. query "while loop" mendapat chunk tentang for-loop pada threshold 0.55). Trade-off ini dapat ditinjau ulang pasca-pilot dengan data hit-rate riil. Bank sumber saat ini berisi 14 PDF terkurasi di [`docs/bank-sumber/`](bank-sumber/) namun belum di-upload ke tabel `materials` pada saat dokumen ini ditulis (DB count = 0); langkah operasional pra-uji lapangan adalah peneliti menjalankan upload via UI `/admin/sumber` di Mode Penelitian (lihat sub-task Item 3 di [`rencana-eksekusi-mvr.md`](../rencana-eksekusi-mvr.md)).
