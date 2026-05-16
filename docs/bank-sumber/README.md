# Bank Sumber — Materi Acuan Mode Penelitian (MVR)

Folder ini berisi PDF bahan ajar **free & legal** yang dikurasi sebagai bank sumber untuk fitur RAG di **Mode Penelitian** (Item 3-4 di `rencana-eksekusi-mvr.md`).

Setiap PDF di sini akan di-upload via `/admin/sumber` (Item 3) dengan kolom `materials.template_topics VARCHAR[]` di-set sesuai mapping di bawah. Sistem akan chunk + embed (OpenAI `text-embedding-3-small`, 600 token / chunk + overlap 80) lalu simpan ke `material_chunks` untuk retrieval.

> **Sumber primer kurikulum Fase E:** `docs/Informatika_BS_KLS_X_Rev.pdf` — Mushthofa, dkk. (2023). *Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi*. Kementerian Pendidikan, Kebudayaan, Riset, dan Teknologi. Buku ini bukan di folder ini agar tidak menggandakan; tetapi WAJIB di-upload sebagai material pertama dengan `template_topics = ['mengenal-algoritma','struktur-kendali','memilih-algoritma','struktur-data']`.

## Konvensi Penamaan File

`NN-<template_topic_slug>-<judul-ringkas>-<sumber>.pdf`

- `NN` = nomor course (01-04)
- `template_topic_slug` = salah satu dari 4 slug Fase E
- `sumber` = institusi/penerbit untuk traceability

## Mapping PDF → `template_topics`

### Course 1 — `mengenal-algoritma` (Bab 2 hal. 29-44)

Cakupan: Definisi algoritma, hubungan berpikir komputasional, Diagram Alir (notasi ANSI/ISO), tracing diagram alir, Pseudokode (konvensi & contoh), tracing pseudokode.

| File | Penulis / Institusi | template_topics yang relevan | Catatan |
|---|---|---|---|
| `01-mengenal-algoritma-Informatika-BG-KLS-X-Rev-Mirror.pdf` | Mushthofa dkk. (2023), Kemdikbudristek — Buku Panduan **Guru** | `mengenal-algoritma`, `struktur-kendali`, `memilih-algoritma`, `struktur-data` | Pendamping resmi buku siswa; berisi contoh tambahan flowchart/pseudocode + kunci jawaban tracing. Mirror SMAN20 Jakarta. |
| `01-mengenal-algoritma-Modul-Logika-Algoritma-NusaMandiri.pdf` | Dany Pratmanto (Nusa Mandiri) | `mengenal-algoritma`, `struktur-kendali` | Modul kuliah komprehensif: logika, flowchart, pseudocode, struktur kendali. Cocok untuk perluasan contoh. |
| `01-mengenal-algoritma-MembuatAlgoritmaDanProgram-UPNYK.pdf` | UPN "Veteran" Yogyakarta | `mengenal-algoritma`, `struktur-kendali` | Penekanan pada cara membuat algoritma + program. Pengantar prosedur/fungsi. |

### Course 2 — `struktur-kendali` (Bab 2 hal. 45-79)

Cakupan: Ekspresi (operand, operator), operator matematika/logika/relasional/kesamaan, percabangan (If-Else, Switch-Case, bersarang), perulangan (For, While, Do-While, bersarang & tak terbatas), fungsi (membuat, memanggil, variabel lokal).

| File | Penulis / Institusi | template_topics yang relevan | Catatan |
|---|---|---|---|
| `02-struktur-kendali-Buku-Algoritma-Pemrograman-UNESA.pdf` | Universitas Mulawarman (mirror UNESA SINDIG) | `mengenal-algoritma`, `struktur-kendali` | Buku ajar lengkap: konsep, flowchart & pseudocode, tipe data, variabel, struktur kendali. Cakupan paling komprehensif untuk Course 2. |
| `02-struktur-kendali-Percabangan-UNIKOM.pdf` | Andri Heryandi (UNIKOM) — Pemrograman Lanjut | `struktur-kendali` | Bab 04 fokus pada percabangan: if, if-else, if-else-if, switch-case + contoh kasus. |
| `02-struktur-kendali-Perulangan-UNIKOM.pdf` | Alam Santosa (UNIKOM) — Teori Algoritma | `struktur-kendali` | Bab 05 fokus pada perulangan: for, while, do-while, perulangan bersarang. |

### Course 3 — `memilih-algoritma` (Bab 2 hal. 80-95)

Cakupan: Pencarian (sequential/linear, binary), Pengurutan (Bubble Sort, Insertion Sort, Selection Sort) — konsep, langkah, kompleksitas.

| File | Penulis / Institusi | template_topics yang relevan | Catatan |
|---|---|---|---|
| `03-memilih-algoritma-Pengurutan-UNIKOM.pdf` | UNIKOM | `memilih-algoritma` | Materi pengurutan lengkap (~6 MB, paling komprehensif): bubble, insertion, selection + variasi. |
| `03-memilih-algoritma-Sorting-Modul8-UM.pdf` | Universitas Negeri Malang — Elektro | `memilih-algoritma` | Modul 8 sorting: bubble, selection, insertion, shell, merge. Cocok untuk perbandingan algoritma. |
| `03-memilih-algoritma-Searching-ModulPraktikum3-UM.pdf` | Universitas Negeri Malang — TEI | `memilih-algoritma` | Modul praktikum searching: sequential, binary, interpolation. |
| `03-memilih-algoritma-Searching-Pertemuan05-UPI-YAI.pdf` | UPI-YAI | `memilih-algoritma` | Slide materi searching pertemuan ke-5. Visual + contoh trace. |

### Course 4 — `struktur-data` (Bab 2 hal. 96-105)

Cakupan: Pengantar struktur data, Antrean (Queue — FIFO), Tumpukan (Stack — LIFO) — operasi dasar (enqueue/dequeue/push/pop), aplikasi.

| File | Penulis / Institusi | template_topics yang relevan | Catatan |
|---|---|---|---|
| `04-struktur-data-Stack-Tumpukan-BinaDarma.pdf` | Suyanto (Universitas Bina Darma) | `struktur-data` | Pertemuan 4 Struktur Data: Stack/Tumpukan — operasi push, pop, peek, aplikasi. |
| `04-struktur-data-Queue-Antrian-BinaDarma.pdf` | Suyanto (Universitas Bina Darma) | `struktur-data` | Pertemuan 6 Struktur Data: Queue/Antrian — enqueue, dequeue, circular queue. |
| `04-struktur-data-Queue-Antrian-PENS.pdf` | Yuliana (PENS) — Data Structure | `struktur-data` | Bab 4 Antrian dari diktat PENS. Suplemen visual. |
| `04-struktur-data-Queue-Pertemuan3-UNIKOM.pdf` | UNIKOM — Algoritma & Struktur Data 2 | `struktur-data` | Pertemuan 3 Queue: definisi, operasi, implementasi array & linked-list. |

## Ringkasan Coverage per template_topic

| Slug | # PDF di folder ini | Termasuk Mushthofa Rev (di `docs/`) |
|---|---|---|
| `mengenal-algoritma` | 3 | + 1 = 4 |
| `struktur-kendali` | 3 | + 1 = 4 |
| `memilih-algoritma` | 4 | + 1 = 5 |
| `struktur-data` | 4 | + 1 = 5 |

> Catatan: Mushthofa Rev dapat di-tag ke **4 topik** sekaligus (single PDF, multi-topic via `template_topics VARCHAR[]`).

## Status Validasi & Lisensi

Semua PDF di folder ini diunduh dari repositori akademik resmi (`.ac.id`, `sch.id`, atau mirror domain Kemdikbud) — **tidak ada PDF berbayar atau yang dikunci paywall**. Sebelum upload ke production:

- [ ] Verifikasi ulang isi PDF (page-by-page) — pastikan tidak ada error encoding atau halaman kosong.
- [ ] Set `materials.validation_status='draft'` saat upload pertama; ubah ke `'validated'` setelah peneliti review.
- [ ] Cantumkan citation/atribusi penulis & institusi di metadata `materials.author` + `materials.source_url`.
- [ ] Beberapa file kecil (Queue PENS 54 KB, Queue UNIKOM 31 KB) adalah handout slide; gunakan sebagai pelengkap, bukan sumber primer untuk topik tersebut.

## Sumber yang Tidak Berhasil Diunduh (dokumentasi untuk retry manual)

| URL | Alasan | Alternatif yang dipakai |
|---|---|---|
| `https://static.buku.kemdikbud.go.id/.../Informatika-BG-KLS-X.pdf` | DNS gagal resolve dari jaringan ini | Mirror `sman20-jkt.sch.id` (versi Rev) |
| `https://repository.uinsu.ac.id/.../Diktat%20Struktur%20Data.pdf` | Server timeout berulang | Diktat UNIKOM + Bina Darma |
| `https://repository.bsi.ac.id/.../MODUL-LOGIKA-DAN-ALGORITMA.pdf` | Halaman butuh autentikasi (returns HTML) | Modul Nusa Mandiri + Diktat Algo II UIN SU (gagal juga) → UNIKOM Percabangan + UNIKOM Perulangan |

## Catatan untuk Eksekusi Item 3-4

- Saat upload PDF via admin uploader, **target chunk per file**: ~50-150 chunks (tergantung halaman). Total estimasi: 14 file × 80 chunks ≈ 1.120 chunks → ~1.7 M token embedding → **biaya ~$0.035** (`text-embedding-3-small`).
- Setelah upload, jalankan query validasi: tiap `template_topic` harus punya **minimal 10 chunks tervalidasi** (sesuai DoD di W4).
- Untuk QA cache lock (Item 4b), peneliti dapat menggunakan halaman buku dalam PDF sebagai ground truth saat mereview konten AI-generated.
