# Admin And Research Ops

## Purpose

Surface admin di PrincipleLearn melayani dua fungsi sekaligus:

- operasi aplikasi harian
- interpretasi data penelitian

## Main Admin Areas

### Dashboard

`/admin/dashboard` merangkum KPI utama seperti:

- active students
- total courses
- quiz accuracy
- activity counts
- RM2 prompt stage distribution
- RM3 cognitive indicators
- ringkasan system health

### Siswa

`/admin/siswa` dan detail turunannya dipakai untuk melihat progres dan aktivitas siswa per individu.

### Aktivitas

`/admin/aktivitas` fokus pada log interaksi seperti:

- ask-question
- challenge
- quiz
- refleksi
- transcript
- generate-course
- discussion

Catatan:

- surface refleksi admin dibaca sebagai domain terpadu dari `jurnal + feedback`
- riwayat tetap historis per submit, tetapi mirror feedback tidak seharusnya tampil sebagai duplikasi event yang terpisah

### Riset

`/admin/riset` adalah hub untuk pekerjaan RM2 dan RM3:

- prompt classifications
- cognitive indicators
- auto scores
- analytics
- export

### Ekspor

`/admin/ekspor` dan endpoint export terkait dipakai untuk menyiapkan data keperluan analisis luar aplikasi.

## Research Framing

### RM1

Berfokus pada pengembangan media dan kelayakan produk.

### RM2

Berfokus pada perkembangan struktur prompt siswa dari:

- `SCP`
- `SRP`
- `MQP`
- `Reflective`

### RM3

Berfokus pada manifestasi:

- 6 indikator CT
- 6 indikator CTh

## Canonical Terminology

Gunakan istilah berikut secara konsisten:

- `CT` untuk Computational Thinking
- `CTh` untuk Critical Thinking

Dokumen lama kadang memakai istilah lain seperti `CPT`; untuk dokumentasi baru jangan dipakai lagi agar tidak membingungkan.

## Admin Operating Guidelines

- gunakan dashboard untuk melihat sinyal agregat
- gunakan halaman siswa dan aktivitas untuk audit kasus individual
- gunakan riset untuk pekerjaan klasifikasi, scoring, dan analisis longitudinal
- gunakan export hanya setelah memastikan filter dan konteks analisis sudah benar

## Data Interpretation Caution

- hasil klasifikasi prompt dan cognitive scoring bersifat analitik bantu, bukan label absolut
- short response cenderung menghasilkan confidence lebih rendah
- perubahan heuristik classifier atau model AI bisa menggeser tren historis

## Suggested Review Routine

1. cek KPI dashboard
2. cek anomali pada logging atau failure rate
3. cek distribusi RM2 stage
4. cek tren RM3 score
5. audit sample siswa bila ada outlier

## Reflection Rollout Ops

- gunakan `node scripts/reflection-rollout-live.mjs` untuk precheck live berbasis service-role
- gunakan `node scripts/reflection-rollout-live.mjs --json` bila butuh output yang mudah disimpan atau dibandingkan
- `--apply-safe` hanya boleh dipakai bila token Management API sudah tersedia dan precheck menunjukkan rating/index data bersih
- uniqueness `feedback.origin_jurnal_id` dan drop legacy unique `jurnal` harus tetap ditahan sampai backfill/collision scan dinyatakan aman
