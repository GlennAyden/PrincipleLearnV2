# Kelengkapan Data Admin untuk RM2 dan RM3

Dokumen ini melaporkan status kelengkapan data riset PrincipleLearn V3 untuk RM2
(perkembangan struktur prompt) dan RM3 (manifestasi CT dan Critical Thinking) per
**26 April 2026**. Tujuan: memberikan pembaca tesis (dosen pembimbing dan penguji)
gambaran tunggal tentang tabel-tabel data riset, jumlah baris aktual, status fungsional,
dan gap yang masih perlu ditambal sebelum analisis lanjutan.

> Dokumen pendamping:
>
> - [`APPLICATION_OVERVIEW.md`](./APPLICATION_OVERVIEW.md) — modul aplikasi
> - [`USER_JOURNEY.md`](./USER_JOURNEY.md) — touchpoint data per fase
> - [`docs/DATABASE_SCHEMA.md`](../DATABASE_SCHEMA.md) — definisi tabel
> - [`docs/admin-and-research-ops.md`](../admin-and-research-ops.md) — alur admin

---

## 1. Ringkasan Eksekutif

Per 26 April 2026, fondasi data riset PrincipleLearn V3 sudah siap untuk
analisis tesis dengan catatan berikut:

- Pipeline klasifikasi prompt RM2 berjalan dan menghasilkan 143 baris klasifikasi
  pada `prompt_classifications`, ditopang oleh 41 catatan run autocoder pada
  `research_auto_coding_runs`.
- Evidence ledger `research_evidence_items` sudah terisi 261 baris, menjadi
  tulang punggung audit RM2 dan RM3.
- Triangulasi lintas sumber sudah berjalan (`triangulation_records`: 64 baris).
- Coding RM3 manual masih minim (`cognitive_indicators`: 12 baris seed); auto
  scoring sudah aktif (`auto_cognitive_scores`: 12 baris).
- Tabel `inter_rater_reliability`, `prompt_revisions`, `research_artifacts`, dan
  `transcript` masih kosong; reliabilitas double-coding belum dijalankan untuk
  siklus pengumpulan saat ini.
- Modul Discussion sudah dipensiunkan dari pipeline tesis: `discussion_sessions`
  hanya 5 baris dan `discussion_admin_actions` 0 baris. Modul TIDAK dipakai
  untuk analisis RM2 atau RM3 (lihat memori proyek `project_scope.md`).

Konsekuensi: analisis RM2 dapat dimulai sekarang dengan data prompt
klasifikasi yang ada; RM3 masih perlu siklus coding manual untuk memperkaya
`cognitive_indicators` dan menjalankan reliability check.

---

## 2. Inventaris Lengkap Tabel Riset (per 2026-04-26)

Status: **aktif** = digunakan dan terisi; **seed** = sudah berisi referensi
tetapi belum data lapangan; **kosong** = perlu seed/run; **reserved** = tabel
disiapkan tetapi belum dipakai pada siklus tesis ini; **non-aktif** = modul
tidak dipakai untuk tesis.

### 2.1 Tabel Domain Inti (Aplikasi)

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `users` | Akun siswa + admin | 29 | aktif | Termasuk akun admin & cadangan peneliti `sal@expandly.id` (jangan dihapus) |
| `courses` | Course yang di-generate | 33 | aktif | |
| `subtopics` | Modul/subtopic per course | 157 | aktif | |
| `leaf_subtopics` | Unit terkecil yang dipakai siswa | 106 | aktif | Sumber kanonik halaman belajar |
| `quiz` | Soal quiz | 685 | aktif | |
| `quiz_submissions` | Jawaban siswa per quiz | 255 | aktif | Sumber RM3 untuk Pattern Recognition / Debugging |
| `learning_profiles` | Hasil onboarding profile | 6 | aktif | Sebagian siswa belum menyelesaikan profile |
| `user_progress` | Status penyelesaian per leaf subtopic | 13 | aktif | Sumber RM2 longitudinal |
| `subtopic_cache` | Cache konten + key takeaways | 109 | aktif | |
| `course_generation_activity` | Audit run generate-course | 38 | aktif | |
| `example_usage_events` | Telemetri klik Examples | 18 | aktif | |

### 2.2 Tabel Interaksi Pembelajaran

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `ask_question_history` | Pertanyaan siswa + jawaban AI | 17 | aktif | Sumber utama RM2; klasifikasi auto via `prompt-classifier.ts` |
| `challenge_responses` | Jawaban tantangan + iterasi | 15 | aktif | Sumber RM3 untuk Evaluation/Inference |
| `jurnal` | Refleksi terstruktur | 43 | aktif | Sumber RM3 untuk Self-Regulation/Explanation |
| `feedback` | Rating + komentar per subtopic | 40 | aktif | Sumber RM3 untuk Evaluation |
| `transcript` | Transkrip sesi (modul lama) | 0 | kosong | Tidak dipakai; tidak ada gap |
| `transcript_integrity_quarantine` | Audit integritas transcript | 5 | kecil | Audit historis; tidak menghambat tesis |

### 2.3 Tabel Pipeline Riset RM2

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `learning_sessions` | Sesi belajar yang dibundel dari event | 22 | aktif | Resolver session sudah berjalan |
| `prompt_classifications` | Klasifikasi tahap (SCP/SRP/MQP/Reflective) | 143 | aktif | Auto + sebagian manual; siap untuk transition matrix |
| `research_auto_coding_runs` | Log batch run autocoder | 41 | aktif | Audit trail klasifikasi otomatis |
| `prompt_revisions` | Riwayat revisi prompt manual oleh siswa | 0 | reserved | Belum diaktifkan; opsional untuk RM2 |

### 2.4 Tabel Pipeline Riset RM3

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `cognitive_indicators` | Skor 6 CT + 6 CTh (manual) | 12 | seed aktif | Hanya 12 baris coded; perlu siklus coding manual |
| `auto_cognitive_scores` | Skor otomatis dari heuristik/LLM | 12 | aktif | Berfungsi sebagai sugesti untuk reviewer |
| `research_artifacts` | Artefak solusi siswa (kode/jawaban) | 0 | reserved | Belum diaktifkan; opsional untuk siklus berikut |

### 2.5 Tabel Bukti dan Triangulasi

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `research_evidence_items` | Cuplikan bukti per kode (RM2/RM3) | 261 | aktif | Tulang punggung audit; cross-reference ke prompt/quiz/jurnal |
| `triangulation_records` | Keputusan konvergensi lintas sumber | 64 | aktif | Sudah dipakai untuk key case |
| `inter_rater_reliability` | Hasil double-coding (kappa, agreement) | 0 | reserved | Workflow reliability belum dijalankan untuk siklus saat ini |

### 2.6 Tabel Modul Discussion (Tidak Dipakai untuk Tesis)

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `discussion_sessions` | Sesi diskusi Sokratik | 5 | non-aktif | Modul tidak dijalankan untuk tesis |
| `discussion_messages` | Pesan dalam diskusi | 157 | non-aktif | Histori dari uji coba awal |
| `discussion_assessments` | Read-model untuk admin | 45 | non-aktif | Tetap diisi historis |
| `discussion_templates` | Template diskusi auto-generated | 59 | non-aktif | |
| `discussion_admin_actions` | Aksi admin pada diskusi | 0 | non-aktif | Tidak perlu seed |

### 2.7 Tabel Infrastruktur

| Tabel | Tujuan | Baris | Status | Catatan |
| --- | --- | ---: | --- | --- |
| `api_logs` | Log seluruh API call | 3.801 | aktif | Untuk debugging dan audit performance |
| `rate_limits` | Rate limit per IP/user | 115 | aktif | Operasional |

---

## 3. Matriks Coverage RM2

| Kebutuhan RM2 | Sumber Data | Status | Aksi |
| --- | --- | --- | --- |
| Log prompt multi-sesi | `ask_question_history` (17), `challenge_responses` (15), `learning_sessions` (22) | siap analisis untuk n kecil | Tambah volume; jalankan siklus belajar berikut |
| Klasifikasi SCP/SRP/MQP/Reflective | `prompt_classifications` (143) | siap | Validasi sample 25% untuk reliability |
| Catatan autocoder | `research_auto_coding_runs` (41) | aktif | OK |
| Resolusi sesi (`learning_session_id`) | `learning_sessions` (22) | aktif | OK |
| Transition matrix antar sesi | turunan dari `prompt_classifications` + `learning_sessions` | siap | Render di `/admin/riset` |
| Bukti per kode | `research_evidence_items` (261) | aktif | OK |
| Triangulasi prompt-jurnal-feedback | `triangulation_records` (64) | aktif | Tambah kasus untuk persona stagnan/anomali |
| Inter-rater reliability | `inter_rater_reliability` (0) | KOSONG | **Wajib jalankan double-coding 25% sample** |
| Revisi prompt manual | `prompt_revisions` (0) | reserved | Opsional; aktifkan jika ingin dataset perubahan prompt |

---

## 4. Matriks Coverage RM3

| Kebutuhan RM3 | Sumber Data | Status | Aksi |
| --- | --- | --- | --- |
| 6 indikator CT | `cognitive_indicators` (12 manual), `auto_cognitive_scores` (12 auto) | minim | **Jalankan siklus coding manual untuk seluruh prompt classified** |
| 6 indikator Critical Thinking | sama seperti CT | minim | sama |
| Bukti per indikator | `research_evidence_items` (261) | aktif | Pastikan link `evidence_item.indicator_id` terisi |
| Korelasi stage prompt × indikator | join `prompt_classifications` × `cognitive_indicators` | menunggu data RM3 | Setelah RM3 manual lengkap |
| Artefak solusi | `research_artifacts` (0) | reserved | Opsional; aktifkan untuk siklus berikutnya jika butuh artefak kode |
| Triangulasi indikator | `triangulation_records` (64) | aktif | Sertakan field indikator pada record |
| Inter-rater reliability indikator | `inter_rater_reliability` (0) | KOSONG | Sama seperti RM2 |

---

## 5. Gap yang Harus Ditambal Sebelum Analisis Tesis

Diurutkan berdasar prioritas. Ini adalah **gap data**, bukan gap fitur. Gap UI
admin sudah mayoritas tertutup pada commit terbaru
(`9d772a8`, `c0f459e`).

### P0 — Wajib Tutup Sebelum Bab 4 Dimulai

1. **Reliability double-coding (25% sample)**.
   - Tabel target: `inter_rater_reliability`.
   - Saat ini 0 baris. Tanpa kappa minimal 0.70 dan agreement 0.80, klaim
     coding RM2/RM3 tidak memenuhi standar di Bab 3.4.3.
   - Aksi: assign sample 25% dari `prompt_classifications` (≈ 36 unit) untuk
     dikode ulang oleh peneliti kedua.
2. **Coding RM3 manual untuk seluruh prompt classified**.
   - Tabel target: `cognitive_indicators`.
   - Saat ini hanya 12 baris seed; setiap prompt yang sudah classified
     idealnya punya skor 6 CT + 6 CTh.
   - Aksi: gunakan `/admin/riset/kognitif` untuk men-score; auto score sebagai
     suggestion.
3. **Volume data partisipan tambahan (opsional, tergantung target n)**.
   - 29 user, 17 ask question, 15 challenge response — masih rendah.
   - Aksi: jalankan satu siklus belajar tambahan jika target n minimal belum
     tercapai.

### P1 — Memperkuat Klaim, Tidak Memblokir

1. **Aktifkan `prompt_revisions` untuk dataset perubahan prompt**.
   - Berguna jika ingin menampilkan evolusi mikro intra-sesi (selain inter-sesi).
2. **Aktifkan `research_artifacts` jika analisis melibatkan artefak kode**.
   - Untuk siswa yang menjawab challenge dengan kode/algoritma.
3. **Lengkapi `learning_profiles` untuk semua 29 user**.
   - Saat ini hanya 6 baris. Onboarding wajib seharusnya menambah, perlu cek
     apakah ada user lama yang lewat onboarding sebelum gate diaktifkan.

### P2 — Nice to Have

1. **Pensiunkan modul Discussion secara eksplisit di kode** untuk menghindari
   peneliti masa depan salah anggap modul aktif. Saat ini sudah dilewati di
   pipeline analisis tetapi UI masih menampilkan tab.

---

## 6. Status Halaman Admin Riset (Sebagai Referensi)

Halaman ini memang diluar scope dokumen "data completeness", tetapi berguna
sebagai konfirmasi bahwa setiap tabel di atas memiliki UI inspeksi.

| Halaman | Sumber Data | Status |
| --- | --- | --- |
| `/admin/dashboard` | KPI lintas tabel | aktif |
| `/admin/aktivitas` | `ask_question_history`, `challenge_responses`, `quiz_submissions`, `jurnal`, `feedback` | aktif |
| `/admin/siswa/[id]` | turunan per user lintas tabel | aktif (tab Evolusi Prompt + Kognitif) |
| `/admin/riset` | KPI riset, distribusi stage, IRR ringkas | aktif |
| `/admin/riset/prompt` | `prompt_classifications`, `learning_sessions` | aktif |
| `/admin/riset/kognitif` | `cognitive_indicators`, `auto_cognitive_scores` | aktif |
| `/admin/riset/readiness` | aggregator status data | aktif |
| `/admin/riset/bukti` | `research_evidence_items` | aktif |
| `/admin/riset/triangulasi` | `triangulation_records` | aktif |
| `/admin/ekspor` | endpoint export | non-aktif untuk tesis (dataset diambil via SQL ad-hoc) |

---

## 7. Prinsip Kejelasan Data untuk Tesis

Setiap klaim di Bab 4/5 tesis harus dapat ditelusuri sepanjang rantai berikut.
Tabel di atas memastikan setiap mata rantai punya storage:

```text
chart  ->  siswa (users)
       ->  sesi (learning_sessions)
       ->  unit prompt (ask_question_history / challenge_responses / quiz_submissions / jurnal)
       ->  klasifikasi tahap (prompt_classifications)
       ->  bukti (research_evidence_items)
       ->  indikator CT/CTh (cognitive_indicators / auto_cognitive_scores)
       ->  triangulasi (triangulation_records)
       ->  reliability (inter_rater_reliability)   <-- mata rantai yang masih putus
```

Mata rantai paling kritikal yang masih putus adalah `inter_rater_reliability`.
Tanpa itu, klaim trustworthiness coding tidak dapat ditegakkan.

---

## 8. Riwayat Pembaruan Dokumen

| Tanggal | Perubahan |
| --- | --- |
| 2026-04-26 | Refresh menyeluruh: ganti narasi "gap UI/API" menjadi inventaris tabel + status data aktual; tambah catatan tabel reserved/non-aktif; cantumkan row count per tabel. |
| 2026-02-xx (versi sebelumnya) | Fokus pada gap UI/API dan rekomendasi sprint. Sebagian besar gap UI sudah tertutup pada commit `9d772a8` dan `c0f459e`. |
