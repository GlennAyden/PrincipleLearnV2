# Panduan Pengguna PrincipleLearn V3

**Platform Pembelajaran Adaptif Berbasis AI untuk Critical & Computational Thinking**

> Versi: 3.0 (Principle Learn)
> Audience: Mahasiswa peserta riset thesis
> Terakhir diperbarui: April 2026

---

## Daftar Isi

- [1. Selamat Datang](#1-selamat-datang)
- [2. Akun: Daftar, Login, Logout](#2-akun-daftar-login-logout)
- [3. Onboarding Pertama Kali](#3-onboarding-pertama-kali)
- [4. Dashboard](#4-dashboard)
- [5. Membuat Course Baru](#5-membuat-course-baru)
- [6. Belajar di dalam Course](#6-belajar-di-dalam-course)
- [7. Fitur Prompt Engineering](#7-fitur-prompt-engineering)
- [8. Refleksi dan Catatan](#8-refleksi-dan-catatan)
- [9. Bantuan di dalam Aplikasi: Help Drawer dan Product Tour](#9-bantuan-di-dalam-aplikasi-help-drawer-dan-product-tour)
- [10. Privasi dan Data Riset](#10-privasi-dan-data-riset)
- [11. Troubleshooting Umum](#11-troubleshooting-umum)
- [12. FAQ](#12-faq)
- [13. Glosarium](#13-glosarium)

---

## 1. Selamat Datang

### Apa itu PrincipleLearn?

PrincipleLearn adalah platform belajar adaptif berbasis AI. Setiap course dirakit khusus untukmu — sesuai topik, tujuan, level, dan gaya belajar — bukan satu kurikulum yang sama untuk semua orang. Di dalam setiap subtopic kamu mendapat penjelasan, contoh, kuis, tantangan berpikir kritis, dan tempat menulis refleksi.

### Untuk siapa panduan ini?

Panduan ini ditujukan untuk **mahasiswa peserta penelitian thesis** yang menggunakan PrincipleLearn sebagai media belajar. Tidak ada prasyarat teknis — kamu hanya perlu browser modern (Chrome, Edge, Firefox, atau Safari versi terbaru) dan koneksi internet.

### Apa yang akan kamu latih?

- **Critical Thinking (CT)** — kemampuan menganalisis, mempertanyakan, dan mengevaluasi informasi.
- **Computational Thinking (CTh)** — memecah masalah, melihat pola, abstraksi, dan menyusun langkah pemecahan.
- **Prompt Engineering** — kemampuan menyusun pertanyaan ke AI agar jawaban yang didapat berkualitas. Ini bagian inti dari riset.

> Catatan: Ada juga sisi admin (`/admin/login`) yang dipakai oleh peneliti untuk memantau aktivitas. Sebagai peserta, kamu tidak perlu membukanya.

---

## 2. Akun: Daftar, Login, Logout

### 2.1 Daftar (Signup)

1. Buka halaman utama, lalu klik tombol **Get Started** atau langsung ke `/signup`.
2. Isi formulir:
   - **Full Name** — nama lengkap (opsional).
   - **Email** — alamat email aktif (wajib).
   - **Password** — minimal 8 karakter (wajib).
3. Indikator kekuatan password akan muncul:
   - **Weak / Fair / Good / Strong** sesuai jumlah kriteria yang terpenuhi (panjang ≥ 8, huruf besar, huruf kecil, angka).
4. Klik **Create account**. Setelah berhasil, kamu otomatis login dan diarahkan ke onboarding.

> Screenshot: halaman-signup

Jika email sudah terdaftar, akan muncul pesan "An account with this email already exists." Coba login, atau gunakan email lain.

### 2.2 Login

1. Buka `/login`.
2. Isi email dan password yang sudah didaftarkan.
3. Centang **Remember me** kalau kamu memakai perangkat pribadi (sesi 7 hari). Kalau tidak dicentang, sesi berakhir setelah 2 jam.
4. Klik **Sign in**.

Setelah login, sistem otomatis memeriksa:
- Apakah profil belajar sudah dibuat? Kalau belum → diarahkan ke onboarding.
- Apakah slide pengenalan sudah ditonton? Kalau belum → diarahkan ke `/onboarding/intro`.
- Kalau dua-duanya selesai → masuk ke Dashboard.

> Screenshot: halaman-login

### 2.3 Logout

Klik **Log out** di pojok kanan atas Dashboard. Semua cookie sesi dihapus dan kamu kembali ke halaman login. Kalau kamu memakai perangkat bersama, selalu logout manual.

### 2.4 Lupa Password

Saat ini fitur reset password mandiri belum tersedia. Hubungi peneliti / admin untuk dibantu reset manual.

---

## 3. Onboarding Pertama Kali

Onboarding wajib diselesaikan sekali di awal. Ada **dua tahap** terpisah, dan keduanya harus tuntas sebelum kamu masuk ke Dashboard.

### Tahap 1 — Profil Belajar (`/onboarding`)

Wizard 3 langkah:

1. **Identitas**
   - Nama panggilan (minimal 2 karakter). Nama ini muncul di salam Dashboard.
2. **Gaya Belajar** — wajib dipilih.
   - Pengalaman pemrograman: Belum pernah / Pemula / Menengah / Mahir.
   - Gaya belajar favorit: Visual / Membaca / Praktik / Diskusi.
3. **Tujuan**
   - Tujuan belajar (opsional, tapi sangat membantu AI).
   - Tantangan terbesar (opsional).

Klik **Mulai Belajar** untuk menyimpan profil.

> Screenshot: onboarding-profil

### Tahap 2 — Slide Pengenalan (`/onboarding/intro`)

Setelah profil tersimpan, kamu otomatis diarahkan ke 4 slide pengenalan singkat. Slide ini menjelaskan:
- Apa itu PrincipleLearn dan kenapa dipersonalisasi.
- Cara belajar aktif (Tanya AI, Quiz, Challenge, Jurnal Refleksi).
- Alur belajar yang disarankan: buat course → pelajari subtopic → kuis & refleksi → diskusi modul.
- Tombol bantuan yang tersedia di setiap subtopic.

> Penting: Jangan tutup tab di tengah slide. Tekan **Lanjut** sampai slide terakhir, lalu **Mulai Belajar**. Slide ini hanya muncul sekali — kamu bisa memanggil panduan ulang lewat tombol bantuan di subtopic.

> Tip: Pastikan cookie aktif di browser. Status onboarding disimpan via cookie (`onboarding_done`, `intro_slides_done`) plus database. Kalau cookie diblokir, kamu bisa terus dilempar balik ke onboarding.

---

## 4. Dashboard

Dashboard (`/dashboard`) adalah pusat kontrol setelah login.

> Screenshot: dashboard

Yang ada di sana:
- **Salam personal** berdasarkan waktu hari (Good morning / afternoon / evening) plus nama panggilanmu.
- **Tombol Create Course** — biru, di sisi kanan atas konten utama. Klik untuk memulai pembuatan course baru.
- **Daftar course (My Courses)** — setiap kartu menampilkan:
  - Badge level (Beginner hijau, Intermediate biru, Advanced ungu).
  - Judul course (klik untuk membuka).
  - Tombol **Continue Learning**.
  - Menu titik tiga untuk menghapus course.
- **Empty state** — kalau belum ada course, muncul tombol **Create Your First Course**.

### Menghapus course

Klik titik tiga di kartu course → **Delete** untuk konfirmasi. Penghapusan **permanen** dan menghapus semua data terkait (kuis, jurnal, transkrip). Pikir dua kali sebelum menghapus.

---

## 5. Membuat Course Baru

Pembuatan course dilakukan dalam 3 langkah, ditandai indikator progress 1-2-3 di atas formulir. Kamu bisa kembali ke Dashboard kapan saja lewat link di pojok kiri atas (data form sementara disimpan di context React, jadi pindah halaman bisa kehilangan progress — sebaiknya selesaikan sekali jalan).

### Step 1 — Topik & Tujuan (`/request-course/step1`)

| Field | Wajib | Contoh |
|---|---|---|
| **Topic** | Ya | "Machine Learning", "Web Development", "Data Science" |
| **Learning Goal** | Ya | "Memahami konsep dasar neural network dan cara mengimplementasikannya" |

Klik **Continue**.

### Step 2 — Level & Sub-topik (`/request-course/step2`)

- **Level pengetahuan** — pilih satu kartu: Beginner, Intermediate, atau Advanced.
- **Specific topics to cover** (opsional) — sub-topik tertentu yang ingin dimasukkan, misalnya "Neural Networks, Transfer Learning, NLP".

Klik **Continue**.

### Step 3 — Konteks & Asumsi (`/request-course/step3`)

| Field | Wajib | Contoh |
|---|---|---|
| **Real-world problem** | Ya | "Saya ingin membuat sistem rekomendasi produk untuk toko online saya" |
| **Initial assumption** | Ya | "Saya pikir machine learning butuh data sangat besar dan mahal" |

Field ini sangat penting — AI memakainya untuk membuat course yang relevan dengan situasimu, dan jawaban kamu juga jadi data riset (lihat bagian 10).

Klik **Generate Course**.

### Proses Generating (`/request-course/generating`)

> Screenshot: generating

Kamu diarahkan ke halaman proses dengan progress bar dan timeline 5 tahap:
1. Sending Request
2. AI Processing (≈ 30–60 detik — AI sedang menyusun outline)
3. Processing Response
4. Saving Course
5. Complete!

Selama menunggu, tips edukasi berputar setiap 5 detik. **Jangan refresh** — kalau kamu refresh, request bisa terulang. Setelah selesai, kamu otomatis diarahkan ke halaman overview course.

Kalau muncul error, klik **Go back & try again** untuk kembali ke Step 3.

---

## 6. Belajar di dalam Course

### 6.1 Halaman Overview Course (`/course/[courseId]`)

Course terdiri dari beberapa **modul**. Setiap modul punya beberapa **subtopic**.

> Screenshot: course-overview

Setiap kartu subtopic menampilkan:
- Nomor (1.1, 1.2, ...).
- Judul.
- Ringkasan singkat (klik **Lihat detail** untuk mengembangkan).
- Tombol aksi: **Mulai Materi** (belum dibuka) atau **Lanjutkan Materi** (sudah pernah dibuka).

Untuk berpindah modul, gunakan navigasi modul di halaman (atau lewat URL `?module=N` di mana N dimulai dari 0).

### 6.2 Halaman Subtopic (`/course/[courseId]/subtopic/[subIdx]/[pageIdx]`)

Saat pertama kali dibuka, AI akan meng-generate konten subtopic. Tunggu sebentar — proses ini hanya berjalan sekali, hasilnya disimpan untuk berikutnya.

> Screenshot: subtopic-page

Alur halaman dalam satu subtopic:

```
Halaman Konten 1 → Halaman Konten 2 → ... → Key Takeaways → Quiz → Feedback & Next Steps
```

**Progress bar** berupa rangkaian titik di atas halaman menunjukkan posisimu. Tombol **Next** dan **Back** untuk navigasi.

### 6.3 Konten subtopic

Setiap halaman konten berisi:
- Judul halaman.
- Beberapa paragraf penjelasan AI.
- Tombol interaktif di bawah (lihat 6.4).

Baca runtut dari atas. Konten disesuaikan dengan level dan gaya belajar yang kamu set di onboarding.

### 6.4 Tombol interaktif: Examples, Ask Question, Challenge

Di setiap halaman konten ada tiga tombol:

#### a. Give Me Examples (Contoh)

- Klik untuk minta AI memberi contoh konkret atau analogi.
- Klik **Regenerate** untuk minta contoh baru.
- Navigasi panah kiri/kanan untuk melihat contoh sebelumnya yang sudah pernah digenerate. Indikator "Contoh ke-X dari Y" memperlihatkan posisi.

#### b. Ask Question (Tanya AI)

Tanya bebas tentang materi. Jawaban dialirkan secara streaming (mengetik real-time).

Tab Ask Question membuka **PromptBuilder** dengan dua mode:
- **Guided** (default) — terstruktur dengan field Tujuan, Konteks, dan Batasan (opsional). Setiap field punya chip cepat.
- **Simple** — langsung mengetik pertanyaan tanpa panduan.

Setelah jawaban selesai, kamu bisa menambahkan **Reasoning Note** (alasan kenapa kamu menanyakan itu) — penting untuk latihan refleksi dan jadi data riset.

Riwayat tanya-jawab ditampilkan di atas input. **Prompt Timeline** muncul di bawah setelah pertanyaan pertama (lihat bagian 7).

#### c. Challenge My Thinking

AI memberi pertanyaan tantangan berdasarkan materi:
1. Klik tab **Challenge My Thinking**.
2. AI generate pertanyaan otomatis. Klik **Regenerate** kalau ingin pertanyaan lain.
3. Tulis jawaban di "Type your answer here..."
4. (Opsional) Tulis alasan di "Why do you choose this answer?"
5. Klik **Submit**.

Kamu mendapat **feedback terstruktur** dari AI (kekuatan, area perbaikan, konsep kunci). Riwayat tantangan tersimpan di **Previous Challenges**.

### 6.5 Key Takeaways

Setelah semua halaman konten, muncul halaman **Key Takeaways** — ringkasan poin penting subtopic dalam format daftar. Bacalah ini sebagai kunci jawaban "apa yang seharusnya saya ingat."

> Screenshot: key-takeaways

### 6.6 Quiz

5 soal pilihan ganda untuk cek pemahaman.

> Screenshot: quiz

- Klik opsi untuk memilih jawaban.
- (Opsional, sangat disarankan) Tulis **Reasoning Note** di tiap soal — alasan memilih jawaban itu.
- Klik **Submit** kalau sudah yakin. Jawaban final, **tidak bisa diubah** setelah submit.
- Hasil ditampilkan langsung: hijau = benar, merah = salah (dengan jawaban yang seharusnya).
- Skor disimpan otomatis.

Kalau kuis terasa tidak relevan atau ada soal aneh, ada tombol **Regenerate** untuk meminta soal baru (sebelum submit).

### 6.7 Feedback & Next Steps

Halaman terakhir setiap subtopic punya tiga bagian:

**(a) What's Next** — ringkasan apa yang kamu pelajari dan motivasi untuk lanjut.

**(b) Structured Reflection** — formulir refleksi dengan 4 pertanyaan:

| Bagian | Pertanyaan |
|---|---|
| Apa yang Saya Pahami | Apa hal utama yang saya pahami hari ini? |
| Yang Masih Membingungkan | Apa yang masih salah atau membingungkan? |
| Strategi ke Depan | Apa strategi belajar saya selanjutnya? |
| Evolusi Cara Bertanya | Bagaimana cara saya bertanya berubah dari sesi sebelumnya? |

Plus rating konten (1–5 bintang) dan feedback tambahan (opsional). Klik **Simpan Refleksi & Feedback**.

> Screenshot: structured-reflection

**(c) Next Subtopics** — daftar subtopic berikutnya dalam modul yang sama. Klik salah satu untuk langsung ke sana, atau klik **Finish** untuk kembali ke overview course.

### 6.8 Diskusi modul (opsional)

Setiap modul memiliki kartu **Diskusi Penutup** di akhir daftar subtopic. Untuk thesis ini, modul Diskusi tersedia tapi **bukan komponen wajib** untuk peserta. Kalau peneliti tidak menginstruksikan kamu memakainya, fokuskan waktu di subtopic, kuis, dan refleksi. (Kalau diminta, peneliti akan memberi instruksi terpisah.)

---

## 7. Fitur Prompt Engineering

Salah satu hal paling penting yang dilatih di PrincipleLearn adalah **cara menyusun prompt yang baik**. Ini diukur dan dianalisis sebagai bagian riset.

### 7.1 PromptBuilder

Muncul di tab **Ask Question**. Mode default adalah **Guided** dengan tiga komponen:

| Komponen | Fungsi | Tips |
|---|---|---|
| **Tujuan** | Apa yang ingin kamu ketahui | Mulai dengan kata kerja: "Saya ingin memahami...", "Tolong jelaskan..." |
| **Konteks** | Apa yang sudah kamu tahu | Sebut sumber atau pemahaman awal: "Sejauh ini saya tahu bahwa..." |
| **Batasan** (opsional) | Format jawaban yang kamu inginkan | "Jelaskan untuk pemula", "Berikan analogi sehari-hari", "Dalam 3 poin" |

Chip cepat di setiap field bisa diklik untuk memulai kalimat. Mode **Simple** tetap tersedia kalau kamu sudah tahu mau tanya apa.

### 7.2 Prompt Timeline

Setelah satu pertanyaan dikirim, **Prompt Timeline** muncul di bawah area input. Timeline ini menunjukkan evolusi cara bertanyamu — komponen apa saja yang kamu pakai dari waktu ke waktu, dan bagaimana kualitas promptmu berkembang. Ini cermin dari kemajuanmu di skala stage prompt: SCP → SRP → MQP → Reflektif (lihat glosarium).

### 7.3 Tips menulis prompt yang baik

1. **Spesifik lebih baik daripada umum.** "Jelaskan apa itu deep learning" → "Jelaskan kenapa deep learning butuh banyak data, dengan contoh kasus dari NLP."
2. **Berikan konteks.** Sebut apa yang sudah kamu pahami supaya AI tidak mengulang dari nol.
3. **Sebutkan batasan output.** Kamu bisa minta format daftar, analogi, contoh, level bahasa tertentu.
4. **Tulis Reasoning Note.** Setelah dapat jawaban, catat alasan kenapa kamu bertanya itu — ini melatih metakognisi.
5. **Gunakan PromptBuilder Guided di awal.** Setelah terbiasa, kamu bisa pindah ke Simple — tapi struktur Guided membantu membentuk kebiasaan baik.

---

## 8. Refleksi dan Catatan

### 8.1 Structured Reflection (Jurnal)

Lihat 6.7. Tips menulis refleksi yang baik:
- **Jujur**, jangan tulis demi formalitas.
- **Konkret** — sebut konsep spesifik, bukan "saya paham semuanya".
- **Hubungkan dengan pengalaman** — kapan kamu pernah lihat ini di kehidupan nyata?
- **Tulis kebingungan dengan jelas** — ini sinyal berharga bagi diri sendiri (dan bagi peneliti).

### 8.2 Reasoning Note

Tersedia di:
- Setiap soal Quiz — alasan pilihan jawaban.
- Setelah jawaban Ask Question — alasan kenapa bertanya itu.
- Setelah Challenge feedback — refleksi atas feedback yang diterima.

Walaupun opsional, **isi sesering mungkin**. Reasoning Note adalah tempat kamu melatih dan menunjukkan critical thinking.

---

## 9. Bantuan di dalam Aplikasi: Help Drawer dan Product Tour

### 9.1 Help Drawer

Di setiap subtopic, ada tombol bantuan (biasanya berikon tanda tanya) yang membuka **drawer panduan kontekstual**. Drawer ini menjelaskan setiap fitur di halaman: Materi, Examples, Tanya AI, Quiz, Challenge, Refleksi, dst. Klik **Tunjukkan** pada item tertentu untuk scroll ke elemen yang dimaksud.

> Screenshot: help-drawer

Pakai Help Drawer kapan pun kamu ragu — lebih cepat daripada bertanya ke peneliti.

### 9.2 Product Tour

Saat pertama kali masuk ke beberapa halaman utama (Dashboard, halaman subtopic), **Product Tour** otomatis muncul dengan tooltip langkah demi langkah yang menunjuk elemen-elemen kunci. Ikuti sampai selesai untuk pemahaman cepat. Tour hanya muncul sekali per halaman; kamu bisa selalu kembali ke Help Drawer kalau lupa.

---

## 10. Privasi dan Data Riset

### Apa yang dicatat?

Sebagai bagian dari riset thesis, aktivitasmu di PrincipleLearn dicatat:
- Profil belajar (nama panggilan, level, gaya, tujuan, tantangan).
- Course dan subtopic yang kamu buka.
- Setiap pertanyaan ke AI (Ask Question) beserta komponen prompt.
- Setiap challenge yang dijawab dan feedback AI.
- Skor dan reasoning note di setiap kuis.
- Jurnal refleksi.
- Rating dan feedback konten.

### Bagaimana data dipakai?

Data dipakai untuk **analisis kuantitatif dan kualitatif** sesuai pertanyaan riset (RM2: kualitas prompt, RM3: indikator critical & computational thinking). Hasil analisis ditulis dalam thesis.

### Anonimisasi

Identitas personal (email, nama) **tidak ditampilkan** dalam laporan. Data dianonimisasi menggunakan ID internal sebelum dianalisis.

### Kontrol kamu

- Kamu bisa berhenti kapan saja — hubungi peneliti.
- Kamu bisa minta data kamu dihapus — hubungi peneliti.
- Cookie sesi otomatis dihapus saat logout.

### Kontak peneliti

Hubungi peneliti (admin sekaligus peneliti utama) lewat kanal komunikasi yang sudah disepakati di awal partisipasi (biasanya email atau WhatsApp).

---

## 11. Troubleshooting Umum

| Masalah | Yang harus dilakukan |
|---|---|
| **Stuck di onboarding, terus diarahkan balik** | Pastikan cookie diaktifkan di browser. Coba logout, login ulang. Kalau masih, hubungi peneliti — server flag mungkin perlu di-reset. |
| **AI loading lama (> 1 menit)** | Sabar, AI butuh waktu (terutama generate course pertama kali, 30–60 detik). **Jangan refresh** — request bisa terulang dan menghabiskan kuota. |
| **Quiz tidak muncul** | Coba tombol **Regenerate** di area kuis. Kalau masih kosong, refresh halaman sekali — soal tersimpan di database. |
| **Konten subtopic kosong / error** | Refresh halaman. Konten digenerate sekali dan disimpan; kalau gagal di percobaan pertama, biasanya percobaan kedua berhasil. |
| **Tidak bisa login** | Cek email dan password. Pastikan caps lock mati. Kalau lupa password, hubungi peneliti — fitur reset mandiri belum tersedia. |
| **Halaman blank / putih** | Refresh (Ctrl+R / Cmd+R). Kalau masih, buka DevTools (F12) → tab Console, screenshot error, kirim ke peneliti. |
| **Cookie / session error** | Clear cache & cookies di browser, lalu login ulang. |
| **Streaming jawaban Ask Question terhenti di tengah** | Tunggu beberapa detik. Kalau benar-benar mati, kirim ulang pertanyaan. Riwayat jawaban sebelumnya tetap tersimpan. |
| **Generate course gagal terus** | Coba topik yang lebih spesifik (bukan "AI" tapi "Convolutional Neural Networks untuk klasifikasi gambar"). Sistem juga punya rate limit (30 request/jam). Tunggu 5 menit, coba lagi. |
| **Notifikasi "session expired" muncul** | Token kamu kedaluwarsa. Login ulang. Kalau memilih "Remember me" saat login, sesi 7 hari. |

---

## 12. FAQ

**T: Apa itu Critical Thinking (CT)?**
J: Kemampuan menganalisis informasi secara objektif, mempertanyakan asumsi, dan menyusun argumen berdasar bukti. Di PrincipleLearn, CT dilatih lewat Challenge Thinking, Reasoning Note, dan Structured Reflection.

**T: Apa itu Computational Thinking (CTh)?**
J: Cara berpikir memecahkan masalah dengan: dekomposisi (memecah jadi bagian kecil), pengenalan pola, abstraksi, dan menyusun algoritma. Berguna jauh melampaui pemrograman.

**T: Apa beda Examples dengan Ask Question?**
J: **Examples** menampilkan contoh konkret/analogi yang relevan dengan paragraf yang sedang kamu baca, tanpa kamu harus mengetik. **Ask Question** untuk pertanyaan spesifik yang kamu rumuskan sendiri — lebih fleksibel tapi butuh prompt yang baik.

**T: Bisakah saya skip Quiz?**
J: Sebaiknya tidak. Skor kuis adalah salah satu sinyal pemahaman dalam riset. Selain itu, kamu jadi tahu di mana posisi pemahamanmu sebelum lanjut.

**T: Berapa lama 1 course?**
J: Sangat tergantung topik, level, dan kecepatan kamu. Kasaran: tiap subtopic 15–30 menit aktif (membaca + interaksi + kuis + refleksi). Course rata-rata punya beberapa modul, masing-masing 3–6 subtopic. Total bisa 4–10 jam — bisa dicicil banyak sesi.

**T: Apakah jawaban quiz bisa diubah setelah submit?**
J: Tidak. Final setelah klik Submit. Pikir baik-baik dulu.

**T: Apakah saya bisa membuat banyak course?**
J: Bisa, tidak ada batasan jumlah. Tapi sebaiknya selesaikan satu sebelum memulai berikutnya supaya fokus.

**T: Apakah PrincipleLearn bisa di HP?**
J: Bisa. Tampilan responsive. Untuk pengalaman terbaik (terutama Ask Question dan Challenge yang banyak menulis), laptop atau tablet lebih nyaman.

**T: Apa bedanya "Remember me" dicentang vs tidak?**
J: Dicentang → sesi 7 hari. Tidak dicentang → 2 jam atau saat browser ditutup. Pakai "Remember me" hanya di perangkat pribadi.

**T: Saya pernah baca dokumentasi yang menyebut Diskusi Modul. Wajib tidak?**
J: Untuk peserta riset thesis ini, modul Diskusi **tidak wajib**. Kalau peneliti memintamu memakainya, akan ada instruksi terpisah.

**T: Datanya disimpan di mana?**
J: Di database Supabase (PostgreSQL) yang dikelola peneliti. Akses dibatasi dengan otentikasi dan RLS (row-level security). Lihat bagian 10 untuk detail.

**T: Saya nemu bug. Lapor ke siapa?**
J: Hubungi peneliti. Sertakan: halaman/URL, langkah reproduksi, screenshot error (kalau ada), jam kejadian. Itu sangat membantu debugging.

---

## 13. Glosarium

| Istilah | Arti |
|---|---|
| **Course** | Satu unit pembelajaran lengkap pada satu topik. Terdiri dari beberapa modul. |
| **Modul** | Bagian besar dalam course. Berisi beberapa subtopic. |
| **Subtopic** | Unit terkecil pembelajaran. Punya konten, examples, ask question, challenge, kuis, dan refleksi. |
| **Leaf subtopic** | Subtopic yang bisa diakses langsung (tidak punya anak). Lawannya: subtopic kontainer. |
| **Quiz** | 5 soal pilihan ganda di akhir setiap subtopic. |
| **Reasoning Note** | Catatan alasan singkat — kenapa pilih jawaban tertentu, kenapa bertanya itu. |
| **Structured Reflection** | Jurnal refleksi terstruktur 4 pertanyaan di akhir subtopic. |
| **Key Takeaways** | Ringkasan poin penting subtopic. |
| **PromptBuilder** | Alat bantu menyusun pertanyaan AI dengan komponen Tujuan / Konteks / Batasan. |
| **Prompt Timeline** | Visualisasi evolusi cara kamu menyusun prompt dari waktu ke waktu. |
| **Help Drawer** | Drawer panduan kontekstual yang dibuka dari tombol bantuan di subtopic. |
| **Product Tour** | Tour interaktif tooltip yang muncul sekali di halaman utama. |
| **Onboarding** | Proses setup awal: profil belajar + slide pengenalan. Wajib selesai sekali. |
| **CT (Critical Thinking)** | Berpikir kritis: analisis, evaluasi, sintesis informasi. |
| **CTh (Computational Thinking)** | Berpikir komputasional: dekomposisi, pengenalan pola, abstraksi, algoritma. |
| **SCP** | Simple Copy-Paste — tahap prompt paling dasar. |
| **SRP** | Structured Prompt — prompt mulai terstruktur. |
| **MQP** | Multi-Quality Prompt — prompt menyertakan konteks dan batasan. |
| **Reflektif** | Tahap prompt tertinggi — pertanyaan disertai refleksi dan evaluasi diri. |

---

*Panduan ini bagian dari dokumentasi PrincipleLearn V3 untuk peserta riset thesis. Kalau ada bagian yang kurang jelas atau perlu ditambahkan, beri tahu peneliti.*
