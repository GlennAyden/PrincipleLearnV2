# CODEBOOK_RM2_RM3

Codebook IRR (Inter-Rater Reliability) untuk klasifikasi tahap prompt (RM2) dan penilaian indikator CT/CrT (RM3) di PrincipleLearn V3. Dokumen ini melengkapi rubrik penuh di [`ASSESSMENT_RUBRIC.md`](./ASSESSMENT_RUBRIC.md) dan deskripsi konseptual di [`THINKING_SKILL.md`](./THINKING_SKILL.md); rujuk kedua dokumen tersebut untuk contoh skoring detail. Cakupan codebook di sini adalah definisi operasional ringkas, anchor pembeda stage, dan protokol coding yang dapat diterapkan langsung oleh dua rater independen.

---

## 1. Pengenalan & Tujuan IRR

Pengukuran tahap prompt (SCP/SRP/MQP/Reflektif) dan dimensi kognitif (CT 6 + CrT 6) bersifat interpretatif. Untuk menjamin reliabilitas hasil tesis, kami melakukan **double-coding** terhadap sampel acak terstratifikasi 25% dari seluruh baris `prompt_classifications` Mode Penelitian. Dua rater (peneliti utama sebagai `researcher_1` dan dosen pembimbing/mahasiswa S2 sebagai `researcher_2`) memberikan label secara independen, lalu dihitung **Cohen's κ** per stage dan **Po (observed agreement)** per dimensi. Threshold penerimaan: **κ ≥ 0.70** (substantial agreement, Landis & Koch 1977) dan **Po ≥ 0.80**. Jika tidak tercapai, codebook direvisi (anchor diperjelas) dan dilakukan re-coding 25% sampel baru sampai memenuhi threshold.

---

## 2. Empat Stage Prompt

Stage prompt mengukur kompleksitas struktural permintaan siswa kepada AI. Operasional, klasifikasi dilakukan berdasarkan teks prompt + jawaban AI + konteks subtopik. Skor numerik 1–4 untuk analisis longitudinal (lihat `dominant_stage_score` di `learning_sessions`).

### 2.1 SCP — Simple Clarification Prompt (skor 1)

**Definisi operasional**: Pertanyaan tunggal, langsung, minim konteks. Siswa hanya meminta definisi, contoh dasar, atau "apa itu X" tanpa menjelaskan tujuan atau hambatan.

**Anchor contoh** (algoritma SMA Fase E):
- "Apa itu pseudocode?"
- "Jelaskan loop while."

**Indikator pembeda dari SRP**: SCP tidak mengandung konteks tugas, tidak menyebut tujuan belajar, dan tidak merujuk pengetahuan sebelumnya. Jika prompt menyebutkan ≥1 dari (a) tugas spesifik, (b) materi yang sudah dipelajari, (c) tujuan belajar — naikkan ke SRP.

### 2.2 SRP — Structured Reformulation Prompt (skor 2)

**Definisi operasional**: Prompt direformulasi dengan menyertakan konteks, tujuan, atau batasan. Siswa menyusun ulang pertanyaan agar AI memahami latar belakang.

**Anchor contoh**:
- "Saya sedang belajar algoritma sorting dan sudah paham bubble sort. Bisa jelaskan selection sort dan bandingkan kompleksitasnya?"
- "Untuk tugas membuat flowchart cek ganjil/genap, bagaimana struktur if-else yang paling sederhana?"

**Indikator pembeda dari MQP**: SRP berisi **satu** fokus pertanyaan (meski dengan konteks panjang). Bila prompt memuat ≥2 pertanyaan berlapis atau follow-up berurutan dalam satu episode, naikkan ke MQP.

### 2.3 MQP — Multi-Question Prompt (skor 3)

**Definisi operasional**: Pertanyaan berlapis dan iteratif dalam satu prompt, atau rangkaian follow-up yang membangun pemahaman berbasis jawaban sebelumnya. Mengandung sub-pertanyaan eksplisit (1., 2., 3.) atau klausa "lalu", "selain itu", "jika begitu apakah...".

**Anchor contoh**:
- "Pertama, jelaskan perbedaan array dan list. Kedua, kapan sebaiknya pakai array? Ketiga, beri contoh kasus algoritma SMA yang lebih cocok pakai list."
- (follow-up setelah penjelasan AI tentang loop) "Kalau begitu, bagaimana cara menghentikan loop di tengah iterasi tanpa pakai break? Apakah ada efek samping untuk readability?"

**Indikator pembeda dari Reflektif**: MQP bertanya **apa** dan **bagaimana** tetapi belum mengevaluasi alternatif atau memperbandingkan strategi. Bila prompt secara eksplisit menilai/membandingkan/justifikasi pilihan, naikkan ke Reflektif.

### 2.4 Reflektif — Reflective/Evaluative Prompt (skor 4)

**Definisi operasional**: Prompt evaluatif yang membandingkan alternatif, meminta justifikasi pilihan, atau merefleksikan keterbatasan pendekatan. Sering memuat kata kunci: "lebih baik", "trade-off", "kelemahan", "kenapa pilih", "alternatif lain", "asumsi saya benar tidak".

**Anchor contoh**:
- "Saya pakai bubble sort untuk data 1000 angka tapi lambat. Apakah quicksort selalu lebih baik atau ada kondisi di mana bubble sort tetap masuk akal? Tolong evaluasi pendekatan saya."
- "Saya berasumsi rekursi selalu lebih elegan dari iterasi. Apakah asumsi ini valid untuk kasus menghitung faktorial di SMA? Beri alasan."

**Indikator pembeda dari MQP**: Reflektif berisi penilaian eksplisit atau ajakan untuk mengkritisi/memvalidasi pemikiran siswa sendiri.

---

## 3. Dua Belas Dimensi CT/CrT (skor 0–2)

Setiap prompt dinilai pada 12 dimensi paralel (6 Computational Thinking + 6 Critical Thinking). Skala **0 = tidak ada**, **1 = ada sebagian/lemah**, **2 = ada jelas/eksplisit**. Untuk anchor skor 3–4 (Exemplary) konsultasikan [`ASSESSMENT_RUBRIC.md`](./ASSESSMENT_RUBRIC.md); codebook ini fokus pada 0/1/2 sesuai schema `cognitive_indicators`.

### 3.1 CT — Computational Thinking (6 dimensi)

| Dimensi | 0 (tidak ada) | 1 (lemah) | 2 (jelas) |
|---|---|---|---|
| **ct_decomposition** | Tidak memecah masalah; pertanyaan monolitik. | Menyebut beberapa bagian tetapi tidak konsisten. | Memecah eksplisit menjadi sub-masalah/sub-langkah berlabel. |
| **ct_pattern_recognition** | Tidak mengaitkan dengan kasus serupa. | Menyebut kemiripan secara samar ("mirip yang kemarin"). | Mengidentifikasi pola struktural lintas kasus dengan contoh konkret. |
| **ct_abstraction** | Penuh detail teknis tanpa prinsip. | Menyebut prinsip umum tetapi masih tercampur detail. | Menyederhanakan ke prinsip inti dan menanggalkan detail tidak relevan. |
| **ct_algorithm_design** | Tidak menyebut urutan langkah. | Menyebut langkah tetapi tidak berurutan/lengkap. | Menyusun langkah solusi logis berurutan (pseudokode/flowchart). |
| **ct_evaluation_debugging** | Tidak menyebut pengujian/perbaikan. | Menyebut "salah" tanpa diagnosis. | Mendiagnosis akar error dan mengusulkan perbaikan spesifik. |
| **ct_generalization** | Solusi terikat satu kasus. | Menyebut bisa dipakai lagi tanpa rincian. | Menjelaskan transfer strategi ke konteks lain dengan parameterisasi. |

### 3.2 CrT — Critical Thinking (6 dimensi)

| Dimensi | 0 (tidak ada) | 1 (lemah) | 2 (jelas) |
|---|---|---|---|
| **cth_interpretation** | Tidak memaknai persoalan. | Memparafrasekan tanpa mengidentifikasi batasan. | Memaknai persoalan + menyebut batasan/asumsi tugas. |
| **cth_analysis** | Tidak memecah alasan/argumen. | Mengurai satu sisi saja. | Memecah penjelasan menjadi premis-konsekuensi yang dapat diuji. |
| **cth_evaluation** | Menerima semua informasi tanpa nilai. | Menilai umum ("sepertinya benar"). | Menilai ketepatan/kelemahan dengan kriteria eksplisit. |
| **cth_inference** | Tidak menarik kesimpulan. | Menyimpulkan tanpa dukungan. | Menarik kesimpulan didukung bukti + menyebut alternatif. |
| **cth_explanation** | Mengulang jawaban AI. | Memparafrasekan tipis. | Menjelaskan ulang dengan bahasa/analogi sendiri. |
| **cth_self_regulation** | Tidak merefleksikan pemahaman. | Menyebut "masih bingung" tanpa diagnosis. | Mengidentifikasi spesifik area kelemahan + rencana perbaikan. |

---

## 4. Pemetaan Komponen Interaktif → Dimensi RM3

Konsolidasi dari [`rencana-eksekusi-mvr.md`](../../rencana-eksekusi-mvr.md) Item 9: komponen UI mana yang paling potensial memunculkan dimensi mana.

| Komponen UI | Dimensi CT dominan | Dimensi CrT dominan |
|---|---|---|
| **PromptBuilder** (chips konteks/tujuan) | decomposition, abstraction | interpretation |
| **AskQuestion** (Q&A streaming) | pattern_recognition, algorithm_design | analysis, explanation |
| **ChallengeThinking** (kritik AI) | evaluation_debugging | evaluation, inference |
| **StructuredReflection** (jurnal) | generalization | self_regulation, explanation |
| **Quiz** (jawaban + alasan) | algorithm_design, evaluation_debugging | inference, evaluation |
| **ReasoningNote** (catatan sebelum tanya) | abstraction | interpretation, self_regulation |
| **PromptTimeline** (revisi prompt) | (lihat `prompt_revisions`) | evaluation, self_regulation |

Tabel ini sebagai panduan rater: ketika prompt berasal dari komponen tertentu, periksa dengan teliti dimensi dominan terkait — bukan untuk mengeluarkan dimensi lain dari penilaian.

---

## 5. Protokol Coding (Langkah 1–5)

1. **Persiapan**: rater membuka file sampel `scripts/irr-sample-<timestamp>.json` (hasil dari `node scripts/irr-sample.mjs`). Setiap item berisi `promptText`, `aiResponse`, `currentStage`, `courseId`, `userId`.
2. **Baca artefak terkait**: rater membaca prompt + jawaban AI **secara penuh**. Jika prompt adalah follow-up, baca riwayat terdekat (sediakan via UI `/admin/riset/irr/`).
3. **Assign stage**: pilih satu dari `SCP / SRP / MQP / Reflektif` berdasarkan anchor di §2. Bila ragu antara dua stage, pilih yang lebih rendah dan catat alasan di kolom catatan.
4. **Skor 12 dimensi**: berikan 0/1/2 untuk masing-masing dimensi CT (6) dan CrT (6). Jangan biarkan dimensi kosong — 0 berarti tidak ada bukti, bukan "tidak yakin".
5. **Submit**: kirim via UI `/admin/riset/irr/` (POST `/api/admin/research/irr/submit`). Sistem akan menyimpan baris baru di `prompt_classifications` dengan `classified_by='researcher_2'` dan link `secondary_classification_id` ke baris primer rater 1. Bila stage rater 1 ≠ stage rater 2 → script kappa otomatis memanggil **LLM tiebreaker** (third opinion) sebagai input pertimbangan; keputusan akhir tetap manual oleh peneliti.

---

## 6. Kriteria Penerimaan κ

- **Threshold**: κ ≥ 0.70 (substantial agreement) dan Po ≥ 0.80.
- **Kalkulasi**: dilakukan per stage (4 nilai κ) dan satu nilai overall (simple average across stage). Untuk dimensi (12 dimensi × 3 level), dihitung Po saja karena marjinal kategori sering tidak imbang.
- **Jika gagal**:
  1. Tinjau pola disagreement (dari `per_stage_breakdown` di kolom `notes`).
  2. Revisi anchor di §2 / §3 yang paling sering disengketakan.
  3. Re-train rater (diskusi 30–60 menit menyamakan persepsi anchor baru).
  4. Tarik **sampel acak baru 25%** dari universe sisa, ulangi protokol.
  5. Maksimum 2 iterasi codebook revision sebelum eskalasi ke pembimbing tesis.

**Catatan reliabilitas final**: jika setelah iterasi kedua κ tetap < 0.70 untuk stage tertentu, laporkan secara transparan di Bab Metodologi tesis dengan justifikasi (mis. stage Reflektif jarang muncul → small-sample κ tidak stabil) dan gunakan analisis kualitatif sebagai pendukung untuk dimensi tersebut.

---

**Versi**: 1.0 (MVR Item 8d, W12). Revisi codebook setelah pilot run akan dicatat di bagian akhir dokumen ini sebagai changelog.
