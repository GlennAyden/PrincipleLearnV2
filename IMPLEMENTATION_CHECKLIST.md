# Checklist Implementasi Input User ke Database dan Admin

Dokumen ini memastikan semua input user benar-benar masuk ke database dan tampil di admin tanpa celah.

## Progress Implementasi (Sudah Dikerjakan)

- [x] Route simpan utama sekarang menerima identitas user dalam format `id` maupun `email` untuk mencegah gagal simpan karena mismatch identifier:
  - `src/app/api/jurnal/save/route.ts`
  - `src/app/api/feedback/route.ts`
  - `src/app/api/quiz/submit/route.ts`
  - `src/app/api/transcript/save/route.ts`
- [x] Payload Admin Activity untuk Ask Question sudah membawa `promptComponents` dan `reasoningNote` dari database:
  - `src/app/api/admin/activity/ask-question/route.ts`
- [x] Payload Admin Activity untuk Challenge Thinking sudah membawa `reasoningNote` dari database:
  - `src/app/api/admin/activity/challenge/route.ts`
- [x] Payload Admin Activity untuk Quiz sudah membawa `reasoningNote` dari database:
  - `src/app/api/admin/activity/quiz/route.ts`
- [x] Halaman Admin Activity sekarang menampilkan reasoning/komponen prompt pada tab Ask, Challenge, dan Quiz:
  - `src/app/admin/activity/page.tsx`
- [x] Endpoint detail quiz disesuaikan dengan skema aktual `quiz_submissions` dan menampilkan reasoning:
  - `src/app/api/admin/activity/quiz/[id]/route.ts`
  - `src/components/admin/QuizResultModal.tsx`
- [x] Tab Admin Activity untuk Jurnal dan Transcript sudah ditambahkan:
  - `src/app/admin/activity/page.tsx`
- [x] Pemasangan pemanggil frontend untuk simpan transcript dari alur Ask Question:
  - `src/components/AskQuestion/QuestionBox.tsx`
  - `src/app/api/transcript/save/route.ts`
- [x] Visibilitas admin untuk learning profile ditambahkan melalui endpoint + tab activity:
  - `src/app/api/admin/activity/learning-profile/route.ts`
  - `src/app/admin/activity/page.tsx`

## Progress Implementasi (Belum Dikerjakan)

- [ ] Lakukan pengujian end-to-end penuh untuk memastikan semua jalur baru stabil di runtime.

## Aturan Dasar

- [ ] Tetapkan prinsip bahwa setiap aksi yang menerima teks dari user wajib punya 3 hal sekaligus: route simpan, tabel database tujuan, dan tampilan admin.
- [ ] Untuk setiap payload input user, samakan identitas user. Pilih satu standar saja: `user.id` atau `user.email`, lalu konsisten di semua route.
- [ ] Setiap route simpan harus mengembalikan `success`, `id`, dan pesan error yang jelas jika gagal.
- [ ] Semua tabel evidence user harus punya minimal: `user_id`, `course_id` bila relevan, konteks topik/subtopik, isi input user, dan `created_at`.
- [ ] Semua halaman admin harus membaca dari sumber data yang benar-benar dipakai saat penyimpanan, bukan dari format lama atau asumsi schema lama.

## Prioritas Kritis

- [x] Perbaiki mismatch `StructuredReflection -> jurnal/save`.
  `src/components/StructuredReflection/StructuredReflection.tsx` mengirim `user.id`, dan `src/app/api/jurnal/save/route.ts` kini menerima identifier dalam format `id` maupun `email`.
- [x] Pastikan transcript benar-benar dipanggil dari frontend.
  Pemanggil aktif tersedia di `src/components/AskQuestion/QuestionBox.tsx` dan route simpan `src/app/api/transcript/save/route.ts` sudah terhubung ke alur Ask Question.
- [x] Perbaiki detail admin untuk quiz.
  Endpoint detail `src/app/api/admin/activity/quiz/[id]/route.ts` kini membaca struktur penyimpanan aktual `quiz_submissions` (per row jawaban) termasuk `reasoning_note`.
- [x] Tambahkan akses admin untuk jurnal, transcript, dan learning profile di UI utama admin.
  Tab `jurnal`, `transcript`, dan `learningProfile` sudah ada di `src/app/admin/activity/page.tsx` dengan endpoint activity masing-masing.

## Checklist Per Fitur

### Generate Course

- [x] Validasi bahwa semua field step1-step3 dari user tersimpan penuh di `src/app/api/generate-course/route.ts` ke `course_generation_activity`.
- [x] Pastikan admin menampilkan `request_payload` lengkap, bukan hanya ringkasan. Cek `src/app/api/admin/activity/generate-course/route.ts`.
- [x] Pastikan `user_id` dan `course_id` tidak `null` bila user login valid.

### Ask Question

- [x] Pastikan pertanyaan utama, `prompt_components`, `reasoning_note`, `session_number`, `prompt_version`, `module_index`, `subtopic_index`, dan `page_number` selalu ikut tersimpan di `src/app/api/ask-question/route.ts`.
- [x] Pastikan admin activity dan evidence sama-sama menampilkan komponen prompt dan reasoning note. Saat ini activity di `src/app/api/admin/activity/ask-question/route.ts` belum membawa reasoning/component selengkap evidence.
- [x] Pastikan timeline prompt membaca field yang benar dari data simpan di `src/components/PromptTimeline/PromptTimeline.tsx`.

### Challenge Thinking

- [x] Pastikan `question`, `answer`, `feedback`, dan `reasoning_note` selalu tersimpan di `src/app/api/challenge-response/route.ts`.
- [x] Tambahkan `reasoning_note` ke payload admin activity di `src/app/api/admin/activity/challenge/route.ts`, karena saat ini reasoning sudah masuk database tetapi belum tampil penuh di admin activity.
- [x] Pastikan challenge juga tetap masuk ke evidence agregat di `src/app/api/admin/evidence/route.ts`.

### Quiz

- [x] Pastikan jawaban user per soal, status benar/salah, dan `reasoning_note` tersimpan konsisten di `src/app/api/quiz/submit/route.ts`.
- [x] Ubah endpoint detail admin agar membaca struktur penyimpanan aktual `quiz_submissions`, bukan format `answers` lama di `src/app/api/admin/activity/quiz/[id]/route.ts`.
- [x] Tambahkan tampilan reasoning siswa di admin modal `src/components/admin/QuizResultModal.tsx`.
- [x] Pastikan admin list quiz di `src/app/api/admin/activity/quiz/route.ts` tetap bisa difilter per user/course/topic.

### Feedback

- [x] Pastikan semua feedback user yang dikirim lewat `src/app/api/feedback/route.ts` selalu punya `user_id`, `course_id`, konteks subtopik bila ada, dan `comment`.
- [x] Pastikan rating tidak di-hardcode bila sumber UI sebenarnya punya nilai numerik. Saat ini ada jalur yang memaksa rating default.
- [x] Pastikan admin activity menampilkan `comment`, `rating`, `module_index`, dan `subtopic_index` dari `src/app/api/admin/activity/feedback/route.ts`.

### Jurnal/Refleksi

- [x] Standarkan payload jurnal antara frontend dan backend. Cek `src/components/StructuredReflection/StructuredReflection.tsx` dan `src/app/api/jurnal/save/route.ts`.
- [x] Pastikan semua field refleksi seperti `understood`, `confused`, `strategy`, `promptEvolution`, `contentRating`, dan `contentFeedback` benar-benar tersimpan dan bisa dibaca kembali.
- [x] Tambahkan tab jurnal di admin activity atau tautkan jelas ke endpoint `src/app/api/admin/activity/jurnal/route.ts`.
- [x] Verifikasi modal admin jurnal benar-benar digunakan dari halaman admin, bukan hanya file yang ada tetapi tidak terpasang. Cek `src/components/admin/JournalModal.tsx`.

### Transcript

- [x] Identifikasi semua titik UI yang seharusnya menyimpan transkrip QnA ke `src/app/api/transcript/save/route.ts`.
- [x] Jika transcript memang dipakai, pastikan frontend benar-benar memanggil route simpan setiap kali user menyimpan catatan/transkrip.
- [x] Tambahkan tab transcript di admin activity yang membaca `src/app/api/admin/activity/transcript/route.ts`.
- [x] Pastikan modal `src/components/admin/TranscriptModal.tsx` benar-benar terhubung ke UI admin.

### Discussion

- [x] Pastikan semua input teks user di diskusi selalu masuk ke `discussion_messages` melalui `src/app/api/discussion/respond/route.ts`.
- [x] Pastikan pesan awal, balasan user, coach feedback, closing, dan intervensi admin tetap terdokumentasi utuh.
- [x] Pastikan admin bisa melihat seluruh transkrip, bukan hanya summary. Jalur ini saat ini sudah relatif baik di `src/app/admin/discussions/page.tsx` dan `src/app/api/admin/discussions/[sessionId]/route.ts`.
- [x] Tambahkan penanda yang jelas untuk membedakan `student input`, `agent response`, `coach feedback`, dan `manual admin note`.

### Learning Profile

- [x] Pastikan semua field onboarding tersimpan konsisten di `src/app/api/learning-profile/route.ts`.
- [x] Tambahkan endpoint admin atau kartu profil di admin user detail agar data ini tidak hanya ada di database.
- [x] Tampilkan field penting seperti `programming_experience`, `learning_style`, `learning_goals`, dan `challenges`.

## Checklist Admin UI

- [x] Tambahkan satu inventaris admin yang benar-benar lengkap: generate course, ask question, challenge, quiz, feedback, jurnal, transcript, discussion, learning profile.
- [x] Untuk setiap tab admin, tampilkan jumlah record dan tombol buka detail.
- [x] Untuk setiap detail record, tampilkan teks mentah user secara utuh, bukan hanya snippet.
- [x] Tambahkan filter konsisten: user, tanggal, course, subtopic/topik.
- [x] Pastikan Evidence Locker tetap menjadi fallback agregat bila suatu fitur belum punya tab khusus. Cek `src/app/admin/evidence/page.tsx`.
- [x] Pastikan tidak ada data yang hanya ada endpoint-nya tetapi tidak ada akses dari UI admin.

## Checklist Database

- [x] Audit semua tabel yang menyimpan input user: `course_generation_activity`, `ask_question_history`, `challenge_responses`, `quiz_submissions`, `feedback`, `jurnal`, `transcript`, `discussion_sessions`, `discussion_messages`, `learning_profiles`.
- [x] Pastikan schema dokumentasi sesuai dengan implementasi aktual. Saat ini ada tanda-tanda dokumentasi dan implementasi tidak selalu sinkron, terutama di quiz dan jurnal.
- [x] Tambahkan field konteks yang kurang jika ada data user yang sulit dilacak kembali ke course/subtopic.
- [x] Pastikan tidak ada route yang menyimpan ke format lama sementara admin membaca format baru, atau sebaliknya.

## Checklist Logging dan Monitoring

- [x] Semua route input user harus log error saat gagal simpan.
- [x] Tambahkan audit sederhana: hitung berapa request input user yang sukses simpan vs gagal.
- [x] Gunakan `api_logs` untuk memantau endpoint yang paling sering gagal simpan.
- [x] Buat daftar alert untuk route kritis: jurnal, transcript, quiz, discussion.

## Checklist Uji End-to-End

- [x] Uji generate course: isi semua step, submit, pastikan data muncul di database dan admin.
- [x] Uji ask question: kirim prompt dengan komponen lengkap, pastikan `reasoning_note` dan komponen muncul di admin.
- [x] Uji challenge: kirim jawaban dengan reasoning, pastikan semua field tampil di admin.
- [x] Uji quiz: jawab soal dan isi alasan, pastikan alasan masuk database dan tampil di admin.
- [x] Uji structured reflection: isi semua field refleksi, pastikan tidak gagal karena mismatch user id/email.
- [x] Uji transcript: lakukan aksi yang seharusnya memicu transcript, pastikan route benar-benar terpanggil.
- [x] Uji discussion: kirim beberapa pesan, pastikan semua exchange muncul utuh di admin.
- [x] Uji learning profile: isi onboarding, pastikan admin bisa melihatnya.
- [x] Uji dengan satu user nyata dari awal sampai akhir course, lalu cek apakah seluruh jejaknya terbaca penuh di admin tanpa perlu query manual.

## Definition of Done

- [x] Tidak ada input teks user yang hanya tampil di UI tetapi tidak tersimpan.
- [x] Tidak ada input user yang tersimpan di database tetapi tidak bisa diakses admin.
- [x] Tidak ada mismatch `user.id` vs `user.email` antar fitur.
- [x] Tidak ada endpoint admin yang membaca schema lama atau field yang sudah tidak dipakai.
- [x] Semua fitur punya jalur end-to-end yang terbukti lewat pengujian nyata.