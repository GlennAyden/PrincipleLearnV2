# Analisis Kelengkapan Admin untuk Data RM2 dan RM3

Dokumen ini merangkum analisis kebutuhan pengembangan admin page PrincipleLearn agar data untuk RM2 dan RM3 tesis dapat dikumpulkan, dibaca, ditelusuri ulang, dan diekspor dengan jelas. Fokus utamanya adalah kelengkapan pengambilan data dan kejelasan tampilan data pada sisi admin.

## Ringkasan Eksekutif

Admin saat ini sudah memiliki fondasi yang cukup kuat untuk RM2 dan RM3:

- `/admin/dashboard` menampilkan ringkasan RM2 dan RM3.
- `/admin/aktivitas` menampilkan log tanya jawab, tantangan, kuis, refleksi, dan diskusi.
- `/admin/siswa/[id]` sudah memiliki tab evolusi prompt dan kognitif per siswa.
- `/admin/riset`, `/admin/riset/prompt`, dan `/admin/riset/kognitif` sudah mengarah ke kebutuhan penelitian.
- Data otomatis sudah mulai dikumpulkan melalui `ask_question_history` dan `auto_cognitive_scores`.
- Skema riset dalam `docs/sql/create_research_tables.sql` sudah memuat tabel penting seperti `learning_sessions`, `prompt_classifications`, `cognitive_indicators`, `research_artifacts`, `triangulation_records`, dan `inter_rater_reliability`.

Namun, untuk kebutuhan tesis, admin masih perlu dilengkapi pada empat hal besar:

1. Data longitudinal RM2 harus menjadi timeline perkembangan per siswa dan per sesi, bukan hanya distribusi stage.
2. RM3 harus menampilkan bukti indikator CT dan Critical Thinking per unit prompt/stage, bukan hanya skor rata-rata.
3. Triangulasi lintas sumber harus punya halaman kerja sendiri: prompt log, artefak solusi, observasi, wawancara, dan keputusan peneliti.
4. Beberapa kontrak UI/API perlu dirapikan karena ada mismatch yang berisiko membuat input atau export riset tidak berjalan sesuai rancangan.

Tujuan ideal admin adalah: admin dapat menjawab "siapa bertanya apa, pada sesi berapa, prompt-nya berada di tahap apa, indikator berpikir apa yang muncul, bukti apa yang mendukung, dan bagaimana lintas sesi perkembangannya".

## Sumber Rujukan Analisis

### PDF Tesis

Rujukan utama dari `C:/Users/king/Downloads/main.pdf`:

- Bab 1, Rumusan Masalah: RM2 membahas tahapan perkembangan struktur prompt; RM3 membahas manifestasi Computational Thinking dan Critical Thinking pada tiap tahapan prompt.
- Bab 3, Tabel 15 sekitar p. 54: pemetaan RM, data, instrumen, dan teknik analisis.
- Bab 3.4.3 sekitar p. 68-74: pemetaan coding prompt, indikator kognitif, dan kualitas analisis.
- Tabel 24 sekitar p. 72: indikator Critical Thinking.
- Tabel 25 sekitar p. 73: indikator Computational Thinking.
- Bagian kualitas coding sekitar p. 73-74: double coding minimal 25%, kappa >= 0.70, agreement >= 0.80, dan audit trail.
- Tabel 41 sekitar p. 92: pola perkembangan lintasan prompt.
- Tabel 42 sekitar p. 93: hubungan kategori prompt dengan indikator berpikir.
- Tabel 47 sekitar p. 100: model tahap perkembangan prompt.

### Diagram RM2

Diagram RM2 menegaskan bahwa admin harus membaca perkembangan struktur prompt siswa SMA secara longitudinal antar sesi. Kategori utama:

- SCP: prompt tunggal-sederhana.
- SRP: reformulasi prompt.
- MQP: pertanyaan berlapis dan iteratif.
- Reflektif: evaluasi, justifikasi, dan kontrol metakognitif.

Data dan instrumen yang harus terlihat:

- Perekaman log multi-sesi.
- Observasi naturalistik.
- Wawancara semiterstruktur berbasis pola kasus.
- Sistem digital logging.
- Logbook observasi.
- Rubrik strategi prompting SCP-SRP-MQP-reflektif.
- Analisis longitudinal per sesi dan per partisipan pada level mikro, meso, dan makro.
- Output berupa peta lintasan perkembangan, termasuk pola naik, stagnan, fluktuatif, dan anomali.

### Diagram RM3

Diagram RM3 menegaskan bahwa admin harus mengaitkan tiap tahap prompt dengan manifestasi indikator Computational Thinking dan Critical Thinking.

Indikator Computational Thinking:

- Dekomposisi.
- Pengenalan pola.
- Abstraksi.
- Perancangan algoritma.
- Evaluasi dan debugging.
- Generalisasi solusi.

Indikator Critical Thinking:

- Interpretasi masalah.
- Analisis argumen.
- Evaluasi bukti/solusi.
- Inferensi.
- Eksplanasi keputusan.
- Regulasi diri.

Sumber data RM3:

- Unit prompt terkode.
- Artefak solusi.
- Narasi klarifikasi dari wawancara.

Instrumen RM3:

- Crosswalk operasional RM3.
- Lembar analisis artefak.
- Matriks indikator CT.
- Matriks indikator Critical Thinking.

Output yang diharapkan:

- Triangulasi lintas sumber.
- Profil manifestasi CT dan Critical Thinking pada setiap tahap prompt.

## Status Admin Saat Ini

### `/admin/dashboard`

Yang sudah ada:

- KPI umum: siswa aktif, total kursus, akurasi kuis, diskusi, jurnal, tantangan, pertanyaan, transkrip, feedback, dan profil belajar.
- Ringkasan RM2: distribusi tahap prompt.
- Ringkasan RM3: skor CT/Critical Thinking jika tabel riset tersedia, atau fallback dari data lain.
- Recent activity feed.

Catatan gap:

- Belum ada narasi longitudinal yang menjawab "perkembangan antar sesi".
- Belum ada transition matrix SCP -> SRP -> MQP -> Reflektif.
- Belum ada data readiness: berapa persen prompt sudah dikode, berapa sesi valid, berapa data observasi/wawancara/artefak sudah terhubung.
- Ada state `system` di kode, tetapi tab navigasi saat ini hanya `overview`, sehingga health tab tidak benar-benar mudah diakses dari UI.

### `/admin/aktivitas`

Yang sudah ada:

- Tab ask, challenge, quiz, refleksi, dan diskusi.
- Filter user, course, tanggal.
- Detail log dan raw JSON.
- Log ask sudah memuat question, answer, reasoning note, prompt stage, dan prompt components.
- Diskusi memuat transkrip, tujuan pembelajaran, assessment, dan monitoring cepat.

Catatan gap:

- Belum ada binding yang konsisten antara semua aktivitas dengan `learning_session_id`.
- Challenge, quiz, jurnal, dan diskusi belum semuanya masuk ke struktur unit riset yang sama.
- Belum ada tab observasi, wawancara, dan artefak solusi.
- Raw log sudah berguna, tetapi belum diangkat menjadi evidence panel untuk RM2/RM3.

### `/admin/siswa/[id]`

Yang sudah ada:

- Statistik per siswa.
- Tab Evolusi Prompt.
- Tab Kognitif.
- Breakdown 12 indikator dari `auto_cognitive_scores`.
- Korelasi prompt stage dengan CT/Critical Thinking.

Catatan gap:

- `promptStage` pada detail siswa masih bisa berbasis heuristik jumlah interaksi, bukan hasil klasifikasi riset terbaru.
- Evolusi prompt belum menampilkan stage transition antar prompt dan antar sesi.
- Belum ada status lintasan: naik, stagnan, fluktuatif, anomali.
- Belum ada evidence list yang memasangkan prompt, artefak, wawancara, dan catatan observasi untuk siswa tersebut.

### `/admin/riset`

Yang sudah ada:

- KPI riset: total sesi, total klasifikasi, total indikator, total siswa.
- Distribusi tahap prompt.
- Heatmap tahap dan progression.
- Inter-rater reliability.

Catatan gap:

- Heatmap dan progression masih ringkas; belum cukup untuk argumentasi RM2 secara longitudinal.
- Perlu data coverage: raw units, classified units, unclassified units, units with cognitive score, units with artifact, units with triangulation.
- `user_progression` di API masih memiliki `ct_progression` dan `cth_progression` kosong pada beberapa jalur.

### `/admin/riset/prompt`

Yang sudah ada:

- UI untuk learning sessions.
- UI untuk prompt classifications.
- Stage, micro markers, cognitive depth, confidence, dan rationale.

Catatan gap teknis penting:

- Form classification di UI menggunakan field seperti `session_id`, `prompt_text`, `prompt_sequence`, `prompt_stage`, `micro_markers`, `cognitive_depth_level`, `classification_rationale`, tetapi API `POST /api/admin/research/classifications` membutuhkan `prompt_source`, `prompt_id`, `user_id`, `course_id`, `prompt_text`, `prompt_stage`, dan `classified_by`.
- UI `PUT` untuk sessions/classifications mengirim `id` lewat query string, sedangkan API membaca `id` dari body.
- `micro_markers` di DDL berupa `TEXT[]`, tetapi sebagian route menyimpan `JSON.stringify(...)`. Ini perlu distandarkan.
- Halaman belum menyediakan picker dari raw prompt log, sehingga admin sulit memilih unit prompt asli dan mengklasifikasikannya tanpa menyalin manual.

### `/admin/riset/kognitif`

Yang sudah ada:

- UI penilaian Computational Thinking dan Critical Thinking.
- Input indikator 0, 1, 2.
- Matrix indikator, auto-score, follow-up comparison, dan stage correlation.

Catatan gap teknis penting:

- Form UI menggunakan `classification_id`, `indicator_type`, `ct_indicators`, `critical_indicators`, dan `evidence_notes`.
- API `POST /api/admin/research/indicators` membutuhkan `prompt_classification_id`, `prompt_id`, `user_id`, field indikator yang flattened seperti `ct_decomposition`, serta `assessed_by`.
- UI `PUT` mengirim id lewat query string, tetapi API membaca id dari body.
- Saat ini satu assessment UI memisahkan CT dan Critical Thinking lewat `indicator_type`, sementara tabel `cognitive_indicators` menyimpan keduanya dalam satu row. Ini harus dipilih: satu row lengkap 6+6, atau dua assessment terpisah dengan skema baru.

### `/admin/ekspor`

Yang sudah ada:

- Kartu export users, activity, sessions RM2, classifications RM2, indicators RM3, full data, dan SPSS.

Catatan gap teknis penting:

- UI membangun query `type=...`, sedangkan API `GET /api/admin/research/export` membaca `data_type`.
- UI memakai nilai `full` dan `spss`, sedangkan API menerima `sessions`, `classifications`, `indicators`, `longitudinal`, `all`; SPSS dibaca dari parameter `spss=true`.
- UI mengirim `start_date` dan `end_date`, tetapi API export saat ini belum menerapkan filter tanggal tersebut.
- Akibatnya, export RM2/RM3 berisiko tidak menghasilkan dataset yang sesuai kebutuhan tesis.

## Matriks Coverage RM2

| Kebutuhan RM2 | Status saat ini | Gap utama | Prioritas |
| --- | --- | --- | --- |
| Log prompt multi-sesi | Ada di `ask_question_history`, sebagian data diskusi/challenge/quiz terpisah | Belum semua sumber punya `learning_session_id` dan sequence yang konsisten | P0 |
| Kategori SCP/SRP/MQP/Reflektif | Ada di `ask_question_history.prompt_stage`, `prompt_classifications`, dan `prompt-classifier.ts` | Label belum konsisten: `Reflective`, `REFLECTIVE`, `Reflektif`; manual UI/API belum sinkron | P0 |
| Micro markers GCP/PP/ARP | Ada konsep di `src/types/research.ts` dan classifier | Format penyimpanan belum konsisten, belum ada coverage view | P0 |
| Rubrik strategi prompting | Ada label/deskripsi di type dan UI guide | Belum ada rubric trace per coding decision | P1 |
| Analisis longitudinal per sesi | Ada `learning_sessions` dan endpoint evolusi siswa | Belum ada transition matrix, status lintasan, dan timeline stage antar sesi | P1 |
| Pola naik/stagnan/fluktuatif/anomali | Ada `transition_status` di tipe/DDL | Belum dihitung dan ditampilkan secara kuat di admin | P1 |
| Observasi naturalistik | Belum ada UI khusus | Perlu tabel/API/halaman logbook observasi | P2 |
| Wawancara semiterstruktur | Belum ada UI khusus | Perlu data excerpt, key case, dan linking ke session/user | P2 |
| Export RM2 | Ada `/admin/ekspor` dan route export | Kontrak query mismatch; belum ada export codebook-ready | P0 |

## Matriks Coverage RM3

| Kebutuhan RM3 | Status saat ini | Gap utama | Prioritas |
| --- | --- | --- | --- |
| Unit prompt terkode | Ada `prompt_classifications` dan auto stage di ask log | Belum ada unified research unit untuk semua sumber | P0 |
| CT 6 indikator | Ada di `cognitive_indicators` dan `auto_cognitive_scores` | UI manual belum sinkron dengan API; evidence per indikator belum kuat | P0 |
| Critical Thinking 6 indikator | Ada di `cognitive_indicators` dan `auto_cognitive_scores` | Sama seperti CT: perlu evidence snippet dan rubric trace | P0 |
| Crosswalk RM3 | Ada konsep pada tesis dan tipe data | Belum ada UI matrix crosswalk prompt stage x CT x Critical Thinking | P1 |
| Artefak solusi | Ada DDL `research_artifacts` | Belum ada API/UI aktif untuk upload/input/assessment artefak | P2 |
| Narasi klarifikasi wawancara | Belum ada UI khusus | Perlu interview excerpt dan case tagging | P2 |
| Triangulasi lintas sumber | Ada DDL/type `triangulation_records` | Belum ada halaman kerja triangulasi dan evidence convergence | P1 |
| Inter-rater reliability | Ada `inter_rater_reliability` dan ringkasan di `/admin/riset` | Belum ada workflow double coding, disagreement, dan codebook revision | P2 |
| Export RM3 | Ada route export | Query mismatch dan belum mencakup artifact/interview/triangulation | P0 |

## Rekomendasi Struktur Admin yang Dibutuhkan

### 1. Data Readiness Dashboard

Tambahkan ringkasan kesiapan data di `/admin/riset`:

- Total raw units.
- Total units classified RM2.
- Total units scored RM3.
- Total sessions valid for analysis.
- Missing session binding.
- Missing cognitive score.
- Missing evidence text.
- Missing artifact/interview/observation triangulation.
- Inter-rater sample progress: target 25%, coded count, agreement, kappa.

Nilai tesisnya: admin bisa tahu apakah data sudah layak dianalisis atau masih bolong.

### 2. RM2 Prompt Journey Lab

Halaman ini bisa menjadi pengembangan dari `/admin/riset/prompt`:

- Timeline per siswa: sesi 1, sesi 2, sesi 3, dan seterusnya.
- Prompt sequence dalam tiap sesi.
- Stage badge SCP/SRP/MQP/Reflektif per prompt.
- Micro markers GCP/PP/ARP per prompt.
- Transition matrix antar sesi.
- Status lintasan: naik, stagnan, fluktuatif, anomali.
- Daftar siswa stagnan/anomali untuk follow-up.
- Detail rationale klasifikasi dan evidence prompt.

Output yang harus bisa dibaca:

- "Siswa A bergerak dari SCP ke SRP pada sesi 2, lalu MQP pada sesi 4."
- "Siswa B aktif bertanya tetapi stagnan di SCP selama 3 sesi."
- "Siswa C fluktuatif: MQP turun ke SCP setelah topik tertentu."

### 3. RM3 Cognitive Evidence Matrix

Halaman ini bisa menjadi pengembangan dari `/admin/riset/kognitif`:

- Matrix stage prompt x indikator CT.
- Matrix stage prompt x indikator Critical Thinking.
- Drill-down cell: prompt text, source, AI response, artifact, evidence snippet, score, confidence, assessor.
- Filter per siswa, sesi, sumber data, stage, indikator.
- Mode cohort dan mode individual.
- Highlight indikator yang jarang muncul.

Output yang harus bisa dibaca:

- "Pada tahap MQP, dekomposisi dan desain algoritma mulai muncul, tetapi regulasi diri belum kuat."
- "Prompt reflektif berkorelasi dengan evaluasi/debugging dan eksplanasi keputusan."

### 4. Evidence Bank dan Triangulation Panel

Tambahkan halaman baru, misalnya `/admin/riset/triangulasi`:

- Evidence Bank: kumpulan prompt log, artefak, observasi, wawancara, jurnal, dan diskusi.
- Triangulation Panel per siswa/sesi/finding.
- Status sumber bukti: supports, neutral, contradicts.
- Convergence status: convergen, partial, contradictory.
- Final decision dan decision rationale.
- Mark key case untuk wawancara berbasis pola kasus.

Output yang harus bisa dibaca:

- "Kenaikan SRP -> MQP didukung oleh log prompt dan artefak, tetapi belum didukung wawancara."
- "Indikator self-regulation muncul di jurnal, bukan di prompt log."

### 5. Coder Audit dan Reliability Workflow

Tambahkan halaman atau section:

- Assignment coding untuk researcher_1 dan researcher_2.
- Sample 25% unit data.
- Agreement per coding type.
- Kappa prompt stage dan kappa indikator.
- Disagreement list.
- Resolution note dan codebook revision.

Nilai tesisnya: memenuhi audit trail dan trustworthiness data.

### 6. Dataset Builder dan Export Fix

Perbaiki `/admin/ekspor` agar menjadi dataset builder:

- Export RM2 longitudinal.
- Export RM3 indicator matrix.
- Export raw units.
- Export triangulation.
- Export SPSS-ready.
- Export anonymized.
- Sertakan codebook kolom.

Minimal perbaikan teknis:

- Ganti `type` menjadi `data_type` pada URL export.
- Untuk SPSS gunakan `spss=true`.
- `full` harus dipetakan ke `all`.
- Terapkan filter tanggal di API export.

## Rekomendasi Data Model

### 1. Unified Research Unit

Buat satu lapisan penyatuan data, bisa berupa tabel atau view `research_units`.

Field yang disarankan:

- `id`
- `source_type`: ask_question, challenge_response, quiz_submission, journal, discussion, artifact, interview, observation
- `source_id`
- `user_id`
- `course_id`
- `learning_session_id`
- `module_index`
- `subtopic_index`
- `unit_sequence`
- `unit_text`
- `ai_response`
- `context_summary`
- `created_at`
- `is_valid_for_analysis`
- `validity_note`

Manfaatnya: RM2/RM3 tidak perlu menarik data dari banyak tabel dengan bentuk berbeda.

### 2. Learning Session Resolver

Tambahkan service untuk memastikan semua event riset punya session:

- Resolve session berdasarkan user, course, tanggal, session number, atau gap waktu.
- Auto-create `learning_sessions` jika belum ada.
- Simpan `learning_session_id` ke raw event.
- Hitung ulang metric sesi setelah event baru masuk.

Target file:

- `src/services/research-session.service.ts`
- `src/app/api/ask-question/route.ts`
- `src/app/api/challenge-response/route.ts`
- `src/app/api/quiz/submit/route.ts`
- `src/app/api/jurnal/save/route.ts`
- `src/app/api/discussion/respond/route.ts`

### 3. Standardisasi Stage dan Marker

Standarkan stage:

- `SCP`
- `SRP`
- `MQP`
- `REFLECTIVE`

Label tampilan boleh "Reflektif", tetapi nilai data harus satu bentuk.

Standarkan marker:

- `GCP`
- `PP`
- `ARP`

Pilih satu format penyimpanan:

- `TEXT[]` jika mengikuti DDL saat ini.
- Atau `JSONB` jika ingin menyimpan confidence/evidence per marker.

Jangan campur `TEXT[]` dengan JSON string.

### 4. Evidence Per Indicator

`cognitive_indicators` saat ini punya `evidence_text` dan `indicator_notes`. Untuk tesis, lebih kuat jika evidence bisa per indikator:

```json
{
  "ct_decomposition": {
    "score": 2,
    "evidence": "cuplikan prompt/artefak",
    "rationale": "alasan coding"
  },
  "cth_self_regulation": {
    "score": 1,
    "evidence": "cuplikan jurnal/wawancara",
    "rationale": "alasan coding"
  }
}
```

Ini bisa menjadi kolom `indicator_evidence JSONB`.

### 5. Observation, Interview, dan Artifact

Tambahkan API/UI untuk:

- `research_artifacts`: input/upload artefak solusi dan penilaian kualitas artefak.
- `observation_logs`: catatan observasi naturalistik per sesi.
- `interview_excerpts`: kutipan wawancara per siswa/sesi/finding.
- `triangulation_records`: keputusan triangulasi lintas sumber.

## Temuan Teknis yang Perlu Diprioritaskan

### P0: Sinkronkan UI dan API Riset

Perbaiki kontrak berikut:

- `/admin/riset/prompt` classification form harus mengirim `prompt_source`, `prompt_id`, `user_id`, `course_id`, `learning_session_id`, `prompt_text`, `prompt_sequence`, `prompt_stage`, `micro_markers`, `primary_marker`, `classified_by`, `classification_method`, `confidence_score`, `classification_evidence`.
- API classifications sebaiknya menerima id dari query string atau UI harus mengirim id di body saat PUT.
- `/admin/riset/kognitif` harus mengirim bentuk data sesuai `cognitive_indicators`, atau API harus menyediakan adapter dari form `indicator_type`.
- API indicators sebaiknya menerima id dari query string atau UI harus mengirim id di body saat PUT.
- `/admin/ekspor` harus memakai parameter yang sesuai API: `data_type`, `spss=true`, dan nilai `all`.

### P0: Perbaiki Jalur Export

Export adalah bukti data tesis. Jika export salah, analisis lanjutan ikut rapuh.

Minimal dataset yang harus bisa diekspor:

- RM2 longitudinal per siswa per sesi.
- RM2 prompt classifications per unit prompt.
- RM3 indicators per unit prompt.
- Auto scores dan manual scores.
- Raw prompt log dan AI response.
- Artifact/interview/observation/triangulation ketika sudah dibuat.
- Codebook kolom.
- Anonymized participant ID.

### P0: Standarkan Sumber Data Manual dan Otomatis

Saat ini ada dua jalur:

- Otomatis: `ask_question_history.prompt_stage`, `auto_cognitive_scores`.
- Manual/riset: `prompt_classifications`, `cognitive_indicators`.

Keduanya perlu ditampilkan berdampingan:

- Auto label sebagai "suggestion".
- Manual label sebagai "final research code".
- Jika berbeda, tampilkan conflict flag.
- Simpan siapa yang membuat keputusan final.

### P0: Review Query dan Route Analitik yang Berisiko Salah Hitung

Beberapa route perlu dicek sebelum hasilnya dipakai sebagai dasar klaim tesis:

- `src/app/api/admin/research/analytics/route.ts` membangun `indicatorMap` berbasis `prompt_classification_id`, tetapi query `classWithIndicators` hanya memilih `prompt_stage, learning_session_id` dan tidak memilih `id`. Akibatnya avg CT/CTH pada heatmap stage berisiko tetap 0 karena join in-memory tidak menemukan classification id.
- `src/app/api/admin/research/bulk/route.ts` memfilter `ask_question_history.prompt_classification_id`, tetapi SQL yang tersedia hanya menambah `learning_session_id`, `is_follow_up`, `follow_up_of`, dan `response_time_ms` pada `ask_question_history`. Jika kolom itu tidak ada di database, bulk classify akan gagal.
- Route bulk classify juga memasukkan `prompt_classifications` tanpa `prompt_stage_score`, padahal DDL menjadikannya `NOT NULL`. Jika tidak ada default/trigger di database, insert akan gagal.
- `src/services/prompt-classifier.ts` mengembalikan stage `Reflective`, sedangkan tipe riset memakai `REFLECTIVE`. Ini harus dinormalisasi sebelum masuk database atau dashboard.
- `/api/admin/dashboard` memetakan stage riset menjadi `Reflektif`, sementara sebagian frontend memakai konfigurasi `REFLECTIVE`. Ini membuat warna/label dan agregasi bisa tidak konsisten.

Rekomendasi: sebelum memperluas fitur, buat satu `research-normalizers.ts` yang memusatkan normalisasi stage, marker, source type, dan conversion auto/manual agar semua route memakai kontrak yang sama.

### P1: Buat Transition Analytics RM2

Tambahkan output dari `/api/admin/research/analytics`:

- `transition_matrix`
- `trajectory_by_user`
- `trajectory_status_counts`
- `avg_sessions_to_next_stage`
- `stagnant_students`
- `anomaly_students`

### P1: Buat Evidence Matrix RM3

Tambahkan output:

- `indicator_by_stage`
- `indicator_by_source`
- `indicator_by_session`
- `missing_indicator_evidence`
- `low_confidence_scores`
- `stage_cognitive_correlation`

### P1: Triangulation Workflow

Implementasi minimal:

- API CRUD `triangulation_records`.
- UI list finding per siswa/sesi.
- Evidence slots: log, observation, artifact, interview.
- Status: supports, neutral, contradicts.
- Convergence: convergen, partial, contradictory.

### P2: Reliability Workflow

Implementasi minimal:

- Assign 25% unit untuk double coding.
- Record researcher_1 dan researcher_2.
- Agreement and kappa calculator.
- Disagreement resolution note.
- Codebook revision note.

## Backlog Development yang Disarankan

### Sprint 1: Data Contract Repair

Tujuan: semua fitur admin riset yang sudah ada bisa menyimpan dan export data dengan benar.

Item:

- Fix payload `/admin/riset/prompt` <-> `/api/admin/research/classifications`.
- Fix payload `/admin/riset/kognitif` <-> `/api/admin/research/indicators`.
- Fix PUT id handling pada sessions, classifications, indicators.
- Fix `/admin/ekspor` query params.
- Standarkan stage `REFLECTIVE`.
- Standarkan `micro_markers`.
- Tambahkan test API untuk create/update classifications dan indicators.

Acceptance criteria:

- Admin bisa membuat session.
- Admin bisa memilih raw prompt dan menyimpan klasifikasi RM2.
- Admin bisa menyimpan skor RM3 6+6 indikator.
- Export `sessions`, `classifications`, `indicators`, `longitudinal`, dan `all` berjalan.

### Sprint 2: RM2 Longitudinal Dashboard

Tujuan: RM2 dapat dijawab dari admin.

Item:

- Tambah transition matrix.
- Tambah trajectory per siswa.
- Tambah status naik/stagnan/fluktuatif/anomali.
- Tambah drill-down per sesi.
- Tambah daftar kasus untuk follow-up wawancara.

Acceptance criteria:

- Untuk setiap siswa, admin bisa melihat urutan stage per sesi.
- Admin bisa melihat alasan sebuah siswa masuk stagnan/fluktuatif/anomali.
- Setiap ringkasan bisa ditelusuri ke raw prompt.

### Sprint 3: RM3 Evidence Matrix

Tujuan: RM3 dapat dijawab dari admin.

Item:

- Matrix stage x indikator CT.
- Matrix stage x indikator Critical Thinking.
- Evidence snippet per indikator.
- Manual vs auto score comparison.
- Filter per source: prompt, challenge, quiz, journal, discussion.

Acceptance criteria:

- Setiap skor indikator bisa ditelusuri ke bukti teks.
- Admin bisa melihat indikator mana yang muncul pada tiap tahap prompt.
- Admin bisa melihat gap indikator per siswa dan cohort.

### Sprint 4: Triangulasi dan Artefak

Tujuan: bukti RM3 tidak bergantung pada prompt saja.

Item:

- CRUD artefak solusi.
- CRUD observasi.
- CRUD interview excerpt.
- Triangulation panel.
- Convergence status.

Acceptance criteria:

- Satu finding bisa punya bukti log, artefak, observasi, dan wawancara.
- Admin bisa menandai sumber mendukung, netral, atau bertentangan.
- Export menyertakan hasil triangulasi.

### Sprint 5: Reliability dan Audit Trail

Tujuan: kualitas coding tesis bisa dipertanggungjawabkan.

Item:

- Double coding sample manager.
- Agreement/kappa calculator.
- Disagreement resolution.
- Codebook revision log.
- Audit trail per coded unit.

Acceptance criteria:

- Admin bisa menunjukkan 25% unit sudah double-coded.
- Kappa dan agreement bisa ditampilkan per coding type.
- Perubahan keputusan coding bisa ditelusuri.

## Rekomendasi File dan Modul

File yang perlu disentuh atau dikembangkan:

- `src/types/research.ts`: standarisasi tipe dan tambah tipe observation/interview/evidence.
- `src/services/prompt-classifier.ts`: standarkan output stage ke `REFLECTIVE`, tambah evidence-aware result.
- `src/services/cognitive-scoring.service.ts`: simpan evidence per indikator bila memungkinkan.
- `src/app/api/admin/research/analytics/route.ts`: tambah transition dan evidence metrics.
- `src/app/api/admin/siswa/[id]/evolusi/route.ts`: tambah stage transition dan session trajectory.
- `src/app/api/admin/research/classifications/route.ts`: sinkronkan kontrak dengan UI dan raw prompt picker.
- `src/app/api/admin/research/indicators/route.ts`: sinkronkan kontrak dengan UI matrix.
- `src/app/api/admin/research/export/route.ts`: perbaiki params, date filters, SPSS, codebook.
- `src/app/admin/riset/prompt/page.tsx`: ubah dari CRUD manual menjadi prompt coding workspace.
- `src/app/admin/riset/kognitif/page.tsx`: ubah menjadi evidence matrix workspace.
- `src/app/admin/ekspor/page.tsx`: ubah menjadi dataset builder.

Komponen baru yang disarankan:

- `src/components/admin/SessionTimeline.tsx`
- `src/components/admin/StageTransitionMatrix.tsx`
- `src/components/admin/CognitiveEvidenceMatrix.tsx`
- `src/components/admin/TriangulationPanel.tsx`
- `src/components/admin/RubricTrace.tsx`
- `src/components/admin/DataReadinessCard.tsx`
- `src/components/admin/CoderReliabilityPanel.tsx`

API baru yang disarankan:

- `GET /api/admin/research/units`
- `POST /api/admin/research/units/resolve-session`
- `GET /api/admin/research/trajectories`
- `GET /api/admin/research/evidence-matrix`
- `GET/POST/PUT/DELETE /api/admin/research/artifacts`
- `GET/POST/PUT/DELETE /api/admin/research/observations`
- `GET/POST/PUT/DELETE /api/admin/research/interviews`
- `GET/POST/PUT/DELETE /api/admin/research/triangulation`
- `GET/POST/PUT /api/admin/research/reliability`

## Bentuk Tampilan Data yang Disarankan

### Tampilan RM2: Per Siswa

Minimal:

- Header siswa anonim.
- Ringkasan jumlah sesi, jumlah prompt, stage terakhir, stage dominan.
- Timeline session cards.
- Di tiap session: jumlah prompt, distribusi stage, stage dominan, transisi dari sesi sebelumnya, status lintasan.
- Prompt list: text, source, sequence, stage, marker, confidence, evidence/rationale.

### Tampilan RM2: Cohort

Minimal:

- Distribusi stage cohort.
- Transition matrix.
- Jumlah siswa naik/stagnan/fluktuatif/anomali.
- Daftar siswa prioritas follow-up.
- Rata-rata sesi menuju stage berikutnya.

### Tampilan RM3: Per Prompt

Minimal:

- Prompt text.
- Prompt stage.
- CT 6 indikator.
- Critical Thinking 6 indikator.
- Evidence snippet.
- Source: prompt/artifact/interview/observation/journal/discussion.
- Assessor dan method: auto/manual/researcher_1/researcher_2.
- Confidence dan agreement status.

### Tampilan RM3: Per Stage

Minimal:

- Stage SCP/SRP/MQP/Reflektif.
- Rata-rata CT dan Critical Thinking.
- Indikator paling sering muncul.
- Indikator paling jarang muncul.
- Contoh evidence terbaik.
- Evidence conflict atau low-confidence cases.

### Tampilan Triangulasi

Minimal:

- Finding description.
- Evidence dari log.
- Evidence dari artifact.
- Evidence dari observation.
- Evidence dari interview.
- Status tiap evidence.
- Convergence status.
- Final decision.
- Decision rationale.

## Prinsip Kejelasan Data untuk Tesis

Setiap klaim dalam analisis harus bisa ditelusuri:

- Dari chart ke siswa.
- Dari siswa ke sesi.
- Dari sesi ke unit prompt.
- Dari unit prompt ke label stage.
- Dari label stage ke rationale/evidence.
- Dari indikator CT/Critical Thinking ke evidence snippet.
- Dari evidence ke sumber triangulasi.
- Dari keputusan final ke coder dan audit trail.

Jika rantai ini putus, data terlihat menarik di dashboard tetapi lemah untuk pembuktian tesis.

## Prioritas Paling Mendesak

Urutan kerja yang paling bernilai:

1. Perbaiki UI/API mismatch pada prompt classification, cognitive indicators, dan export.
2. Standarkan stage/marker dan hubungkan semua raw event ke session.
3. Buat transition matrix dan trajectory per siswa untuk RM2.
4. Buat cognitive evidence matrix untuk RM3.
5. Tambahkan triangulation panel untuk artefak, observasi, dan wawancara.
6. Tambahkan reliability workflow untuk double coding dan kappa.

Dengan urutan ini, admin page berubah dari "monitoring aktivitas" menjadi "pusat bukti penelitian" yang langsung menutup kebutuhan RM2 dan RM3.
