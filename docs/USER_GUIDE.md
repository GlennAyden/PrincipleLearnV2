# Manual Pengguna PrincipleLearn V3

**Platform Pembelajaran Adaptif Berbasis AI**

> Versi: 3.0  
> Terakhir diperbarui: April 2026

---

## Daftar Isi

- [1. Pendahuluan](#1-pendahuluan)
- [2. Panduan Pengguna (Mahasiswa)](#2-panduan-pengguna-mahasiswa)
  - [2.1 Registrasi Akun Baru](#21-registrasi-akun-baru)
  - [2.2 Login](#22-login)
  - [2.3 Onboarding (Pengaturan Profil Belajar)](#23-onboarding-pengaturan-profil-belajar)
  - [2.4 Dashboard](#24-dashboard)
  - [2.5 Membuat Kursus Baru](#25-membuat-kursus-baru)
  - [2.6 Halaman Overview Kursus](#26-halaman-overview-kursus)
  - [2.7 Mempelajari Subtopik (Halaman Materi)](#27-mempelajari-subtopik-halaman-materi)
  - [2.8 Fitur Interaktif saat Belajar](#28-fitur-interaktif-saat-belajar)
  - [2.9 Diskusi Penutup Modul (Metode Socratic)](#29-diskusi-penutup-modul-metode-socratic)
  - [2.10 Logout](#210-logout)
- [3. Panduan Administrator](#3-panduan-administrator)
  - [3.1 Login Admin](#31-login-admin)
  - [3.2 Dashboard Admin](#32-dashboard-admin)
  - [3.3 Manajemen Mahasiswa](#33-manajemen-mahasiswa)
  - [3.4 Manajemen Diskusi](#34-manajemen-diskusi)
  - [3.5 Insights](#35-insights)
  - [3.6 Research Dashboard](#36-research-dashboard)
  - [3.7 Activity Log](#37-activity-log)
  - [3.8 Registrasi Admin Baru](#38-registrasi-admin-baru)
- [4. Tips dan Pertanyaan Umum (FAQ)](#4-tips-dan-pertanyaan-umum-faq)

---

## 1. Pendahuluan

### Apa itu PrincipleLearn V3?

PrincipleLearn V3 adalah **platform pembelajaran adaptif berbasis kecerdasan buatan (AI)** yang dirancang untuk mendukung pengembangan **Critical Thinking (CT)** dan **Computational Thinking (CTh)** pada mahasiswa. Platform ini dikembangkan sebagai bagian dari penelitian thesis di bidang teknologi pendidikan.

### Tujuan Platform

- Menyediakan pengalaman belajar yang **dipersonalisasi** berdasarkan profil dan kebutuhan setiap mahasiswa.
- Mendorong kemampuan **berpikir kritis** melalui fitur-fitur interaktif seperti Challenge Thinking, diskusi Socratic, dan refleksi terstruktur.
- Memantau perkembangan kemampuan **prompt engineering** mahasiswa, dari tahap Simple Copy-Paste (SCP) hingga tahap Reflektif.
- Menyediakan **dashboard penelitian** bagi administrator untuk menganalisis data pembelajaran secara komprehensif.

### Teknologi yang Digunakan

| Komponen | Teknologi |
|---|---|
| Framework | Next.js 15 (App Router) |
| Frontend | React 19, TypeScript, Sass Modules |
| Database | Supabase (PostgreSQL) |
| AI | OpenAI API |
| Autentikasi | JWT + CSRF double-submit cookie |
| Deployment | Vercel |

### Peran Pengguna

PrincipleLearn V3 memiliki dua peran pengguna:

1. **Mahasiswa (User)** -- Pengguna utama yang belajar melalui kursus yang digenerate oleh AI.
2. **Administrator (Admin)** -- Pengelola platform yang memantau aktivitas mahasiswa dan menganalisis data penelitian.

---

## 2. Panduan Pengguna (Mahasiswa)

### 2.1 Registrasi Akun Baru

Untuk mulai menggunakan PrincipleLearn, Anda perlu membuat akun terlebih dahulu.

**Langkah-langkah:**

1. Buka halaman utama PrincipleLearn, lalu klik tombol **"Get Started"** di pojok kanan atas.
2. Di halaman login, klik link **"Create an account"** di bagian bawah.
3. Anda akan diarahkan ke halaman registrasi (`/signup`).

[Screenshot: halaman-registrasi]

4. Isi formulir registrasi berikut:

| Field | Keterangan |
|---|---|
| **Full Name** | Nama lengkap Anda (opsional, boleh dikosongkan) |
| **Email** | Alamat email yang valid (wajib) |
| **Password** | Password minimal 8 karakter (wajib) |

5. Perhatikan **indikator kekuatan password** yang muncul saat Anda mengetik password:

| Level | Keterangan |
|---|---|
| **Weak** (Merah) | Hanya memenuhi 1 kriteria |
| **Fair** (Oranye) | Memenuhi 2 kriteria |
| **Good** (Kuning) | Memenuhi 3 kriteria |
| **Strong** (Hijau) | Memenuhi semua 4 kriteria |

   Kriteria password yang diperiksa:
   - Panjang minimal 8 karakter
   - Mengandung huruf besar (A-Z)
   - Mengandung huruf kecil (a-z)
   - Mengandung angka (0-9)

6. Klik tombol mata di sebelah kanan field password untuk melihat/menyembunyikan password yang Anda ketik.
7. Klik tombol **"Create account"** untuk mendaftar.
8. Setelah registrasi berhasil, Anda akan **otomatis login** dan diarahkan ke halaman Onboarding.

> **Catatan:** Jika email sudah terdaftar, akan muncul pesan error "An account with this email already exists."

---

### 2.2 Login

Jika Anda sudah memiliki akun, Anda bisa langsung login.

**Langkah-langkah:**

1. Buka halaman login (`/login`).
2. Masukkan **email** dan **password** yang sudah didaftarkan.

[Screenshot: halaman-login]

3. **Opsi "Remember me":** Centang opsi ini jika Anda ingin tetap login selama 7 hari. Jika tidak dicentang, sesi akan berakhir setelah 2 jam.
4. Klik tombol **"Sign in"**.
5. Sistem akan memeriksa beberapa hal secara otomatis:
   - Apakah profil belajar sudah dibuat? Jika belum, Anda diarahkan ke halaman Onboarding.
   - Apakah sudah ada kursus? Jika belum, Anda diarahkan ke halaman pembuatan kursus baru.
   - Jika keduanya sudah ada, Anda masuk ke Dashboard.

> **Catatan tentang Token:** Sistem menggunakan token autentikasi yang akan otomatis di-refresh ketika hampir kedaluwarsa. Anda tidak perlu melakukan apa pun secara manual -- proses ini berlangsung di balik layar.

---

### 2.3 Onboarding (Pengaturan Profil Belajar)

Halaman onboarding (`/onboarding`) adalah proses pengaturan profil yang hanya dilakukan **satu kali** setelah registrasi. Informasi yang Anda berikan akan membantu AI menyesuaikan konten pembelajaran.

[Screenshot: halaman-onboarding]

Onboarding terdiri dari **3 langkah** yang ditunjukkan oleh indikator progress di atas formulir:

#### Langkah 1: Identitas

- Masukkan **Nama Panggilan** (minimal 2 karakter).
- Nama ini akan ditampilkan di seluruh aplikasi (misalnya di salam pembuka di Dashboard).
- Contoh: "Budi", "Sarah", "Dika".

#### Langkah 2: Gaya Belajar

**Pengalaman Pemrograman** -- Pilih salah satu:

| Pilihan | Keterangan |
|---|---|
| Belum pernah | Baru pertama kali belajar pemrograman |
| Pemula | Pernah belajar sedikit (kurang dari 6 bulan) |
| Menengah | Sudah punya pengalaman (6-24 bulan) |
| Mahir | Berpengalaman (lebih dari 2 tahun) |

**Gaya Belajar Favorit** -- Pilih salah satu:

| Pilihan | Keterangan |
|---|---|
| Visual | Lebih mudah paham lewat gambar, diagram, dan video |
| Membaca | Suka membaca penjelasan tertulis yang detail |
| Praktik | Belajar paling baik dengan langsung mencoba kode |
| Diskusi | Lebih paham lewat tanya-jawab dan berdiskusi |

> **Penting:** Kedua pilihan pada langkah ini wajib dipilih sebelum bisa melanjutkan.

#### Langkah 3: Tujuan

- **Tujuan Belajar** (opsional): Tuliskan apa yang ingin Anda capai. Contoh: "Ingin bisa membuat website sendiri", "Memahami algoritma untuk karir."
- **Tantangan Terbesar** (opsional): Tuliskan hambatan dalam belajar Anda. Contoh: "Sulit memahami konsep abstrak", "Kurang waktu untuk latihan."

Setelah selesai, klik **"Mulai Belajar"** untuk menyimpan profil dan memulai perjalanan belajar Anda.

---

### 2.4 Dashboard

Dashboard (`/dashboard`) adalah halaman utama setelah login. Di sini Anda dapat melihat semua kursus yang telah dibuat dan mengelolanya.

[Screenshot: halaman-dashboard]

#### Elemen-elemen Dashboard:

**Header:**
- Logo PrincipleLearn di kiri atas.
- Avatar inisial nama dan alamat email Anda di kanan atas.
- Tombol **"Log out"** untuk keluar dari akun.

**Salam Personalisasi:**
- Menampilkan salam berdasarkan waktu (Good morning / Good afternoon / Good evening) diikuti nama panggilan Anda.
- Jumlah kursus yang sedang Anda pelajari.

**Tombol "Create Course":**
- Klik tombol biru **"Create Course"** untuk memulai pembuatan kursus baru.

**Daftar Kursus (My Courses):**
- Setiap kursus ditampilkan dalam bentuk kartu dengan informasi:
  - **Level badge**: Beginner (hijau), Intermediate (biru), atau Advanced (ungu).
  - **Judul kursus**: Klik untuk membuka halaman kursus.
  - **Tombol "Continue Learning"**: Langsung menuju halaman overview kursus.
  - **Menu titik tiga**: Klik untuk opsi menghapus kursus.

**Menghapus Kursus:**
1. Klik ikon titik tiga di pojok kanan atas kartu kursus.
2. Overlay konfirmasi akan muncul dengan pesan "Delete this course?"
3. Klik **"Delete"** untuk menghapus atau **"Cancel"** untuk membatalkan.

> **Peringatan:** Penghapusan kursus bersifat permanen. Semua data terkait (quiz, jurnal, transkrip, dll.) juga akan ikut terhapus.

**Jika Belum Ada Kursus:**
- Ditampilkan empty state dengan pesan "No courses yet".
- Klik tombol **"Create Your First Course"** untuk memulai.

---

### 2.5 Membuat Kursus Baru

Pembuatan kursus dilakukan melalui **3 langkah** yang ditunjukkan oleh indikator progress (1-2-3) di atas formulir. Setiap langkah harus diisi sebelum melanjutkan ke langkah berikutnya.

#### Step 1: Topik dan Tujuan (`/request-course/step1`)

[Screenshot: step1-buat-kursus]

| Field | Keterangan | Status |
|---|---|---|
| **Topic** | Topik yang ingin dipelajari | Wajib |
| **Learning Goal** | Apa yang ingin dicapai dari mempelajari topik ini | Wajib |

Contoh pengisian:
- **Topic:** "Machine Learning", "Web Development", "Data Science"
- **Learning Goal:** "Memahami konsep dasar neural network dan cara mengimplementasikannya"

Klik **"Continue"** untuk melanjutkan ke Step 2.

> **Tip:** Anda bisa kembali ke Dashboard kapan saja dengan mengklik link "Dashboard" di pojok kiri atas.

#### Step 2: Level Pengetahuan (`/request-course/step2`)

[Screenshot: step2-buat-kursus]

**Pilih Level Pengetahuan** -- Klik salah satu kartu:

| Level | Keterangan |
|---|---|
| **Beginner** | Memulai dari dasar-dasar |
| **Intermediate** | Sudah memiliki pengetahuan awal |
| **Advanced** | Ingin mendalami topik secara mendalam |

**Specific Topics to Cover** (opsional):
- Tuliskan sub-topik tertentu yang ingin dipelajari.
- Contoh: "Neural Networks, Transfer Learning, NLP"

Klik **"Continue"** untuk melanjutkan ke Step 3.

#### Step 3: Konteks dan Asumsi (`/request-course/step3`)

[Screenshot: step3-buat-kursus]

| Field | Keterangan | Status |
|---|---|---|
| **Real-world problem** | Masalah dunia nyata yang ingin diselesaikan dengan mempelajari topik ini | Wajib |
| **Initial assumption** | Asumsi awal Anda tentang materi ini sebelum mulai belajar | Wajib |

Contoh pengisian:
- **Real-world problem:** "Ingin membuat sistem rekomendasi produk untuk toko online saya"
- **Initial assumption:** "Saya pikir machine learning membutuhkan data sangat besar dan mahal"

Klik **"Generate Course"** untuk memulai proses pembuatan kursus oleh AI.

#### Proses Generating (`/request-course/generating`)

[Screenshot: generating-kursus]

Setelah klik "Generate Course", Anda akan diarahkan ke halaman proses yang menampilkan:

**Progress bar** dengan persentase kemajuan.

**Timeline 5 tahap:**

| Tahap | Keterangan |
|---|---|
| 1. Sending Request | Mengirim data kursus ke server |
| 2. AI Processing | AI sedang meng-generate outline kursus (biasanya 30-60 detik) |
| 3. Processing Response | Memvalidasi respons AI |
| 4. Saving Course | Menyimpan kursus ke database |
| 5. Complete! | Kursus berhasil dibuat |

Selama proses AI, sistem akan menampilkan **tips informatif** yang berganti setiap 5 detik, seperti:
- "Structuring modules based on your learning level..."
- "Connecting topics to your real-world problem..."
- "Building progressive learning pathways..."

**Ringkasan kursus** ditampilkan di bawah, menunjukkan topik dan level yang dipilih.

Setelah selesai, Anda akan **otomatis diarahkan** ke halaman overview kursus.

> **Jika terjadi error:** Klik tombol "Go back & try again" untuk kembali ke Step 3 dan mencoba ulang.

---

### 2.6 Halaman Overview Kursus

Halaman overview kursus (`/course/[courseId]`) menampilkan struktur kursus yang telah digenerate oleh AI.

[Screenshot: overview-kursus]

#### Struktur Kursus

Setiap kursus terdiri dari beberapa **modul**, dan setiap modul memiliki beberapa **subtopik** serta satu **diskusi penutup**.

**Header Modul:**
- Menampilkan nomor dan nama modul yang sedang aktif.
- Deskripsi: "Pelajari konsep-konsep utama dalam modul ini dan kuasai aplikasinya."

**Daftar Kartu Subtopik:**

Setiap kartu menampilkan:
- **Nomor subtopik** (misalnya 1.1, 1.2, 1.3).
- **Judul subtopik**.
- **Ringkasan** singkat isi subtopik.
- **Tombol aksi**:
  - "Mulai Materi" -- jika subtopik belum pernah dibuka.
  - "Lanjutkan Materi" -- jika subtopik sudah pernah dibuka sebelumnya.

**Kartu Diskusi Penutup:**
- Terletak di posisi terakhir dalam daftar subtopik modul.
- Menampilkan status diskusi: "Mulai Diskusi", "Lanjutkan Diskusi", atau "Lihat Ringkasan Diskusi".
- Fase saat ini dan jumlah goals yang tercapai (jika diskusi sudah dimulai).
- Badge "Selesai" jika diskusi sudah tuntas.

> **Navigasi antar Modul:** Gunakan parameter URL `?module=N` (di mana N adalah indeks modul dimulai dari 0) untuk berpindah antar modul. Navigasi ini biasanya terjadi otomatis melalui tombol-tombol di dalam halaman subtopik dan diskusi.

---

### 2.7 Mempelajari Subtopik (Halaman Materi)

Halaman subtopik (`/course/[courseId]/subtopic/[moduleIdx]/[pageIdx]`) adalah tempat utama Anda belajar. Ketika pertama kali membuka subtopik, AI akan meng-generate konten materi secara otomatis.

[Screenshot: halaman-subtopik]

#### Progress Bar

Di bagian atas halaman, terdapat **progress bar** berupa rangkaian titik-titik yang menunjukkan posisi Anda dalam alur pembelajaran subtopik. Titik yang aktif ditandai dengan warna berbeda.

#### Alur Halaman dalam Satu Subtopik

Setiap subtopik memiliki urutan halaman sebagai berikut:

```
Halaman Konten 1 --> Halaman Konten 2 --> ... --> Key Takeaways --> Quiz --> Feedback & Next Steps
```

**1. Halaman Konten** (beberapa halaman)

Berisi materi utama dalam bentuk:
- **Judul halaman** yang menjelaskan topik bahasan.
- **Paragraf-paragraf** penjelasan yang dihasilkan oleh AI.
- **Tombol interaktif** di bawah konten (lihat Bagian 2.8).

Gunakan tombol **"Next"** di bagian bawah halaman untuk melanjutkan ke halaman berikutnya, dan tombol **"Back"** untuk kembali ke halaman sebelumnya.

**2. Key Takeaways (Poin-Poin Penting)**

Setelah semua halaman konten selesai, Anda akan menemui halaman Key Takeaways yang berisi:
- Ringkasan poin-poin penting dari seluruh materi subtopik.
- Ditampilkan dalam format daftar yang mudah dipahami.

[Screenshot: key-takeaways]

**3. Quiz (Kuis)**

Setelah Key Takeaways, Anda harus mengerjakan kuis untuk menguji pemahaman.

[Screenshot: quiz]

**Detail Quiz:**
- Terdiri dari **5 soal pilihan ganda** per subtopik.
- Setiap soal menampilkan beberapa opsi jawaban.
- **Reasoning Note** (opsional): Pada setiap soal, Anda bisa menuliskan catatan alasan mengapa memilih jawaban tersebut. Ini membantu melatih kemampuan berpikir kritis Anda.
- Klik opsi jawaban untuk memilih, lalu klik **"Submit"** setelah menjawab semua soal.
- **Hasil langsung**: Setelah submit, Anda langsung melihat jawaban mana yang benar dan salah.
  - Jawaban benar ditandai warna hijau.
  - Jawaban salah ditandai warna merah, beserta jawaban yang seharusnya.
- **Skor disimpan otomatis** ke database.

> **Penting:** Jawaban quiz tidak bisa diubah setelah submit. Pastikan Anda sudah yakin sebelum mengirimkan.

**4. Feedback & Langkah Selanjutnya**

Halaman terakhir dalam alur subtopik berisi tiga bagian:

**(a) What's Next (Ringkasan & Motivasi)**
- Ringkasan singkat tentang apa yang telah dipelajari.
- Pesan motivasi untuk melanjutkan perjalanan belajar.

**(b) Structured Reflection (Refleksi Terstruktur)**

[Screenshot: refleksi-terstruktur]

Formulir refleksi dengan 4 pertanyaan:

| Bagian | Pertanyaan |
|---|---|
| Apa yang Saya Pahami | Apa hal utama yang saya pahami hari ini? |
| Yang Masih Membingungkan | Apa yang masih salah atau membingungkan? |
| Strategi ke Depan | Apa strategi belajar saya selanjutnya? |
| Evolusi Cara Bertanya | Bagaimana cara saya bertanya berubah dari sesi sebelumnya? |

**Rating Konten:**
- Beri rating 1-5 bintang untuk kualitas konten.
- Tulis feedback tambahan jika ada (opsional).
- Klik **"Simpan Refleksi & Feedback"** untuk menyimpan.

**(c) Next Subtopics (Subtopik Berikutnya)**
- Daftar subtopik lain dalam modul yang sama.
- Klik untuk langsung menuju subtopik tersebut.

Klik tombol **"Finish"** di bagian bawah untuk kembali ke halaman Overview kursus.

---

### 2.8 Fitur Interaktif saat Belajar

Pada setiap halaman konten subtopik, terdapat tiga tombol interaktif yang dapat Anda gunakan untuk memperdalam pemahaman:

[Screenshot: tombol-interaktif]

Ketika pertama kali dimuat, tombol ditampilkan sebagai tiga pilihan:
- **Ask Question** (Tanya Jawab)
- **Challenge My Thinking** (Tantangan Berpikir)
- **Give Me Examples** (Berikan Contoh)

Setelah salah satu dipilih, tampilan berubah menjadi **tab navigasi** sehingga Anda bisa berpindah antar fitur. Klik tombol **"x"** untuk menutup panel interaktif.

---

#### a. Ask Question (Tanya Jawab)

Fitur ini memungkinkan Anda bertanya tentang materi yang sedang dipelajari, dan AI akan menjawab secara real-time.

[Screenshot: ask-question]

**Cara menggunakan:**

1. Klik tab **"Ask Question"**.
2. Anda akan melihat **PromptBuilder** -- alat bantu untuk menyusun pertanyaan yang berkualitas.

**PromptBuilder memiliki dua mode:**

| Mode | Keterangan |
|---|---|
| **Guided** (default) | Menyusun pertanyaan secara terstruktur dengan panduan |
| **Simple** | Mengetik pertanyaan langsung tanpa panduan |

**Mode Guided memiliki field-field:**

| Field | Keterangan | Contoh |
|---|---|---|
| **Tujuan** | Apa yang ingin Anda ketahui | "Saya ingin memahami bagaimana..." |
| **Konteks** | Apa yang sudah Anda ketahui | "Yang sudah saya ketahui adalah..." |
| **Batasan** (opsional) | Format jawaban yang diinginkan | "Jelaskan dengan bahasa sederhana" |

Setiap field dilengkapi **chip** (tombol cepat) yang bisa diklik untuk memulai kalimat.

3. Setelah menyusun pertanyaan, klik **"Kirim"**.
4. AI akan menjawab secara **streaming** (teks muncul secara bertahap, seperti sedang diketik).
5. Setelah jawaban selesai, Anda bisa menambahkan **Reasoning Note** (catatan alasan) -- mengapa Anda mengajukan pertanyaan tersebut.
6. Riwayat tanya-jawab akan ditampilkan di atas area input.

**Prompt Journey Timeline:**
- Setelah mengajukan setidaknya satu pertanyaan, **Prompt Timeline** akan muncul di bawah.
- Timeline ini menunjukkan evolusi cara Anda bertanya dari waktu ke waktu, termasuk komponen prompt yang digunakan.

---

#### b. Challenge My Thinking (Tantangan Berpikir)

Fitur ini membantu Anda melatih kemampuan berpikir kritis melalui pertanyaan tantangan dari AI.

[Screenshot: challenge-thinking]

**Cara menggunakan:**

1. Klik tab **"Challenge My Thinking"**.
2. AI akan secara otomatis **meng-generate pertanyaan tantangan** berdasarkan materi yang sedang Anda baca dan level kursus Anda.
3. Selama proses loading, indikator AI ditampilkan dengan pesan "Menyiapkan pertanyaan...", "Menganalisis materi...", dll.
4. Pertanyaan tantangan ditampilkan di dalam **ChallengeBox** berwarna berbeda.
5. Jika pertanyaan kurang sesuai, klik tombol **"Regenerate"** untuk mendapatkan pertanyaan baru.
6. Jawab pertanyaan di field **"Type your answer here..."**
7. (Opsional) Tambahkan alasan di field **"Why do you choose this answer?"**
8. Klik **"Submit"** untuk mengirim jawaban.

**Feedback yang Diterima:**

Setelah submit, AI memberikan **feedback terstruktur** yang berisi:
- Kekuatan jawaban Anda.
- Area yang perlu diperbaiki.
- Konsep kunci yang relevan.

**Riwayat Challenge:**
- Semua tantangan yang telah dijawab disimpan dalam **Previous Challenges**.
- Klik salah satu untuk melihat kembali pertanyaan, jawaban, dan feedback-nya.
- Klik **"Try a New Challenge"** atau **"Buat Pertanyaan Baru"** untuk mengerjakan tantangan baru.

---

#### c. Give Me Examples (Berikan Contoh)

Fitur ini menghasilkan contoh kontekstual dari AI untuk membantu memahami materi lebih baik.

[Screenshot: give-me-examples]

**Cara menggunakan:**

1. Klik tab **"Give Me Examples"**.
2. AI akan **meng-generate contoh** berdasarkan konten halaman yang sedang Anda baca.
3. Contoh ditampilkan dalam card yang rapi.
4. **Navigasi contoh:**
   - Klik tombol **sebelumnya/berikutnya** untuk melihat contoh yang pernah digenerate.
   - Indikator menunjukkan "Contoh ke-X dari Y total".
5. Klik tombol **"Regenerate"** untuk meng-generate contoh baru.
6. Contoh baru ditambahkan ke riwayat dan dapat dinavigasi kembali.

---

### 2.9 Diskusi Penutup Modul (Metode Socratic)

Diskusi penutup adalah fitur **dialog interaktif** dengan mentor virtual (AI) yang menggunakan **metode Socratic** untuk memperdalam pemahaman Anda tentang seluruh modul.

[Screenshot: diskusi-penutup]

#### Prasyarat

Sebelum dapat memulai diskusi penutup modul, Anda harus:
1. **Meng-generate semua subtopik** dalam modul tersebut (membuka setiap subtopik sehingga konten digenerate oleh AI).
2. **Menyelesaikan quiz** pada setiap subtopik.

Jika prasyarat belum terpenuhi, halaman diskusi akan menampilkan:
- **Panel "Lengkapi Materi Terlebih Dahulu"** dengan detail:
  - Jumlah subtopik yang sudah siap vs yang diharapkan.
  - Jumlah kuis yang sudah dijawab vs total.
  - Daftar status setiap subtopik (Siap, Belum digenerate, Kuis belum selesai, dll.).
- Tombol **"Pelajari Subtopik Modul"** untuk kembali ke halaman overview.

#### Memulai Diskusi

1. Pastikan semua prasyarat terpenuhi.
2. Klik **"Mulai Diskusi"** pada kartu Diskusi Penutup di halaman overview kursus.
3. Diskusi dimulai dengan pesan intro dari mentor.

#### 4 Fase Diskusi

Diskusi melewati empat fase secara berurutan:

| Fase | Nama | Keterangan |
|---|---|---|
| 1 | **Diagnosis** | Mentor menilai pemahaman awal Anda terhadap materi modul |
| 2 | **Exploration** (Penjelasan) | Menjelajahi konsep-konsep lebih dalam melalui dialog |
| 3 | **Practice** (Latihan) | Latihan menerapkan konsep yang sudah dipelajari |
| 4 | **Synthesis** (Konsolidasi) | Menyimpulkan dan menghubungkan semua konsep |

#### Antarmuka Diskusi

**Header:**
- Breadcrumb **"Kembali ke Outline"** untuk kembali ke overview kursus.
- Judul "Diskusi Penutup" dengan informasi modul dan cakupan.
- **Status badge**: Ready (siap), In Progress (sedang berlangsung), atau Done (selesai).

**Panel Learning Goals (Tujuan Diskusi):**
- Klik tombol **"Goal Diskusi"** di atas thread untuk membuka panel dropdown.
- Menampilkan daftar tujuan pembelajaran dengan status tercapai/belum.
- Progress: "X/Y tercapai".
- Fase aktif saat ini ditampilkan.

**Thread Percakapan:**
- Pesan **Mentor** ditampilkan di sisi kiri.
- Pesan **Anda** ditampilkan di sisi kanan.
- Setiap pesan menampilkan waktu pengiriman.
- Thread otomatis scroll ke bawah saat ada pesan baru.

**Area Input:**
- Tipe input bergantung pada instruksi mentor:
  - **Pertanyaan terbuka**: Textarea untuk menuliskan jawaban bebas, lalu klik **"Kirim Jawaban"**.
  - **Pilihan ganda (MCQ)**: Pilih salah satu opsi, lalu klik **"Kirim Jawaban"**.

#### Penyelesaian Diskusi

- Diskusi **otomatis selesai** ketika semua tujuan pembelajaran (learning goals) tercapai.
- Setelah selesai, panel penutup ditampilkan dengan pesan:
  *"Semua tujuan pembelajaran telah tercapai. Lanjutkan perjalanan belajar ke modul berikutnya."*
- Klik **"Lanjut Modul Berikutnya"** untuk melanjutkan ke modul selanjutnya.

#### Melanjutkan Diskusi yang Tertunda

Jika Anda meninggalkan diskusi sebelum selesai:
1. Kembali ke halaman overview kursus.
2. Kartu Diskusi Penutup akan menampilkan tombol **"Lanjutkan Diskusi"** beserta fase dan progress saat ini.
3. Klik untuk melanjutkan dari titik terakhir.

---

### 2.10 Logout

**Langkah-langkah logout:**

1. Klik tombol **"Log out"** di header Dashboard (pojok kanan atas).
2. Semua cookie autentikasi akan dihapus.
3. Anda akan diarahkan kembali ke halaman login.

> **Catatan:** Jika Anda mengaktifkan "Remember me" saat login, pastikan untuk logout secara manual jika menggunakan perangkat bersama.

---

## 3. Panduan Administrator

### 3.1 Login Admin

Akun admin memiliki alur login yang terpisah dari akun mahasiswa.

**Langkah-langkah:**

1. Buka halaman `/admin/login`.
2. Masukkan **email** dan **password** akun admin.
3. Klik tombol **"Login"**.
4. Jika berhasil, Anda diarahkan ke Dashboard Admin.

[Screenshot: admin-login]

> **Catatan:** Token admin berlaku selama 2 jam. Setelah itu, Anda perlu login kembali.

---

### 3.2 Dashboard Admin

Dashboard Admin (`/admin/dashboard`) menyediakan ringkasan komprehensif tentang aktivitas platform dan data penelitian.

[Screenshot: admin-dashboard]

#### Navigasi Dashboard

Dashboard memiliki **4 tab utama** dan **filter waktu**:

**Tab:**
| Tab | Ikon | Keterangan |
|---|---|---|
| **Overview** | Grid | Ringkasan KPI dan grafik penelitian |
| **Students** | Users | Tabel ringkasan mahasiswa |
| **Activity** | Activity | Timeline aktivitas terbaru |
| **System Health** | Shield | Status kesehatan sistem |

**Filter Waktu:**
| Filter | Keterangan |
|---|---|
| 7 Days | Data 7 hari terakhir |
| 30 Days | Data 30 hari terakhir |
| 90 Days | Data 90 hari terakhir |
| All Time | Seluruh data |

Header juga menampilkan waktu query (dalam milidetik), tombol **Refresh**, dan badge email admin.

---

#### Tab Overview

**13 KPI Cards:**

| KPI | Keterangan |
|---|---|
| Active Students | Jumlah mahasiswa yang terdaftar |
| Total Courses | Jumlah kursus yang dibuat |
| Quiz Accuracy | Rata-rata akurasi quiz (%) |
| CT Coverage | Persentase coverage Computational Thinking |
| Discussions | Jumlah sesi diskusi |
| Total Prompts | Jumlah prompt yang dikirim mahasiswa |
| Ask Questions | Jumlah pertanyaan yang diajukan |
| Rating | Rata-rata rating konten (dari 5) |
| Journals | Jumlah jurnal refleksi yang ditulis |
| Challenges | Jumlah challenge thinking yang dikerjakan |
| Transcripts | Jumlah transkrip yang disimpan |
| Learning Profiles | Jumlah profil belajar yang terdaftar |
| Onboarding Rate | Persentase penyelesaian onboarding |

**Grafik RM2 -- Prompt Stages:**
- Bar chart yang menunjukkan distribusi tahapan prompt mahasiswa:
  - **SCP** (Simple Copy-Paste) -- Merah
  - **SRP** (Structured Prompt) -- Kuning
  - **MQP** (Multi-Quality Prompt) -- Biru
  - **Reflektif** (Reflective Prompt) -- Hijau
- Legend di bawah menunjukkan jumlah dan persentase tiap tahap.

**Grafik RM3 -- Critical Thinking:**
- Jika data penelitian tersedia: Menampilkan skor CT dan CTh beserta radar chart 6 dimensi (Decomposition, Pattern Recognition, Abstraction, Algorithm Design, Evaluation/Debugging, Generalization).
- Jika data belum tersedia: Menampilkan ring chart Quiz Accuracy dan CT Coverage, serta statistik Challenges, Journals, dan Rating.

**Micro Marker Distribution:**
- Kartu-kartu yang menampilkan distribusi micro marker (penanda detail dari kualitas prompt).

---

#### Tab Students

- Tabel ringkasan semua mahasiswa.
- Kolom: Student (email), Stage (tahap prompt), Courses, Ask Q, Quiz Acc., Challenges, Discussions, Journals, Last Active.
- Stage badge berwarna sesuai level (SCP/SRP/MQP/Reflektif).
- Klik baris untuk melihat detail di halaman Manajemen Mahasiswa.
- Tombol **"View Details"** mengarah ke `/admin/users`.

---

#### Tab Activity

- Timeline aktivitas terbaru dari seluruh platform.
- **8 tipe aktivitas** yang dilacak:
  - Course (pembuatan kursus)
  - Ask Question (tanya jawab)
  - Challenge (challenge thinking)
  - Quiz (pengerjaan kuis)
  - Journal (penulisan jurnal refleksi)
  - Transcript (penyimpanan transkrip)
  - Feedback (pemberian feedback)
  - Discussion (diskusi Socratic)
- Setiap item menampilkan email pengguna, detail aktivitas, tipe, dan waktu.
- Legend warna di atas untuk membedakan tipe aktivitas.

---

#### Tab System Health

- Metrik kesehatan sistem selama 7 hari terakhir.
- **KPI Sistem:**
  - Total Requests
  - Successful (jumlah request berhasil)
  - Failures (jumlah kegagalan dan persentase)
- **Alerts:** Peringatan jika ada endpoint dengan failure rate tinggi.
- **Top Failing Endpoints:** Tabel endpoint yang paling sering gagal dengan detail total, success, failed, dan failure rate.
- Jika semua sistem normal: "All systems operational. No alerts detected."

---

### 3.3 Manajemen Mahasiswa

Halaman Manajemen Mahasiswa (`/admin/users`) menyediakan tampilan detail untuk setiap mahasiswa.

[Screenshot: admin-users]

#### Layout

**Sidebar Kiri -- Daftar Mahasiswa:**
- **Search bar** untuk mencari berdasarkan email.
- **Filter role:** ALL, USER, ADMIN.
- **Sort:** Recent (terbaru), Email (abjad), Engagement, Completion.
- Daftar mahasiswa dengan informasi ringkas.

**Panel Kanan -- Detail Mahasiswa:**

Setelah memilih mahasiswa, panel kanan menampilkan:

**Stats Grid:**
- Kursus, Quiz, Jurnal, Challenges, Transcripts, Ask Questions, Discussions, Feedback.

**Tab Overview:**
- 8 kartu aktivitas dengan ringkasan detail.

**Tab Activity (Timeline):**
- Aktivitas kronologis mahasiswa terpilih.

**Fitur Tambahan:**
- **Export Data:** Unduh data mahasiswa dalam format CSV atau JSON.
- **Hapus Mahasiswa:** Hapus akun mahasiswa beserta seluruh datanya (cascade delete ke 17 tabel terkait).

> **Peringatan:** Penghapusan mahasiswa bersifat permanen dan tidak dapat dibatalkan.

---

### 3.4 Manajemen Diskusi

Halaman Manajemen Diskusi (`/admin/discussions`) memungkinkan admin memantau dan mengelola semua sesi diskusi Socratic.

[Screenshot: admin-discussions]

#### Fitur Utama:

**Daftar Sesi Diskusi:**
- Filter status: Semua Status, Sedang Berlangsung, Selesai.
- Setiap sesi menampilkan:
  - Nama mahasiswa/email.
  - Judul modul dan subtopik.
  - Fase saat ini (Diagnosis/Penjelasan/Latihan/Konsolidasi/Selesai).
  - Health Score.

**Health Score:**
| Warna | Keterangan |
|---|---|
| Hijau | Diskusi berjalan lancar |
| Kuning | Ada potensi masalah |
| Merah | Memerlukan perhatian admin |

**Detail Sesi:**
- Informasi lengkap mahasiswa.
- Fase dan status diskusi.
- Thread pesan (percakapan antara mentor dan mahasiswa).
- Goal tracking (tujuan yang sudah dan belum tercapai).
- Prasyarat modul (status kesiapan subtopik dan quiz).

**Admin Actions:**
- Admin dapat memberikan **feedback** atau catatan pada sesi diskusi.

---

### 3.5 Insights

Halaman Insights (`/admin/insights`) menyediakan analisis agregat tentang pola belajar mahasiswa.

[Screenshot: admin-insights]

#### Filter yang Tersedia:
- **Per Mahasiswa:** Pilih mahasiswa tertentu untuk analisis individual.
- **Per Kursus:** Pilih kursus tertentu.
- **Rentang Waktu:** 7 hari, 30 hari, 90 hari, atau semua.

#### Konten Insights:
- **Prompt Evolution Chart:** Grafik evolusi kualitas prompt mahasiswa dari waktu ke waktu.
- **Ringkasan Mahasiswa:** Statistik agregat per mahasiswa.
- **Analisis Pola Belajar:** Data tentang bagaimana mahasiswa berinteraksi dengan platform.
- **Export:** Unduh data insights.

---

### 3.6 Research Dashboard

Research Dashboard (`/admin/research`) adalah pusat analisis data untuk keperluan penelitian thesis.

[Screenshot: admin-research]

#### Halaman Utama Research

**KPI Research:**
| KPI | Keterangan |
|---|---|
| Total Sesi | Jumlah total sesi interaksi |
| Total Klasifikasi | Jumlah klasifikasi prompt yang dilakukan |
| Total Indikator | Jumlah indikator kognitif yang terdeteksi |
| Total Mahasiswa | Jumlah mahasiswa yang terdata |

**Distribusi Stage:**
- Persentase mahasiswa di setiap tahap: SCP, SRP, MQP, Reflektif.
- Visualisasi chart (heatmap dan progression chart).

#### Sub-halaman Research:

| Halaman | Path | Keterangan |
|---|---|---|
| **Classifications** | `/admin/research/classifications` | Data klasifikasi prompt secara detail |
| **Indicators** | `/admin/research/indicators` | Breakdown indikator Critical Thinking dan Computational Thinking |
| **Sessions** | `/admin/research/sessions` | Analisis mendalam sesi diskusi |
| **Export** | `/admin/research/export` | Export data penelitian |

#### Export Data Penelitian (`/admin/research/export`)

Tersedia beberapa tipe dan format export:

| Tipe Export | Keterangan |
|---|---|
| **Sessions** | Data sesi interaksi |
| **Classifications** | Data klasifikasi prompt |
| **Indicators** | Data indikator CT/CTh |
| **SPSS** | Format khusus untuk analisis statistik SPSS |
| **Full** | Semua data penelitian dalam satu paket |

**Format:** JSON atau CSV.

**Filter Export:**
- Filter berdasarkan User ID, tanggal mulai, dan tanggal akhir.

---

### 3.7 Activity Log

Halaman Activity Log (`/admin/activity`) mencatat semua aktivitas pengguna di platform secara mendetail.

[Screenshot: admin-activity]

#### Tipe Aktivitas yang Dilacak:

| Ikon | Tipe | Keterangan |
|---|---|---|
| Buku | Course Generation | Log pembuatan kursus (termasuk request payload, outline) |
| Tanda Tanya | Ask Question | Log pertanyaan yang diajukan (pertanyaan, jawaban, reasoning note, prompt components) |
| Target | Challenge | Log challenge thinking |
| Checkbox | Quiz | Log pengerjaan kuis |
| Bintang | Feedback | Log pemberian feedback/rating |
| Pesan | Discussion | Log sesi diskusi |
| File | Transcript | Log transkrip yang disimpan |
| Edit | Journal | Log jurnal refleksi |

#### Fitur:
- **Filter** berdasarkan tipe aktivitas.
- **Pencarian** berdasarkan email pengguna.
- Setiap log entry menampilkan timestamp, tipe aksi, dan email pengguna.
- Klik entry untuk melihat detail lengkap (untuk Jurnal dan Transkrip, modal detail akan terbuka).

---

### 3.8 Registrasi Admin Baru

Pendaftaran admin baru hanya dapat dilakukan oleh admin yang sudah terdaftar.

**Langkah-langkah:**

1. Login sebagai admin.
2. Buka halaman `/admin/register`.
3. Isi email dan password untuk akun admin baru.
4. Submit formulir.
5. Akun admin baru akan dibuat dan bisa langsung digunakan untuk login.

> **Catatan:** Tidak ada fitur self-registration untuk admin. Hanya admin yang sudah ada yang bisa membuat akun admin baru.

---

## 4. Tips dan Pertanyaan Umum (FAQ)

### Pertanyaan Umum

**T: Bagaimana jika saya lupa password?**
J: Saat ini belum tersedia fitur reset password secara mandiri. Silakan hubungi administrator untuk mendapatkan bantuan.

**T: Apakah data saya tersimpan otomatis?**
J: Ya, semua aktivitas Anda tersimpan secara otomatis ke database. Ini termasuk jawaban quiz, jurnal refleksi, riwayat tanya-jawab, challenge thinking, dan progres diskusi.

**T: Apakah PrincipleLearn bisa diakses dari HP/tablet?**
J: Ya, tampilan PrincipleLearn sudah responsive dan dapat digunakan di berbagai ukuran layar, termasuk smartphone dan tablet.

**T: Berapa banyak kursus yang bisa saya buat?**
J: Tidak ada batasan jumlah kursus. Anda bisa membuat sebanyak yang Anda butuhkan.

**T: Bagaimana jika AI gagal meng-generate kursus?**
J: Ada beberapa kemungkinan penyebab:
- **Timeout:** Jika topik terlalu luas, proses bisa melebihi batas waktu. Coba gunakan topik yang lebih spesifik.
- **Rate limit:** Platform membatasi 30 request per jam. Tunggu beberapa menit sebelum mencoba lagi.
- **Server error:** Coba lagi dalam beberapa menit. Jika masalah berlanjut, hubungi administrator.

**T: Apakah jawaban quiz bisa diubah setelah submit?**
J: Tidak. Setelah Anda menekan tombol Submit pada quiz, jawaban bersifat final dan tidak dapat diubah. Skor akan langsung dihitung dan disimpan.

**T: Apakah saya bisa melihat kembali challenge yang pernah saya kerjakan?**
J: Ya. Riwayat challenge tersimpan dan dapat dilihat kembali di bagian "Previous Challenges" pada tab Challenge My Thinking.

**T: Apa itu PromptBuilder dan mengapa harus menggunakannya?**
J: PromptBuilder adalah alat bantu untuk menyusun pertanyaan yang terstruktur. Dengan menyusun pertanyaan secara terstruktur (tujuan, konteks, batasan), Anda melatih kemampuan berpikir kritis dan kualitas prompt Anda, yang merupakan salah satu tujuan utama platform ini. Mode "Simple" juga tersedia jika Anda ingin langsung mengetik pertanyaan.

**T: Apa bedanya "Remember me" dicentang dan tidak?**
J: Jika dicentang, sesi login Anda berlaku selama 7 hari. Jika tidak dicentang, sesi berakhir setelah 2 jam atau ketika browser ditutup (mana yang lebih dulu).

**T: Apa prasyarat untuk memulai Diskusi Penutup modul?**
J: Semua subtopik dalam modul tersebut harus sudah digenerate kontennya (dibuka) dan semua quiz pada setiap subtopik harus sudah dikerjakan. Halaman diskusi akan menampilkan daftar checklist yang menunjukkan status kesiapan setiap subtopik.

**T: Bisakah saya melanjutkan diskusi yang tertunda?**
J: Ya. Diskusi yang belum selesai akan menyimpan progress Anda. Kembali ke halaman overview kursus dan klik "Lanjutkan Diskusi" pada kartu diskusi yang bersangkutan.

---

### Tips untuk Pengalaman Belajar Optimal

1. **Isi profil onboarding dengan jujur.** Informasi tentang pengalaman, gaya belajar, dan tantangan Anda membantu AI menyesuaikan konten dan tingkat kesulitan.

2. **Gunakan PromptBuilder dalam mode Guided.** Menyusun pertanyaan secara terstruktur bukan hanya membantu mendapat jawaban lebih baik, tapi juga melatih kemampuan berpikir kritis Anda.

3. **Tulis Reasoning Note di setiap quiz.** Meskipun opsional, menuliskan alasan pilihan jawaban membantu Anda memproses pemahaman secara lebih mendalam.

4. **Jangan lewatkan Structured Reflection.** Bagian refleksi di akhir setiap subtopik sangat penting untuk mengonsolidasikan pemahaman Anda.

5. **Manfaatkan ketiga fitur interaktif.** Kombinasikan Ask Question, Challenge Thinking, dan Examples untuk mendapatkan pemahaman yang menyeluruh tentang setiap topik.

6. **Selesaikan semua subtopik sebelum memulai Diskusi Penutup.** Diskusi Socratic dirancang untuk merekap seluruh modul, jadi pastikan Anda sudah mempelajari semua materi terlebih dahulu.

7. **Perhatikan Prompt Journey Timeline.** Timeline ini menunjukkan bagaimana cara Anda bertanya berkembang dari waktu ke waktu -- indikator penting dalam perkembangan kemampuan berpikir kritis.

8. **Isi masalah dunia nyata dan asumsi awal dengan serius** saat membuat kursus (Step 3). Informasi ini membantu AI menghasilkan konten yang lebih relevan dan kontekstual untuk kebutuhan Anda.

---

### Glosarium

| Istilah | Keterangan |
|---|---|
| **CT (Critical Thinking)** | Berpikir kritis -- kemampuan menganalisis, mengevaluasi, dan menyintesis informasi |
| **CTh (Computational Thinking)** | Berpikir komputasional -- kemampuan memecah masalah, mengenali pola, abstraksi, dan merancang algoritma |
| **SCP (Simple Copy-Paste)** | Tahap prompt awal di mana mahasiswa hanya menyalin pertanyaan sederhana |
| **SRP (Structured Prompt)** | Tahap di mana mahasiswa mulai menyusun pertanyaan yang terstruktur |
| **MQP (Multi-Quality Prompt)** | Tahap di mana mahasiswa memberikan konteks dan batasan dalam pertanyaan |
| **Reflektif** | Tahap tertinggi di mana mahasiswa menyertakan refleksi dan evaluasi dalam pertanyaan |
| **Metode Socratic** | Metode diskusi yang menggunakan pertanyaan-pertanyaan terstruktur untuk mendorong pemahaman mendalam |
| **PromptBuilder** | Alat bantu di dalam platform untuk menyusun pertanyaan terstruktur |
| **Reasoning Note** | Catatan alasan yang ditulis mahasiswa untuk menjelaskan pilihan atau pemikiran mereka |
| **Learning Goals** | Tujuan pembelajaran yang harus dicapai dalam sesi diskusi |
| **Onboarding** | Proses pengaturan profil awal saat pertama kali menggunakan platform |

---

*Dokumen ini merupakan bagian dari dokumentasi PrincipleLearn V3 untuk keperluan penelitian thesis.*
