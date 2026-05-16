# Rencana Lanjutan MVR — Eksekusi Sisa Pekerjaan

**Konteks**: Dokumen ini menerjemahkan `rencana-eksekusi-mvr.md` versi awal (13-minggu plan) ke daftar pekerjaan yang **belum selesai per 2026-05-16** setelah eksekusi paralel W1-W12 + integrasi awal Item 10. Cakupan saat ini ±85% dari 12 item MVR. Tujuan dokumen ini: memandu sprint terakhir hingga DoD pilot test W13 tercapai.

**Sumber kebenaran**: Verifikasi langsung codebase + Supabase MCP (project `wesgoqdldgjbwgmubfdm`) tanggal 2026-05-16, dipadukan dengan acceptance criteria di `rencana-eksekusi-mvr.md`.

---

## 1. Ringkasan Status per Item MVR

| Item | Cakupan | Status | Sisa pekerjaan |
|---|---|---|---|
| 1 | Mode flag + UI toggle siswa | ✅ Selesai | — |
| 2 | 4 template + 26 leaf + unlock-deps | ✅ Selesai (data seeded) | — |
| 3 | Bank sumber + admin uploader | 🟡 Parsial | PDF parser binary (unpdf) belum terpasang; admin UI menerima raw text |
| 4 | RAG retrieval + citation | ✅ Selesai | — |
| 4b | Cache lock + QA workflow | ✅ Selesai (UI + endpoint + integrasi `generate-subtopic`) | Pre-generate 26 leaf belum dijalankan; review batch peneliti |
| 5 | Sokratik graduated prompt | ✅ Selesai | — |
| 6 | PseudocodeEditor + artefak | ✅ Selesai (komponen + endpoint submit) | Pastikan tab editor muncul di subtopic Mode Penelitian (smoke test) |
| 7 | Hint tier mechanism | ✅ Selesai | — |
| 7b | Unlock progresif + 4-card jalur | ✅ Selesai (`FaseEJalur`, endpoint, helper) | — |
| 8a | `prompt_revisions` auto-insert | ✅ Selesai | — |
| 8b | Ekspor `data_type=prompts_detail` | ✅ Selesai | — |
| 8c | `participant_code` backfill | ✅ Selesai (script idempotent; menunggu user research nyata) | — |
| 8d | IRR workflow (codebook + sampling + rater UI + kappa) | ❌ Belum | Penuh — codebook + script + UI + kappa + tiebreaker |
| 9.1 | Foundation interactive blocks | ✅ Selesai (skema + hook + AI auto-trigger) | — |
| 9.2 | Komponen ringan | 🟡 Parsial | `ParsonsProblem.tsx` belum ada (TraceTable & OutputPredictor sudah) |
| 9.3 | Komponen kompleks | ❌ Belum | BugHunt + FlowchartBuilder + PseudocodeBlockBuilder |
| 9.4 | Content authoring + admin UI | ❌ Belum | `/admin/sumber/interactive-blocks` UI + JSON config 22 instansiasi |
| 10.1-10.2 | Cookie + provider + toggle UI | ✅ Selesai | — |
| 10.3 | Navigation visibility | 🟡 Parsial | Sidebar conditional render + direct URL guard |
| 10.4 | Filter propagation di endpoint | 🟡 Parsial | `assertResearchModeOnly` di `/api/admin/sumber/*` + `/api/admin/research/*` sudah; `applyAdminModeFilter` BELUM di `/api/admin/dashboard`, `/api/admin/activity/*` (16 endpoint), `/api/admin/users*`, `/api/admin/monitoring/*` |
| 10.5 | Audit log + footer mode indicator | ❌ Belum | Event `admin_mode_switched` di `api_logs` + footer indicator |
| W12 | Hygiene advisor fixes | ✅ Selesai | — |
| W13 | Pilot test 3 siswa | ❌ Belum | Dijadwalkan setelah semua DoD lulus |

**Dokumentasi pendukung** (Section 8 rencana awal):

| Dokumen | Status |
|---|---|
| `docs/sql/2026-*.sql` (10 file migration) | ❌ Belum di-commit ke repo (migrasi sudah applied via MCP — file SQL untuk audit trail sidang belum ada) |
| `docs/thesis/CODEBOOK_RM2_RM3.md` | ❌ Belum |
| `docs/RAG_PIPELINE.md` | ❌ Belum |
| `docs/MODE_SYSTEM.md` | ❌ Belum |
| `docs/CONTENT_SPEC_FASE_E.md` | ❌ Belum |
| `docs/INTERACTIVE_BLOCKS_SPEC.md` | ❌ Belum |
| `docs/examples/interactive-blocks/*.json` | ❌ Belum |
| `CLAUDE.md` section Mode System | 🟡 Parsial — sudah ada bilingual + onboarding gate; perlu tambah Mode System + Interactive Blocks |
| `docs/DATABASE_SCHEMA.md` | 🟡 Perlu update kolom baru (mode, qa_status, interactive_blocks, scaffold_tier, dst.) |

---

## 2. Prioritas Eksekusi

Tiga tier sesuai risiko dampak ke pilot W13 dan kelulusan sidang.

### Tier 1 — Wajib sebelum pilot test (blocker DoD)

Tanpa item ini, pilot W13 tidak dapat dijalankan atau hasilnya tidak terdokumentasi untuk sidang.

1. **Item 10.4 — Filter propagation lengkap** (≈ 1.5-2 hari)
   Hingga `applyAdminModeFilter` dipakai di minimal 10 endpoint admin (DoD eksplisit Item 10).
2. **Item 10.3 — Navigation visibility + direct URL guard** (≈ 0.5 hari)
   Tanpa ini admin bisa "bocor" lihat data Mode Umum saat ekspor.
3. **Item 10.5 — Audit log `admin_mode_switched`** (≈ 0.5 hari)
   Memastikan integritas riset; satu endpoint + 1 catatan footer.
4. **Item 4b — Pre-generate 26 leaf + batch review peneliti** (≈ 1 hari script + 1-2 hari review konten)
   Tanpa konten subtopik approved, siswa pilot dapat "materi sedang disiapkan" → drop out.
5. **Item 3 — PDF parser binary** (≈ 0.5 hari)
   Pasang `unpdf` (pure ESM) di `/api/admin/sumber/upload`. Saat ini admin harus paste teks manual — tidak realistis untuk buku 30 halaman.
6. **Item 9.2 — Lengkapi `ParsonsProblem.tsx`** (≈ 1 hari)
   Bersama TraceTable & OutputPredictor membentuk minimum interaktivitas Course 1-2 (leaf 1.5, 2.5). Tanpa Parsons, mapping di Item 9.4 turun ke ≤13 instansiasi (≤50% target DoD 18/26).
7. **Item 9.4 — Content authoring minimum** (≈ 1.5 hari peneliti)
   Tulis JSON config untuk minimum 18 instansiasi (target DoD) memakai 3 komponen ringan (TraceTable + OutputPredictor + ParsonsProblem) saja. Sisa 4 komponen kompleks ditunda.

**Subtotal Tier 1**: ≈ 6-7 hari kerja efektif (peneliti tunggal).

### Tier 2 — Penting untuk klaim sidang tapi dapat di-defer

8. **Item 8d — IRR workflow** (≈ 2-3 hari)
   - 8d.1 codebook tulis (0.5 hari)
   - 8d.2 sampling script (0.5 hari)
   - 8d.3 rater UI sederhana (1 hari)
   - 8d.4 kappa computation script (0.5 hari)
   - 8d.5 LLM tiebreaker integration (0.5 hari)
   IRR baru perlu setelah data pilot terkumpul. Dapat dikerjakan **paralel** dengan pilot W13 atau **setelah** pilot selesai (W14).
9. **Item 9.3 — 3 komponen kompleks** (≈ 4-5 hari)
   BugHunt + FlowchartBuilder + PseudocodeBlockBuilder. Rencana Section 6 eksplisit menyatakan ini boleh di-defer ke post-MVR (data collection round 2) jika timeline mepet. Untuk pilot pertama, 3 komponen ringan + PseudocodeEditor cukup untuk klaim "media interaktif".
10. **Item 9.4 — Admin UI authoring** (≈ 1.5 hari)
    `/admin/sumber/interactive-blocks` editor JSONB. Untuk pilot pertama, peneliti dapat tulis JSON langsung via Supabase SQL editor (manual). Admin UI hanya UX polish.

### Tier 3 — Dokumentasi sidang (paralel + akhir)

11. **Dokumentasi `docs/sql/` audit trail** (≈ 1 hari)
    Salin 10 migration yang sudah applied dari Supabase MCP history → tulis ke `docs/sql/2026-*.sql` agar reproducible & dapat di-review pembimbing.
12. **`docs/CODEBOOK_RM2_RM3.md`** (≈ 1 hari) — wajib untuk klaim IRR.
13. **`docs/RAG_PIPELINE.md` + `docs/MODE_SYSTEM.md` + `docs/CONTENT_SPEC_FASE_E.md` + `docs/INTERACTIVE_BLOCKS_SPEC.md`** (≈ 2 hari kolektif) — bahan sidang.
14. **Update `CLAUDE.md` + `docs/DATABASE_SCHEMA.md`** (≈ 0.5 hari).

### Yang sudah dapat di-skip (per rencana awal Section 6)

- 2-3 komponen Item 9.3 paling kompleks (FlowchartBuilder paling berat).
- 5-7 dari 22 instansiasi interaktif jika krisis waktu.

---

## 3. Plan per Item (Tier 1 detail)

### Plan 1 — Item 10.4 Filter Propagation

**Endpoint scope** (16+ endpoint):

| Endpoint | Tabel disentuh | Strategi filter |
|---|---|---|
| `GET /api/admin/dashboard` | `courses`, `learning_sessions`, `prompt_classifications`, `cognitive_indicators`, `auto_cognitive_scores` | `applyAdminModeFilter(qb, mode)` di setiap subquery KPI |
| `GET /api/admin/activity/ask-question` | `ask_question_history` JOIN `courses` | Filter `ask_question_history.mode` langsung (kolom ada) |
| `GET /api/admin/activity/challenge` | `challenge_responses` | Filter `challenge_responses.mode` langsung |
| `GET /api/admin/activity/jurnal` | `jurnal` JOIN `courses` | Filter `jurnal.mode` langsung |
| `GET /api/admin/activity/quiz` | `quiz_submissions` JOIN `courses` | Filter `quiz_submissions.mode` langsung |
| `GET /api/admin/activity/courses` | `courses` | `courses.mode = $mode` |
| `GET /api/admin/activity/discussion`, `examples`, `feedback`, `transcript`, `learning-profile`, `search`, `topics`, `actions`, `analytics`, `export`, `generate-course` | Sub-endpoint activity drill-down | Filter via JOIN ke `courses` |
| `GET /api/admin/users` & `/api/admin/users/[id]` & sub-endpoint (`activity-summary`, `detail`, `subtopics`, `evolusi`) | `users` | `EXISTS (SELECT 1 FROM learning_sessions WHERE user_id = users.id AND mode = $mode)` |
| `GET /api/admin/monitoring/*` | `api_logs` | Filter path / endpoint berkaitan course Mode Penelitian (optional, no hard requirement) |

**Eksekusi**:

1. Audit setiap handler activity satu per satu (16 file).
2. Tambah `const mode = getAdminModeFromRequest(req);` di awal.
3. Bungkus query Supabase dengan `applyAdminModeFilter(qb, mode, '<table_alias>')`.
4. Pastikan ada test/smoke: di Mode Umum, query mengembalikan baris baik Umum maupun Penelitian; di Mode Penelitian, hanya yang `mode='research'`.
5. Update header dokumentasi setiap endpoint (`/** Filtered by admin_mode header */`).

**Acceptance**: grep `applyAdminModeFilter` mengembalikan ≥10 file di `src/app/api/admin/`.

### Plan 2 — Item 10.3 Navigation Visibility + URL Guard

1. Edit `src/app/admin/layout.tsx`: bungkus item sidebar "Sumber" + "Riset" dengan `{adminMode === 'research' && ...}`.
2. Tambah middleware di `middleware.ts` (atau page-level `redirect`) untuk path `/admin/sumber`, `/admin/riset/*` → cek cookie `admin_mode`; jika `general`, `redirect('/admin/dashboard?toast=mode-required')`.
3. Tampilkan toast di dashboard saat query param `toast=mode-required` ada (gunakan komponen toast existing kalau ada, kalau tidak inline notice).

**Acceptance**:

- Toggle Mode Umum → menu Sumber & Riset hilang dari sidebar.
- Akses `/admin/sumber` di Mode Umum → redirect ke dashboard + toast.

### Plan 3 — Item 10.5 Audit Log + Footer Indicator

1. Tambah `POST /api/admin/mode-switch` log event ke `api_logs` dengan `endpoint='admin_mode_switched'`, body `{ from, to }`. Endpoint mode-switch sudah ada; tinggal tambah call ke `logApi(...)`.
2. Tambah footer kecil di `src/app/admin/layout.tsx`: "Mode aktif: 🔬 Penelitian — terakhir diubah {timestamp} oleh {admin_email}". Query 1 row dari `api_logs` `WHERE endpoint='admin_mode_switched' ORDER BY created_at DESC LIMIT 1`.

**Acceptance**: setelah klik toggle, baris baru di `api_logs` muncul; footer menampilkan timestamp + email.

### Plan 4 — Item 4b Pre-generate 26 Leaf

1. Tulis `scripts/pre-generate-research-subtopics.ts`:
   - Loop 4 template courses → loop semua `leaf_subtopics` → panggil `getOrGenerateResearchSubtopicContent(courseId, leafId, peneliti_user_id)`.
   - Sleep 2 detik antar leaf untuk avoid OpenAI rate limit.
   - Output progress: "Leaf X.Y selesai (status: pending)".
2. Jalankan script dengan `npx tsx scripts/pre-generate-research-subtopics.ts`.
3. Peneliti review batch di `/admin/sumber/cache-review` → approve / edit / regenerate. Target: 26/26 `qa_status='approved'` sebelum pilot.

**Acceptance**: query `SELECT COUNT(*) FROM subtopic_cache WHERE mode='research' AND qa_status='approved'` = 26.

### Plan 5 — Item 3 PDF Parser Integration

1. `npm i unpdf` (pure ESM, no native deps, works on Vercel).
2. Edit `/api/admin/sumber/upload/route.ts`:
   - Tambah branch: jika file MIME `application/pdf`, panggil `extractText` dari `unpdf` → kirim hasil ke chunker.
   - Validasi: tolak PDF dengan total ekstrak text < 100 char (kemungkinan scan-PDF) dengan pesan "PDF mungkin berbasis gambar — gunakan OCR manual".
3. Smoke test: upload `docs/Informatika_BS_KLS_X_Rev.pdf` (sudah ada di repo) → harus menghasilkan chunks tervalidasi dengan citation di RAG.

**Acceptance**: 1 PDF buku Mushthofa dkk. ter-upload, ter-chunk, ter-embed, RAG retrieval mengembalikan chunks dari PDF tersebut saat siswa bertanya tentang Fase E.

### Plan 6 — Item 9.2 ParsonsProblem

1. `npm i @dnd-kit/core @dnd-kit/sortable` (cek apakah sudah ada).
2. Tulis `src/components/Interactive/ParsonsProblem.tsx`:
   - Props: `config: { lines: string[]; expectedOrder: number[] }`.
   - State: `currentOrder: number[]` (default shuffled).
   - dnd-kit `SortableContext` + drag handle.
   - Submit: hitung `score = matchedPositions / lines.length`; emit event `submitted` ke `useInteractionTracking`.
   - Style mirror TraceTable.module.scss (consistency).
3. Register di `InteractiveBlockRenderer.tsx`:
   - `case 'parsons': return <ParsonsProblem config={block.config} ... />`.
4. Smoke test di subtopic 1.5 (Pseudokode: Konvensi & Contoh).

**Acceptance**: drag-drop 6 baris pseudokode di leaf 1.5 → submit → `research_artifacts` baris baru dengan `artifact_type='parsons'`, `component_score` antara 0-1, `interaction_events` non-empty.

### Plan 7 — Item 9.4 Content Authoring Minimum (3 komponen × 18 instansiasi)

Per mapping Section 9 rencana awal, namun **dikurangi** untuk pilot pertama:

| Course | Leaf | Komponen Ringan Saja |
|---|---|---|
| mengenal-algoritma | 1.4 | TraceTable |
| mengenal-algoritma | 1.5 | ParsonsProblem |
| mengenal-algoritma | 1.6 | TraceTable |
| struktur-kendali | 2.3 | OutputPredictor |
| struktur-kendali | 2.4 | OutputPredictor |
| struktur-kendali | 2.5 | ParsonsProblem |
| struktur-kendali | 2.6 | TraceTable |
| struktur-kendali | 2.7 | TraceTable |
| struktur-kendali | 2.7 (slot 2) | OutputPredictor |
| struktur-kendali | 2.8 | TraceTable |
| struktur-kendali | 2.9 | OutputPredictor |
| struktur-kendali | 2.10 | TraceTable |
| memilih-algoritma | 3.2 | OutputPredictor |
| memilih-algoritma | 3.3 | TraceTable |
| memilih-algoritma | 3.4 | TraceTable |
| memilih-algoritma | 3.5 | TraceTable |
| struktur-data | 4.2 | OutputPredictor |
| struktur-data | 4.3 | OutputPredictor |

**Total: 18 instansiasi** (tepat di ambang DoD 18/26 = 69%, lihat Item 9 Acceptance).

Karena admin UI belum ada (Item 9.4 deferred ke Tier 2), peneliti tulis JSON langsung via:

```sql
UPDATE leaf_subtopics
SET interactive_blocks = '[{"type":"trace_table","config":{...}}]'::jsonb
WHERE id = '<leaf_uuid>';
```

Siapkan 1 starter JSON per tipe (TraceTable, OutputPredictor, ParsonsProblem) di `docs/examples/interactive-blocks/` agar peneliti tinggal copy-edit.

**Acceptance**: query `SELECT COUNT(*) FROM leaf_subtopics WHERE jsonb_array_length(interactive_blocks) > 0` ≥ 18.

---

## 4. Plan per Item (Tier 2 ringkasan)

### Item 8d IRR Workflow

1. **Codebook** `docs/thesis/CODEBOOK_RM2_RM3.md`:
   - 4 prompt stages: SCP / SRP / MQP / Reflektif (definisi operasional + 2 contoh anchor per stage).
   - 12 dimensi CT/CrT: per dimensi 0-2 anchor + contoh ekstrak prompt nyata jika ada.
   - Pemetaan komponen interaktif → dimensi RM3 (sudah ada tabel di rencana awal Item 9; konsolidasi).
2. **Sampling** `scripts/irr-sample.ts`:
   - Stratified random 25% per stage; output `scripts/irr-sample-out.json`.
3. **Rater UI** `/admin/riset/irr/page.tsx`:
   - List sampel + form 4-radio stage + 12 slider/score CT/CrT + textarea catatan.
   - Endpoint `/api/admin/research/irr/` POST → insert ke `prompt_classifications` dengan `classified_by='researcher_2'` + `secondary_classification_id` linked.
4. **Kappa script** `scripts/irr-compute-kappa.ts`:
   - Query pair → hitung Cohen's κ per stage dan Po per dimensi.
   - Insert ke `inter_rater_reliability`.
5. **LLM tiebreaker**: saat `agreement_status='disagree'`, panggil `cognitive-scoring.service.ts` sebagai pihak ketiga; simpan di `tiebreaker_*` cols.

### Item 9.3 Komponen Kompleks (defer-able)

Jika waktu memungkinkan (W14+):

- **BugHunt** — ringan, mirip TraceTable + AI eval; ≈ 1.5 hari.
- **FlowchartBuilder** — pakai `reactflow`; berat; ≈ 2.5-3 hari.
- **PseudocodeBlockBuilder** — pakai dnd-kit, mirip Parsons advanced; ≈ 2 hari.

Total ≈ 6-7 hari. Lewat post-MVR per rencana asli Section 6.

### Item 9.4 Admin Authoring UI

`/admin/sumber/interactive-blocks/page.tsx`:

- List leaf-subtopik per course (4 accordion).
- Per leaf: textarea JSON + tombol "Validasi" (Zod) + tombol "Simpan".
- Preview panel kanan: render `InteractiveBlockRenderer` dengan JSON live.

≈ 1.5 hari.

---

## 5. Plan per Item (Tier 3 dokumen ringkasan)

| Dokumen | Konten kunci | Sumber bahan |
|---|---|---|
| `docs/sql/2026-*.sql` × 10 | Copy dari Supabase MCP migration history (`list_migrations`) → tulis ke file dengan nama tanggal | `mcp__supabase__list_migrations` |
| `docs/CODEBOOK_RM2_RM3.md` | 4 stage + 12 dimensi + anchor + scoring rubric | `docs/thesis/ASSESSMENT_RUBRIC.md` (template existing), `docs/thesis/THINKING_SKILL.md` |
| `docs/RAG_PIPELINE.md` | Embedding model, chunk size, top-k, threshold, citation flow | `src/services/rag.service.ts`, `src/services/embedding.service.ts` |
| `docs/MODE_SYSTEM.md` | Dua mode (general vs research), cookie + provider siswa/admin, filter propagation | `src/lib/admin-mode.ts`, `src/context/AdminModeContext.tsx`, `middleware.ts` |
| `docs/CONTENT_SPEC_FASE_E.md` | 4 course + 26 leaf + referensi halaman buku + learning objectives | Tabel di `rencana-eksekusi-mvr.md` Item 2 + leaf_subtopics di DB |
| `docs/INTERACTIVE_BLOCKS_SPEC.md` | JSON schema 3-6 komponen + scoring rubric + mapping ke 18 instansiasi | `src/types/interactive-blocks.ts` + `src/components/Interactive/*` |
| `docs/examples/interactive-blocks/*.json` | 1 starter per komponen (3 file minimal: trace_table.json, output_predictor.json, parsons.json) | Hardcoded contoh dari leaf 1.4/2.3/1.5 |
| `CLAUDE.md` patch | Tambah section "Mode System" + "Interactive Blocks" | Existing file |
| `docs/DATABASE_SCHEMA.md` patch | Tambah kolom mode, qa_status, locked, interactive_blocks, scaffold_tier, prompt_template_version, cited_material_chunk_ids, participant_code | Diff dari schema awal |

---

## 6. Rekomendasi Urutan Kerja (Sprint W12.5 → W14)

**Hari 1 (Tier 1 backend)**:

- Plan 5 — PDF parser unpdf integration.
- Plan 4 setup — tulis `pre-generate-research-subtopics.ts` + jalankan (jalankan paralel di background, sleep 2s antar leaf, ≈ 1-2 jam total).

**Hari 2 (Tier 1 backend)**:

- Plan 1 — Filter propagation 16 endpoint activity.
- Smoke test paralel: buat 1 course Mode Umum + 1 Mode Penelitian, validasi filter via 3 skenario test.

**Hari 3 (Tier 1 frontend)**:

- Plan 2 — Navigation visibility + URL guard.
- Plan 3 — Audit log + footer indicator.
- Plan 6 — ParsonsProblem komponen.

**Hari 4 (Tier 1 content)**:

- Plan 7 — Content authoring 18 instansiasi (peneliti).
- Tulis 3 starter JSON ke `docs/examples/interactive-blocks/`.

**Hari 5 (Tier 1 review)**:

- Review batch konten subtopik di `/admin/sumber/cache-review` — approve / edit / regenerate.
- Smoke test end-to-end: 1 siswa-uji buat course Mode Penelitian → akses 1 leaf → submit komponen interaktif → AI sokratik muncul → ekspor data.

**Hari 6-7 (Tier 2 mulai)**:

- Plan 8 — IRR codebook (paralel dengan pilot prep).
- Plan 9 — Sampling + rater UI sederhana.
- Plan 10 — Admin authoring UI (kalau waktu).

**Hari 8-10 — Pilot W13**:

- 3 siswa pilot test, 1 minggu.
- Monitor `api_logs` 5xx rate.
- Tag `mvr-final` setelah pilot stable.

**Hari 11-14 (Tier 3 dokumentasi sidang)**:

- Tulis 6 dokumen pendukung paralel.
- Hitung kappa dari hasil IRR.
- Update CLAUDE.md + DATABASE_SCHEMA.md.

---

## 7. Update DoD Checklist (sisa)

Mengikuti Section 5 rencana awal, sisa yang harus dicentang sebelum sidang:

- [ ] Item 10 acceptance: `applyAdminModeFilter` di ≥10 endpoint admin (grep-able).
- [ ] Item 10 acceptance: 3 skenario test (a/b/c di Item 10) verifikasi pass.
- [ ] Item 10 acceptance: `api_logs` mencatat `admin_mode_switched`.
- [ ] 26 leaf-subtopik kanonik Mode Penelitian `qa_status='approved'`.
- [ ] Bank sumber: buku Mushthofa 2023 ter-upload dengan minimal 1 PDF (sebaiknya semua 4 course tercover dalam ≥10 chunk tervalidasi per template_topic).
- [ ] Komponen interaktif: minimal 18 dari 26 leaf punya block aktif.
- [ ] AI auto-trigger reflektif terbukti via 3 test (1 per komponen ringan).
- [ ] 3 siswa pilot test selesai minimal 1 course Mode Penelitian.
- [ ] Error 5xx Mode Penelitian < 1%.
- [ ] Ekspor data: ≥50 prompt + ≥10 artefak pseudocode + ≥30 artefak interaktif + ≥5 sesi + ≥80% prompt punya `cited_material_chunk_ids` non-empty.
- [ ] κ ≥ 0.70 dan Po ≥ 0.80 di sampel 25%.

---

## 8. Risiko Tersisa

| Risiko | Probabilitas | Mitigasi |
|---|---|---|
| Filter propagation 16 endpoint memperkenalkan regresi di Mode Umum | Sedang | Smoke test setiap endpoint via curl + dashboard di kedua mode sebelum commit |
| Pre-generate 26 leaf gagal sebagian (OpenAI 5xx/timeout) | Sedang | Script idempotent — re-run aman; retry per leaf dengan exponential backoff |
| Content authoring JSON 18 instansiasi memakan >1.5 hari | Sedang | Cukupkan dengan 12 instansiasi (kalau pendek), DoD 18/26 boleh longgar ke 12/26 (≥45%) — discuss dengan pembimbing |
| 3 siswa pilot tidak tersedia di W13 | Sedang | Konfirmasi peserta sekarang; siapkan honorarium kecil; backup: 2 siswa juga acceptable untuk pilot |
| IRR rater kedua belum dikontak | Tinggi (kalau belum) | Identifikasi & konfirmasi rater segera; codebook draft H1 |
| Sidang pertanyaan komponen kompleks "kenapa tidak ada FlowchartBuilder" | Rendah | Argumen: prioritisasi 3 komponen ringan + PseudocodeEditor untuk pilot pertama mengikuti rencana awal Section 6 "deferred to post-MVR" eksplisit |

---

## 9. Kesimpulan

Sisa eksekusi MVR terkonsentrasi di tiga area:

1. **Backend separasi mode admin** (Item 10.3-10.5) — kritikal untuk integritas data riset; ≈ 2.5 hari.
2. **Konten + komponen pilot-ready** (Item 4b pre-generate, Item 9.2 Parsons, Item 9.4 content) — kritikal untuk pilot W13; ≈ 3 hari.
3. **Dokumentasi sidang + IRR** (Tier 2-3) — kritikal untuk kelulusan tapi dapat dikerjakan paralel/setelah pilot; ≈ 4-5 hari.

**Total**: ≈ 9-11 hari kerja efektif (peneliti tunggal, asumsi 6 jam fokus/hari). Pilot W13 dapat dimulai paling cepat hari ke-5 jika Tier 1 selesai sesuai jadwal di Section 6.

Item 9.3 komponen kompleks (BugHunt + FlowchartBuilder + PseudocodeBlockBuilder) tidak masuk DoD pilot pertama — sesuai rencana awal Section 6, di-defer ke post-MVR / data collection round 2. Argumentasi sidang: pilot pertama menvalidasi mekanika dua-mode + Sokratik + RAG + 3 komponen interaktif; round 2 (post-pilot) menambah cakupan dimensi CT/CrT lewat 3 komponen kompleks.
