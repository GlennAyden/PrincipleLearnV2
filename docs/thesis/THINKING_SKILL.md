## Tabel 3.12. Indikator Critical Thinking (CT)

| No. | Indikator       | Deskripsi Aktivitas Mahasiswa                                                                                           |
| --- | --------------- | ----------------------------------------------------------------------------------------------------------------------- |
| 1   | Analysis        | Mahasiswa memecah permasalahan atau meminta klarifikasi atas jawaban AI untuk memahami konsep lebih dalam.             |
| 2   | Evaluation      | Mahasiswa menilai efektivitas atau ketepatan solusi yang diberikan oleh AI.                                            |
| 3   | Inference       | Mahasiswa membuat prediksi atau kesimpulan logis dari hasil pembelajaran atau contoh kasus yang diberikan AI.         |
| 4   | Explanation     | Mahasiswa menjelaskan kembali konsep dengan kata-kata sendiri atau memberikan contoh baru.                             |
| 5   | Self-Regulation | Mahasiswa merefleksikan pemahaman, kesulitan, atau keterbatasan pengetahuannya sendiri.                                |

## Tabel 3.13. Indikator Computational Thinking (CPT)

| No. | Indikator                    | Deskripsi Aktivitas Mahasiswa                                                                                         |
| --- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| 1   | Decomposition                | Kemampuan membagi masalah kompleks menjadi langkah-langkah kecil yang lebih mudah dipahami.                          |
| 2   | Pattern Recognition          | Kemampuan mengenali kesamaan atau pola antar masalah untuk menemukan solusi umum.                                    |
| 3   | Abstraction                  | Kemampuan memfokuskan perhatian pada inti konsep dengan mengabaikan detail yang tidak relevan.                       |
| 4   | Algorithmic Thinking         | Kemampuan menyusun urutan langkah penyelesaian masalah secara logis dan sistematis.                                  |
| 5   | Debugging / Error Correction | Kemampuan menemukan dan memperbaiki kesalahan dalam algoritma atau prosedur.                                         |


## Pemetaan Fitur ke Indikator CT dan CPT

Berikut saran pemetaan per fitur ke indikator **Critical Thinking (CT)** dan **Computational Thinking (CPT)** di atas.

### Ask Question

- **CT**: Analysis, Explanation, Self‑Regulation  
  Dari isi pertanyaan bisa dianalisis apakah mahasiswa memecah masalah, meminta klarifikasi, dan menyadari bagian yang belum dipahami.
- **CPT**: Abstraction  
  Cara mereka merumuskan pertanyaan menunjukkan apakah sudah bisa memfokuskan ke inti masalah.

### Challenge My Thinking (challenge + challenge-feedback + penyimpanan response)

- **CT**: Evaluation, Inference, Self‑Regulation  
  Jawaban terhadap pertanyaan challenge dan respons terhadap feedback menunjukkan kemampuan menilai, menyimpulkan, dan merefleksi.
- **CPT**: Abstraction, Algorithmic Thinking  
  Jika prompt challenge diminta berbentuk “bagaimana langkah‑langkah…”, kita bisa melihat kemampuan menyusun solusi bertahap dan menyaring konsep penting.

### Quiz Time

- **CPT**: Pattern Recognition, Algorithmic Thinking, Debugging / Error Correction  
  Pola jawaban benar/salah pada tipe soal tertentu bisa dianalisis untuk melihat kemampuan mengenali pola, mengikuti langkah logis, dan memperbaiki kesalahan setelah diberi kunci/penjelasan.
- **CT**: Evaluation  
  Refleksi setelah melihat skor/penjelasan (misalnya lewat item “mengapa jawabanmu salah/benar?”) bisa dipakai mengukur penilaian atas kualitas pemahamannya.

### Feedback (mahasiswa memberi feedback ke course/subtopik)

- **CT**: Evaluation, Self‑Regulation  
  Isi feedback (“bagian mana yang membantu / membingungkan”) bisa menunjukkan kemampuan menilai efektivitas materi dan menyadari kesulitan diri.
- **CPT**: Debugging / Error Correction (opsional)  
  Jika ada bagian feedback yang mengusulkan perbaikan langkah atau alur, itu bisa dipetakan ke kemampuan menemukan dan mengusulkan perbaikan “prosedur”.

### Discussion (Socratic discussion engine) — TIDAK DIPAKAI untuk Tesis

> Catatan 2026-04-26: modul Discussion **tidak digunakan** untuk pengumpulan
> data tesis. Hanya 5 sesi historis pada `discussion_sessions`. Pemetaan di
> bawah dipertahankan sebagai referensi konseptual; aktivitas Sokratik dialihkan
> ke Ask Question dan Challenge Thinking.

- **CT**: Analysis, Explanation, Inference, Self‑Regulation
- **CPT**: Decomposition

### Prompt Builder + Prompt Timeline (RM2 instrumen)

- **CT**: Self-Regulation
  Siswa secara eksplisit menyusun ulang prompt dan melihat evolusinya, melatih
  kesadaran metakognitif tentang cara bertanya.
- **CPT**: Decomposition, Abstraction
  Builder memandu siswa memecah pertanyaan dan memfokuskan pada inti.

### Reasoning Note

- **CT**: Self-Regulation, Explanation
  Catatan alur penalaran sebelum bertanya menjadi marker tahap Reflective pada
  klasifikasi RM2 dan bukti Self-Regulation pada RM3.

### Structured Reflection (Jurnal terstruktur)

- **CT**: Self-Regulation, Explanation, Evaluation
  Refleksi terstruktur (What — So What — Now What) memberi data tekstual
  paling kaya untuk indikator Self-Regulation. Tabel `jurnal` (43 baris per
  2026-04-26) adalah sumber utama untuk RM3.

### Request Course (step 1–3: topik, goal, level, problem, assumption)

- **CT**: Self‑Regulation, Analysis  
  Cara mereka mendeskripsikan tujuan belajar dan asumsi awal bisa dianalisis sebagai refleksi diri dan identifikasi kebutuhan belajar.
- **CPT**: Decomposition, Abstraction, Pattern Recognition  
  Dari problem statement dan extra topics, sistem bisa melihat apakah mahasiswa sudah mampu memecah kebutuhan belajar, fokus ke konsep inti, dan menghubungkan dengan pengalaman atau pola masalah sebelumnya.

Catatan implementasi: tiap endpoint dapat menambahkan kolom/metadata seperti `thinking_skill_tags` (misalnya array `['CT-Analysis', 'CPT-Abstraction']`) di tabel yang relevan, sehingga data interaksi langsung bisa dianalisis per indikator kemampuan berpikir.
