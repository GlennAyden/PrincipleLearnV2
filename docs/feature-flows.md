# Feature Flows

## 1. Signup To Learning

1. User membuka landing page.
2. User signup atau login.
3. Middleware mengizinkan akses ke halaman yang memerlukan auth.
4. Jika onboarding belum selesai, user diarahkan ke `/onboarding`.
5. Setelah learning profile tersimpan, user masuk ke dashboard.

## 2. Request Course

1. User masuk ke `/request-course/step1`.
2. User mengisi topic dan goal.
3. User lanjut ke `step2` dan `step3`.
4. Halaman `generating` memicu `/api/generate-course`.
5. AI menghasilkan outline course.
6. Course dan subtopic disimpan ke database.
7. User diarahkan ke dashboard atau halaman course baru.

## 3. Study A Subtopic

1. User membuka `/course/[courseId]`.
2. User memilih subtopic/page.
3. Jika detail subtopic belum ada, client meminta `/api/generate-subtopic`.
4. Response AI membangun objectives, pages, takeaways, quiz, dan what-next.
5. Hasil disimpan ke cache dan state client.

## 4. Ask Question

1. User membuka tab ask-question.
2. Frontend mengirim pertanyaan, context, dan prompt components.
3. `/api/ask-question` memproses request dan mengalirkan jawaban model.
4. Riwayat pertanyaan dan jawaban dapat dicatat untuk analitik.

## 5. Challenge Thinking

1. User meminta challenge baru.
2. `/api/challenge-thinking` menghasilkan prompt tantangan.
3. User mengirim jawaban.
4. `/api/challenge-feedback` memberi feedback.
5. `/api/challenge-response` menyimpan respons dan reasoning note.

## 6. Quiz

1. User menjawab quiz per subtopic.
2. Frontend mengirim `moduleTitle`, `subtopicTitle`, answers, dan score.
3. `/api/quiz/submit` menyimpan submission.
4. `/api/quiz/status` dipakai untuk menampilkan attempt state dan riwayat terbaru.

## 7. Refleksi, Feedback, Dan Transcript

1. User mengisi refleksi belajar sebagai aktivitas utama evaluasi kualitatif.
2. `/api/jurnal/save` menyimpan row historis baru yang terikat ke course/subtopic dan tidak meng-overwrite refleksi sebelumnya.
3. Jika refleksi membawa rating atau komentar konten, backend dapat memirror bagian itu ke tabel `feedback` untuk kebutuhan reporting dan analytics.
4. `/api/feedback` tetap tersedia untuk jalur direct-feedback atau compatibility path, tetapi bukan lagi write-path utama refleksi terstruktur.
5. `/api/transcript/save` menyimpan transcript belajar saat diperlukan.

## 8. Socratic Discussion

1. User memulai diskusi dari modul terkait.
2. `/api/discussion/start` membuat session dan pesan pembuka.
3. User merespons.
4. `/api/discussion/respond` mengevaluasi pesan dan menghasilkan balasan AI.
5. `/api/discussion/history` dan `/api/discussion/module-status` melacak progres.

## 9. Admin Monitoring

1. Admin login dari `/admin/login`.
2. Middleware memverifikasi role admin.
3. Dashboard memanggil `/api/admin/dashboard`.
4. Admin membuka surface lain seperti `siswa`, `aktivitas`, `riset`, `ekspor`.

## 10. Research Pipeline

1. Aktivitas user masuk ke tabel domain masing-masing.
2. Prompt dapat diklasifikasikan ke stage RM2.
3. Interaksi relevan dapat diberi cognitive score RM3.
4. Domain refleksi dibaca sebagai model terpadu dari `jurnal + feedback` agar mirror row tidak dihitung ganda.
5. Admin meninjau analitik, detail siswa, atau export dataset.
