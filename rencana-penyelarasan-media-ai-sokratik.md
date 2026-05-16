# Rencana Penyelarasan Media AI Sokratik Berbasis Sumber

Dokumen ini dibuat untuk menyamakan persepsi setelah membaca hasil audit pada `audit-media-ai-sokratik.md`. Fokus dokumen ini bukan mengulang audit, tetapi menerjemahkan temuan audit menjadi daftar kekurangan, fitur yang harus ditambahkan, fitur yang harus dioptimalkan, dan prioritas revisi agar media selaras dengan arah tesis terbaru.

## 1. Keputusan Arah

Media harus disesuaikan dengan tesis, bukan tesis yang diturunkan agar mengikuti media lama.

Alasannya:

- Judul tesis sudah mengikat media sebagai "AI Sokratik berbasis sumber".
- Masalah utama tesis adalah ketergantungan AI/copy-paste dan kesulitan belajar algoritma.
- Produk akhir tesis terdiri atas media pembelajaran dan kerangka/prinsip desain sistem AI untuk pembelajaran algoritma.
- Jika media tetap menjadi tutor AI umum/adaptif tanpa sumber dan tanpa perilaku Sokratik, klaim tesis menjadi lemah.

Target akhir media:

> Media pembelajaran AI Sokratik berbasis sumber untuk pembelajaran algoritma pemrograman Fase E yang membimbing siswa melalui dialog, membatasi respons AI pada sumber tervalidasi, mencatat episode prompt-respons-revisi, dan menghasilkan data untuk analisis perkembangan struktur prompt, computational thinking, dan critical thinking.

## 2. Ringkasan Kondisi Saat Ini

| Area | Kondisi Saat Ini | Dampak terhadap Tesis |
|---|---|---|
| Analitik riset | Sudah kuat: klasifikasi prompt, dashboard, ekspor, triangulasi, sesi belajar | Mendukung RM2 dan sebagian RM3 |
| AI Sokratik | Belum konsisten; beberapa endpoint masih memberi jawaban langsung | Klaim "Sokratik" belum aman |
| Berbasis sumber | Belum ada bank sumber, RAG, citation, atau pembatas jawaban berbasis materi | Klaim "berbasis sumber" belum terpenuhi |
| Pembatasan algoritma | Topik masih bebas, belum ada whitelist Fase E | Data riset bisa tercampur topik non-algoritma |
| Artefak solusi | Skema ada, tetapi belum operasional; belum ada editor pseudocode siswa | Analisis CT/CrT kurang kuat |
| Revisi prompt | Sebagian ada via follow-up, tetapi belum menjadi data delta revisi yang eksplisit | Analisis episode prompt-respons-revisi belum rapi |
| Reliabilitas coding | Inter-rater reliability belum dijalankan | Validitas metodologis analisis prompt/CT/CrT belum kuat |

## 3. Prinsip Penyelarasan

Semua revisi harus mengikuti prinsip berikut.

1. Media tidak boleh menjadi chatbot bebas.
2. AI harus membantu siswa berpikir, bukan langsung mengambil alih jawaban.
3. Respons AI harus ditopang oleh sumber materi yang tervalidasi.
4. Scope materi harus dibatasi pada algoritma pemrograman Fase E.
5. Setiap interaksi penting harus tercatat sebagai data riset.
6. Data harus dapat dibaca sebagai episode: prompt siswa -> respons AI -> revisi prompt -> artefak solusi.
7. Produk media harus menghasilkan bahan untuk produk konseptual: prinsip desain AI Sokratik berbasis sumber.

## 4. Fitur yang Harus Ditambahkan

### 4.1 Fitur Sumber Materi Tervalidasi

Ini adalah prioritas tertinggi karena menjadi dasar klaim "berbasis sumber".

| Kebutuhan | Yang Harus Ditambahkan | Keterangan |
|---|---|---|
| Bank materi | Tabel/fitur `materials` atau `sources` | Berisi materi algoritma yang sudah divalidasi guru/peneliti |
| Chunk materi | Tabel `material_chunks` | Materi dipecah menjadi bagian kecil agar bisa dirujuk AI |
| Metadata sumber | Judul, topik, level, penulis/sumber, versi, status validasi | Agar sumber bisa diaudit |
| Citation | Setiap respons AI menyimpan `cited_material_chunk_ids` | Bukti bahwa jawaban AI berbasis sumber |
| Fallback sumber | AI menyatakan sumber tidak cukup jika materi tidak tersedia | Mencegah halusinasi |
| Admin source manager | UI admin untuk menambah, mengedit, mengaktifkan, dan menonaktifkan sumber | Guru/peneliti bisa mengelola materi |

Topik minimal yang perlu tersedia:

- konsep algoritma
- input, proses, output
- pseudocode
- percabangan
- perulangan
- tracing
- debugging sederhana
- evaluasi solusi algoritmik

### 4.2 Fitur Pembatasan Domain Algoritma

Media harus memastikan siswa tidak membuat atau menjalankan pembelajaran di luar scope tesis.

| Kebutuhan | Yang Harus Ditambahkan | Keterangan |
|---|---|---|
| Whitelist topik | Daftar topik algoritma Fase E yang diizinkan | Dipakai saat membuat course dan saat bertanya ke AI |
| Validator topik | Validasi backend pada `generate-course` dan endpoint AI | Topik non-algoritma ditolak atau diarahkan ulang |
| Pesan redirect | Respons ramah saat pertanyaan di luar scope | Contoh: "Materi itu di luar cakupan, mari kembali ke pseudocode/perulangan..." |
| Label topik | Setiap sesi/prompt memiliki metadata topik | Memudahkan analisis data |

### 4.3 Fitur AI Sokratik

Perilaku AI harus menjadi inti media, bukan fitur tambahan.

| Kebutuhan | Yang Harus Ditambahkan/Diubah | Keterangan |
|---|---|---|
| System prompt Sokratik | Rewrite system prompt utama `ask-question` dan `challenge-feedback` | AI tidak langsung memberi jawaban akhir |
| Tahan-jawab | Aturan bahwa AI tidak memberi solusi final di awal | Khusus ketika siswa meminta jawaban langsung |
| Pertanyaan diagnostik | AI menanyakan tujuan, input-output, asumsi, atau langkah awal | Membantu siswa mulai berpikir |
| Hint bertahap | Level hint 1, 2, 3 | Dari arahan umum ke bantuan lebih konkret |
| Closing reflective question | Setiap respons diakhiri pertanyaan/tugas kecil | Mendorong revisi prompt atau solusi |
| Level-aware response | Respons berbeda untuk pemula, berkembang, lanjut | Scaffolding harus sesuai level |
| Anti-copy-paste policy | AI menolak permintaan "langsung jawab saja" secara pedagogis | Tidak menolak kasar, tetapi mengarahkan proses |

Contoh perilaku target:

- Jika siswa meminta jawaban langsung, AI meminta siswa menyebutkan input-output terlebih dahulu.
- Jika siswa bingung, AI memberi hint pertama, bukan seluruh solusi.
- Jika siswa sudah punya pseudocode, AI membimbing tracing/debugging.
- Jika siswa bertanya di luar sumber, AI menyatakan keterbatasan sumber dan mengarahkan ke materi yang tersedia.

### 4.4 Fitur Siswa/User

Fitur siswa harus diarahkan pada proses belajar algoritmik, bukan sekadar konsumsi jawaban AI.

| Fitur | Status Target | Keterangan |
|---|---|---|
| Prompt Builder algoritmik | Tambahkan template khusus IPO, pseudocode, tracing, debugging | Membimbing struktur prompt siswa |
| Mode revisi prompt | Siswa dapat merevisi prompt sebelumnya | Revisi harus tercatat sebagai data |
| Tombol "Minta Hint Berikutnya" | Tambahkan hint tier | Mencegah AI memberi semua bantuan sekaligus |
| Pseudocode Editor | Tambahkan editor khusus artefak solusi | Artefak disimpan untuk analisis CT |
| Submit artefak solusi | Simpan pseudocode/solusi ke `research_artifacts` | Terhubung ke sesi dan prompt terkait |
| Riwayat episode | Tampilkan prompt, respons AI, revisi, artefak | Membantu refleksi siswa |
| Refleksi akhir sesi | Pertanyaan reflektif tentang strategi bertanya dan pemahaman | Mendukung analisis regulasi diri |

### 4.5 Fitur Guru/Admin

Admin/guru harus dapat mengendalikan konten, scope, dan data.

| Fitur | Yang Harus Ada | Prioritas |
|---|---|---|
| Manajemen sumber materi | CRUD materi, topik, chunk, status validasi | P0 |
| Manajemen topik Fase E | Whitelist/aktif-nonaktif topik | P0 |
| Monitoring respons AI | Melihat respons AI beserta sumber yang dirujuk | P0 |
| Monitoring artefak siswa | Melihat pseudocode/solusi siswa | P0 |
| Pengaturan scaffolding | Menentukan mode bantuan ringan/sedang/intensif | P1 |
| Ekspor data per-prompt | Ekspor prompt, respons, revisi, sumber, scaffold tier, artefak | P0 |
| Dashboard readiness riset | Status sumber, logging, IRR, artefak, CT/CrT scoring | P1 |

### 4.6 Fitur Peneliti/Admin Riset

Karena media dipakai untuk tesis, data riset harus eksplisit dan siap dianalisis.

| Data/Fitur | Yang Harus Ditambahkan | Fungsi |
|---|---|---|
| `participant_code` | Kode anonim seperti S001, S002 | Ekspor data aman |
| `prompt_revisions` aktif | Simpan previous prompt, current prompt, revision type, stage change | Analisis perkembangan prompt |
| `prompt_episodes` view | View/tabel episode prompt-respons-revisi | Menjawab rumusan masalah secara langsung |
| `scaffold_tier` | Simpan level hint/bantuan | Membaca peran scaffolding |
| `cited_material_chunk_ids` | Simpan sumber yang dirujuk AI | Audit berbasis sumber |
| `research_artifacts` aktif | Simpan pseudocode/solusi siswa | Bukti CT/CrT |
| `model_name` dan `prompt_template_version` | Metadata respons AI | Reproducibility |
| `consent_given_at` dan `consent_version` | Audit etika | Bukti persetujuan riset |
| IRR workflow | Double coding 25% sampel, Po, kappa | Validitas coding |

## 5. Fitur yang Harus Dioptimalkan

Tidak semua fitur perlu dibuat dari nol. Beberapa fitur sudah ada, tetapi harus diarahkan ulang.

| Fitur Saat Ini | Masalah | Optimasi yang Diperlukan |
|---|---|---|
| PromptTimeline | Sudah ada, tetapi belum kuat sebagai episode prompt-respons-revisi | Tambahkan grouping episode dan hubungan respons AI -> revisi prompt |
| PromptBuilder | Sudah ada, tetapi belum spesifik algoritma | Tambahkan template IPO, tracing, debugging, evaluasi solusi |
| AskQuestion | Sudah ada, tetapi respons cenderung langsung menjawab | Ubah system prompt menjadi Sokratik berbasis sumber |
| ChallengeThinking | Sudah lebih dekat ke Sokratik | Tambahkan citation, domain guard, dan reflective closing |
| Admin dashboard | Sudah kuat untuk analitik | Tambahkan readiness indikator: sumber, artefak, IRR, citation coverage |
| Export riset | Sudah ada untuk agregat | Tambahkan ekspor granular per-prompt dan per-episode |
| Cognitive scoring | Sudah ada sebagian | Jalankan untuk semua prompt dan validasi manual 25% |
| Triangulasi | Sudah tersedia | Hubungkan dengan artefak solusi dan episode prompt |

## 6. Prioritas Revisi

### P0 - Wajib Sebelum Uji Lapangan

P0 adalah fitur minimum agar media layak disebut AI Sokratik berbasis sumber.

| No | Revisi | Alasan |
|---|---|---|
| 1 | Rewrite system prompt AI menjadi Sokratik | Menjawab kritik dosen tentang respons AI harus Sokratik |
| 2 | Tambahkan domain guard algoritma Fase E | Menjaga scope tesis |
| 3 | Buat bank sumber tervalidasi | Menopang klaim berbasis sumber |
| 4 | Tambahkan RAG/source injection sederhana | Membuat AI menjawab dari materi |
| 5 | Tambahkan citation/source logging | Membuktikan respons AI berbasis sumber |
| 6 | Tambahkan PseudocodeEditor | Menghasilkan artefak solusi untuk CT |
| 7 | Aktifkan logging prompt-respons-revisi | Menjawab RM perkembangan struktur prompt |
| 8 | Tambahkan ekspor per-prompt/per-episode | Memudahkan analisis tesis |
| 9 | Jalankan IRR minimal 25% sampel | Menjaga validitas coding |

### P1 - Sangat Disarankan Setelah P0

| No | Revisi | Alasan |
|---|---|---|
| 1 | Tambahkan hint tier 1-3 | Membuat scaffolding lebih terukur |
| 2 | Tambahkan admin scaffolding policy | Guru dapat mengatur intensitas bantuan |
| 3 | Tambahkan readiness dashboard | Memastikan media siap riset |
| 4 | Tambahkan prompt episode view | Memudahkan analisis dialog |
| 5 | Tambahkan semantic validation untuk klasifikasi prompt | Mengurangi kelemahan regex |

### P2 - Pendukung Akademik dan Etika

| No | Revisi | Alasan |
|---|---|---|
| 1 | Tambahkan participant code | Anonimisasi data |
| 2 | Tambahkan consent audit trail | Etika penelitian |
| 3 | Tambahkan prompt template version | Reproducibility |
| 4 | Tambahkan model metadata | Audit eksperimen AI |
| 5 | Rapikan bahasa respons AI | Konsistensi analisis teks |

## 7. Spesifikasi Prompt AI yang Harus Digunakan

System prompt utama media harus memuat aturan berikut.

```text
Anda adalah tutor AI Sokratik berbasis sumber untuk pembelajaran algoritma pemrograman siswa SMA Fase E.

Tugas Anda bukan memberikan jawaban akhir secara langsung, tetapi membimbing siswa membangun penalaran algoritmik secara bertahap.

Gunakan hanya sumber materi yang diberikan sistem. Jika sumber tidak memuat informasi yang diminta siswa, jangan mengarang. Sampaikan bahwa materi belum tersedia dalam sumber dan arahkan siswa kembali ke konsep algoritma yang relevan.

Cakupan materi:
- konsep algoritma
- input, proses, output
- pseudocode
- percabangan
- perulangan
- tracing
- debugging sederhana
- evaluasi solusi algoritmik

Aturan respons:
1. Identifikasi maksud pertanyaan siswa secara singkat.
2. Jika siswa meminta jawaban langsung, jangan langsung memberi solusi akhir.
3. Ajukan pertanyaan penuntun tentang tujuan, input-output, asumsi, atau langkah awal.
4. Berikan hint bertahap sesuai kebutuhan siswa.
5. Minta siswa menjelaskan alasan atau menelusuri langkah.
6. Jika siswa sudah punya solusi, bantu tracing/debugging, bukan mengambil alih semua pekerjaan.
7. Sesuaikan bantuan dengan level siswa: pemula, berkembang, atau lanjut.
8. Akhiri respons dengan pertanyaan reflektif atau tugas kecil.
9. Sertakan rujukan sumber jika memberikan konsep faktual.
10. Jika pertanyaan di luar cakupan, arahkan kembali ke materi algoritma Fase E.
```

## 8. Kriteria Selesai

Media dianggap sudah selaras dengan tesis jika semua kriteria berikut terpenuhi.

### 8.1 Kriteria Produk 1: Media Pembelajaran

| Kriteria | Status Target |
|---|---|
| Media memiliki sumber materi tervalidasi | Wajib |
| AI menjawab berbasis sumber | Wajib |
| AI memiliki citation/log sumber | Wajib |
| AI tidak langsung memberi jawaban akhir | Wajib |
| AI memberi pertanyaan penuntun/hint/refleksi | Wajib |
| Scope dibatasi pada algoritma Fase E | Wajib |
| Siswa dapat membuat/revisi prompt | Wajib |
| Siswa dapat membuat artefak pseudocode | Wajib |
| Sistem menyimpan prompt-respons-revisi | Wajib |
| Admin dapat mengekspor data riset | Wajib |

### 8.2 Kriteria Produk 2: Kerangka/Prinsip Desain

Produk konseptual tesis dapat disusun jika media menghasilkan bukti untuk komponen berikut.

| Komponen Prinsip Desain | Bukti dari Media |
|---|---|
| Prinsip sumber tervalidasi | Bank materi, citation, source logging |
| Prinsip respons Sokratik | System prompt, hasil respons AI, rubrik keterlaksanaan |
| Prinsip scaffolding adaptif | Level siswa, hint tier, scaffold logging |
| Prinsip pembatasan domain | Topic whitelist, domain guard |
| Prinsip jejak belajar | Prompt, respons, revisi, timestamp, episode |
| Prinsip artefak algoritmik | Pseudocode/solusi siswa |
| Prinsip analisis perkembangan prompt | SCP, SRP, MQP, Reflektif |
| Prinsip analisis CT/CrT | Coding indikator dan artefak pendukung |

## 9. Urutan Implementasi yang Disarankan

Urutan ini dibuat agar revisi cepat menghasilkan media yang sah secara akademik.

1. Kunci scope algoritma Fase E.
2. Rewrite system prompt menjadi Sokratik.
3. Buat bank sumber minimal.
4. Hubungkan AI dengan sumber dan citation.
5. Tambahkan PseudocodeEditor.
6. Aktifkan prompt revision logging.
7. Tambahkan scaffold tier/hint tier.
8. Tambahkan ekspor per-prompt/per-episode.
9. Jalankan CT/CrT scoring untuk semua prompt.
10. Jalankan IRR dan simpan hasilnya.
11. Tambahkan admin readiness dashboard.
12. Tambahkan fitur etika: participant code dan consent.

## 10. Minimum Viable Revision

Jika waktu terbatas, jangan mengejar semua fitur. Fokus pada revisi minimum berikut.

1. Domain guard algoritma Fase E.
2. Bank sumber materi tervalidasi.
3. System prompt AI Sokratik.
4. Citation/source logging.
5. PseudocodeEditor.
6. Prompt-respons-revisi logging.
7. Export data per-prompt.
8. IRR minimal 25% sampel.

Dengan delapan hal ini, media sudah cukup kuat untuk diklaim sebagai media AI Sokratik berbasis sumber dan cukup mendukung kebutuhan metodologis tesis.

## 11. Risiko Jika Tidak Direvisi

| Gap yang Dibiarkan | Risiko Akademik |
|---|---|
| Tidak ada sumber tervalidasi | Judul "berbasis sumber" tidak terbukti |
| AI memberi jawaban langsung | Klaim Sokratik lemah |
| Topik bebas | Data tidak spesifik algoritma |
| Tidak ada pseudocode artifact | Analisis CT terlalu bergantung pada prompt |
| Tidak ada IRR | Coding perkembangan prompt kurang reliabel |
| Tidak ada prompt episode | Rumusan prompt-respons-revisi sulit dibuktikan |
| Tidak ada citation | Respons AI tidak dapat diaudit |

## 12. Narasi Penyelarasan untuk Developer/Agent

Gunakan narasi berikut sebagai pegangan kerja:

> Media saat ini sudah memiliki fondasi dashboard, logging, klasifikasi prompt, dan analitik riset yang kuat. Namun, media belum sepenuhnya sesuai dengan tesis karena perilaku AI belum konsisten Sokratik, belum ada sumber materi tervalidasi, belum ada pembatas domain algoritma Fase E, dan belum ada artefak pseudocode operasional. Revisi harus memprioritaskan perubahan inti pedagogis dan evidensi riset: AI harus menjawab dari sumber, membimbing secara Sokratik, mencatat episode prompt-respons-revisi, dan menghasilkan data artefak solusi. Fitur lama tidak perlu dibuang, tetapi harus diarahkan ulang agar mendukung media AI Sokratik berbasis sumber.

## 13. Kesimpulan

Yang kurang bukan terutama dashboard atau analitik, karena bagian itu justru sudah relatif kuat. Kekurangan utama ada pada inti "obat" tesis:

1. AI belum benar-benar Sokratik.
2. AI belum berbasis sumber tervalidasi.
3. Media belum dibatasi secara ketat pada algoritma Fase E.
4. Artefak solusi/pseudocode belum operasional.
5. Episode prompt-respons-revisi belum menjadi data eksplisit.

Karena itu, pengembangan berikutnya harus dimulai dari fitur pedagogis dan evidensi riset, bukan dari perluasan tampilan. Media harus dibuat menjadi lingkungan belajar yang memaksa AI berperan sebagai mitra berpikir berbasis sumber, bukan sekadar tutor AI yang menjawab cepat.
