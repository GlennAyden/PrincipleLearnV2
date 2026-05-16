# Spesifikasi Komponen Interaktif Subtopik

Dokumen ini menetapkan kontrak teknis untuk 6 komponen interaktif yang dipasang di leaf-subtopik Mode Penelitian (Item 9 MVR), beserta skema JSON config, stream event interaksi, jalur submit ke `research_artifacts`, dan integrasi AI auto-trigger reflektif.

## 1. Tujuan

Sebelum Item 9, satu-satunya artefak pembelajaran yang ter-rekam untuk RM3 adalah pseudocode/algoritma teks yang ditulis siswa (artifact_type `pseudocode`/`algorithm`/`solution`). Ini menyebabkan dua masalah operasional: (a) banyak leaf yang membahas konsep — mis. tracing, percabangan, queue/stack — tidak menghasilkan artefak yang dapat di-coding karena interaksi siswanya tidak meninggalkan bekas struktural; (b) siswa pasif (membaca tanpa berinteraksi) menghasilkan zero evidence sehingga skoring kognitif default ke 0.

Komponen interaktif memaksa siswa **melakukan** alih-alih sekadar membaca: setiap aksi (klik, isi sel, drag-drop, edit baris) menjadi event yang ter-rekam, dan submit final menghasilkan satu baris `research_artifacts` ber-`mode='research'` yang segera dapat di-feed ke pipeline auto-coder dan ke dialog Sokratik reflektif.

## 2. Enam Komponen + Pemetaan Output RM3

Sumber kode: [`src/components/Interactive/`](../src/components/Interactive/) (TraceTable.tsx, OutputPredictor.tsx, ParsonsProblem.tsx, BugHunt.tsx, FlowchartBuilder.tsx, PseudocodeBlockBuilder.tsx). Renderer pusat: [`InteractiveBlockRenderer.tsx`](../src/components/Interactive/InteractiveBlockRenderer.tsx).

| # | Komponen | `type` di JSON | Aksi siswa | Output untuk RM3 |
|---|---|---|---|---|
| 1 | TraceTable | `trace_table` | Isi tabel langkah-per-langkah eksekusi pseudocode; validasi per sel | Bukti `ct_evaluation_debugging` + `ct_pattern_recognition` |
| 2 | OutputPredictor | `output_predictor` | Prediksi output dari pseudocode + input sebelum reveal | Bukti `cth_inference` + `ct_abstraction` |
| 3 | ParsonsProblem | `parsons` | Drag-drop baris pseudocode acak ke urutan benar | Bukti `ct_decomposition` + `ct_pattern_recognition` |
| 4 | BugHunt | `bug_hunt` | Identifikasi baris buggy + ketik perbaikan; AI evaluasi | Bukti `ct_evaluation_debugging` + `cth_analysis` |
| 5 | FlowchartBuilder | `flowchart_builder` | Bangun flowchart (node + edge) dari spec; pure SVG, tanpa reactflow | Bukti `ct_abstraction` + `cth_explanation` |
| 6 | PseudocodeBlockBuilder | `block_builder` | Drag-drop token blok pseudocode (IF/WHILE/dst) via `@dnd-kit` | Bukti `ct_algorithm_design` + `ct_decomposition` |

## 3. JSON Schema (TypeScript Type)

Sumber: [`src/types/interactive-blocks.ts`](../src/types/interactive-blocks.ts). Discriminated union via field `type`:

```ts
export type InteractiveBlock =
  | { type: 'trace_table';       config: TraceTableConfig }
  | { type: 'output_predictor';  config: OutputPredictorConfig }
  | { type: 'parsons';           config: ParsonsConfig }
  | { type: 'bug_hunt';          config: BugHuntConfig }
  | { type: 'flowchart_builder'; config: FlowchartBuilderConfig }
  | { type: 'block_builder';     config: BlockBuilderConfig };
```

Ringkasan config per tipe (definisi lengkap di file types):

- `TraceTableConfig` → `{ prompt, pseudocode, columns: TraceTableColumn[], expectedRows: TraceTableRowExpected[], rowLabelPrefix? }` dengan `expectedRows.values: Record<columnKey, expectedStringValue>` untuk shallow string compare per sel.
- `OutputPredictorConfig` → `{ prompt, pseudocode, inputs?, expectedOutput, acceptableVariants?, hintAfterFail? }`. Compare trimmed string.
- `ParsonsConfig` → `{ prompt, orderedLines: string[], distractors? }`. UI shuffle saat render; submit validasi urutan akhir = `orderedLines` & tidak ada distraktor.
- `BugHuntConfig` → `{ prompt, buggyLines: string[], bugLineIndex: number (1-indexed), expectedFix, fixAlternatives?, hint? }`.
- `FlowchartBuilderConfig` → `{ prompt, expectedNodes: FlowchartNodeSpec[], expectedEdges: {from,to,label?}[], paletteAllowed? }`. Tipe node yang didukung: `terminator | process | decision | io`.
- `BlockBuilderConfig` → `{ prompt, palette: string[], expectedTokens: string[] }`.

Tipe event interaksi seragam:

```ts
interface InteractionEvent { type: string; at: string /* ISO */; payload?: Record<string,unknown> | null }
```

## 4. Event Stream via `useInteractionTracking`

Hook: [`src/hooks/useInteractionTracking.ts`](../src/hooks/useInteractionTracking.ts). API: `{ track(type, payload?), getEvents(), reset(), eventCount }`. Tiap komponen memanggil `track('cell_filled' | 'block_dragged' | 'fix_typed' | …)` pada setiap aksi pengguna; event di-append ke ref array dengan timestamp ISO server-stable.

Catatan implementasi: hook **tidak** mem-flush otomatis — komponen yang memutuskan kapan submit (klik tombol "Submit", atau pada batas idle yang dikelola komponen). Ini disengaja agar kontrak hook tetap sederhana dan mudah di-unit-test; auto-flush 30 detik yang disebut di rencana MVR akhirnya dipindahkan menjadi tanggung jawab komponen (jika diperlukan), bukan hook.

## 5. Submit Endpoint → `research_artifacts`

Endpoint: [`src/app/api/research-artifacts/submit/route.ts`](../src/app/api/research-artifacts/submit/route.ts). Schema input via Zod `SubmitSchema`:

```ts
{
  courseId: uuid,
  subtopicId?: uuid,
  leafSubtopicId?: uuid,
  artifactType: 'pseudocode'|'flowchart'|'algorithm'|'solution'
              | 'trace_table'|'output_predictor'|'parsons'|'bug_hunt'
              | 'flowchart_builder'|'block_builder',
  artifactTitle?: string,
  artifactContent: string,
  relatedPromptIds?: uuid[],
  interactionEvents?: unknown[],
  completionStatus?: 'in_progress'|'submitted'|'abandoned',
  componentScore?: number(0..1),
}
```

Handler me-resolve `courseMode` via `getCourseMode(courseId)` (lihat [MODE_SYSTEM.md](MODE_SYSTEM.md)) lalu `resolveResearchLearningSession(...)` untuk mendapat `learningSessionId` + `dataCollectionWeek`. Insert ke `research_artifacts` membawa:

- `mode = courseMode` (sumber tetap konsisten dengan course-nya),
- `interaction_events JSONB` (full stream dari hook),
- `completion_status` + `component_score NUMERIC(3,2)`,
- `research_validity_status='valid'`, `coding_status='uncoded'`, `evidence_status='raw'`, `source_type='artifact'`,
- `artifact_metadata` membawa subtopic/leaf id + timestamp submit untuk join ke konteks.

Response: `{ artifactId, mode, learningSessionId }` yang dipakai komponen untuk men-trigger sidebar AskQuestion (Section 6).

## 6. AI Auto-Trigger Reflektif

Setelah `onSubmitted(artifactId, score)` dari komponen, UI subtopic page memanggil sidebar AskQuestion dengan payload tambahan `triggeredByArtifactId`. Endpoint [`/api/ask-question`] (yang diperluas pada Item 9 Foundation) men-fetch artifact ringkasan (event count, score, correctness), lalu menyuntikkannya ke system prompt baru (`src/services/prompts/socratic-post-interaction.ts`) dengan instruksi: "Siswa baru saja menyelesaikan {component_type} di leaf {leaf_title}. Hasilnya: {summary}. Ajukan SATU pertanyaan reflektif yang merujuk eksplisit ke hasil tersebut. Tier 1: diagnostik, jangan beri jawaban."

Tujuan klinis: dialog Sokratik tidak generik — ia *menyebut* apa yang baru saja siswa kerjakan ("Pada langkah kedua trace-mu, kamu menulis nilai i = 3. Bisa kamu jelaskan mengapa bukan 2?"). Ini meningkatkan signal kualitatif untuk RM2 (klasifikasi prompt siswa di balasannya) dan RM3 (artefak verbal teks reflektif).

## 7. Pemetaan Instansiasi (DB Snapshot)

Sumber: query DB Supabase project `wesgoqdldgjbwgmubfdm` per 2026-05-16 (`SELECT … FROM leaf_subtopics l JOIN courses c ON c.id=l.course_id WHERE jsonb_array_length(l.interactive_blocks)>0 …`). Hasil: **18 instansiasi tersebar di 17 leaf** dari total 26 leaf kanonik. Pemetaan:

| Course | Leaf | Tipe Komponen |
|---|---|---|
| `mengenal-algoritma` | 1.4 Menelusuri Diagram Alir | `trace_table` |
| `mengenal-algoritma` | 1.5 Pseudokode: Konvensi & Contoh | `parsons` |
| `mengenal-algoritma` | 1.6 Menelusuri Pseudokode | `trace_table` |
| `struktur-kendali` | 2.3 Operator … | `output_predictor` |
| `struktur-kendali` | 2.4 Percabangan If-Else | `output_predictor` |
| `struktur-kendali` | 2.5 Percabangan Switch-Case | `parsons` |
| `struktur-kendali` | 2.6 Percabangan Bersarang | `trace_table` |
| `struktur-kendali` | 2.7 Perulangan For-Loop | `trace_table` + `output_predictor` (2 blok) |
| `struktur-kendali` | 2.8 Perulangan While | `trace_table` |
| `struktur-kendali` | 2.9 Perulangan Do-While | `output_predictor` |
| `struktur-kendali` | 2.10 Perulangan Bersarang & Tak Terbatas | `trace_table` |
| `struktur-kendali` | 2.11 Fungsi: Membuat & Memanggil | `output_predictor` |
| `memilih-algoritma` | 3.2 Sorting: Pengantar | `output_predictor` |
| `memilih-algoritma` | 3.3 Bubble Sort | `trace_table` |
| `memilih-algoritma` | 3.4 Insertion Sort | `trace_table` |
| `memilih-algoritma` | 3.5 Selection Sort | `trace_table` |
| `struktur-data` | 4.2 Antrean (Queue) | `output_predictor` |
| `struktur-data` | 4.3 Tumpukan (Stack) | `output_predictor` |

Catatan operasional: 3 tipe komponen (`bug_hunt`, `flowchart_builder`, `block_builder`) sudah ter-implementasi di codebase ([`src/components/Interactive/BugHunt.tsx`](../src/components/Interactive/BugHunt.tsx), [`FlowchartBuilder.tsx`](../src/components/Interactive/FlowchartBuilder.tsx), [`PseudocodeBlockBuilder.tsx`](../src/components/Interactive/PseudocodeBlockBuilder.tsx)) tetapi **belum di-instansiasi di DB pada saat dokumen ini ditulis**. Pemetaan akhir 22-instansiasi yang direncanakan di [`rencana-eksekusi-mvr.md`](../rencana-eksekusi-mvr.md) Item 9 (termasuk BugHunt di 2.10 & 2.12, FlowchartBuilder di 1.2/1.3/2.4, PseudocodeBlockBuilder di 2.11) menunggu authoring konten oleh peneliti via tooling JSON editor.

## 8. Authoring Workflow

Peneliti mengedit `leaf_subtopics.interactive_blocks` (JSONB) via halaman admin `/admin/sumber/interactive-blocks` (research-only, lihat [MODE_SYSTEM.md](MODE_SYSTEM.md)). Tooling menampilkan editor JSON di kiri + preview live komponen di kanan. Validasi schema Zod (mengikuti tipe di [`src/types/interactive-blocks.ts`](../src/types/interactive-blocks.ts)) berjalan saat save — JSON invalid ditolak sebelum disimpan ke DB.

Tiga starter JSON terkurasi tersedia sebagai referensi di [`docs/examples/interactive-blocks/`](examples/interactive-blocks/):

- `trace_table.example.json`
- `output_predictor.example.json`
- `parsons.example.json`

Peneliti dapat menyalin starter ke editor, mengganti `prompt` + `pseudocode` + `expectedRows`, lalu save tanpa harus menulis JSON dari nol.

## Catatan untuk Reviewer Sidang

Dua keputusan minimal-acceptable yang patut diadvokasi pada pilot pertama: (a) FlowchartBuilder di-implementasi sebagai **pure SVG tanpa reactflow** untuk menghindari dependency 100KB+; konsekuensinya skor validasi memakai pendekatan count-based + label-matching (jumlah node per tipe + jumlah edge yang match topologi yang diharapkan) alih-alih graph isomorphism penuh — cukup untuk menilai apakah siswa memilih konstruksi yang benar, tetapi tidak menangkap pengurutan node yang aesthetic. (b) BugHunt mengandalkan exact-string compare untuk `expectedFix` + array `fixAlternatives`, bukan AI evaluator — keputusan ini menukar fleksibilitas dengan determinisme nilai. Untuk skenario "fix berupa kalimat bebas" yang lebih kaya, evaluasi dapat dialihkan ke endpoint `/api/challenge-feedback` di iterasi berikutnya. Status operasional saat dokumen ini ditulis: 18 instansiasi (terverifikasi via DB), authoring 4 instansiasi tambahan untuk mencapai target ≈22 berlangsung di Sprint W11 sesuai timeline MVR.
