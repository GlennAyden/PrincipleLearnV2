# API Reference

## Conventions

- route handlers memakai App Router `route.ts`
- mayoritas endpoint mengembalikan JSON
- endpoint AI tertentu mengembalikan stream text/plain
- auth utama dibawa lewat cookie, bukan bearer token

## Auth And Session

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/auth/login` | `POST` | Login user |
| `/api/auth/register` | `POST` | Registrasi user |
| `/api/auth/logout` | `POST` | Logout user |
| `/api/auth/refresh` | `POST` | Rotasi access/refresh token |
| `/api/auth/me` | `GET` | Info user aktif |
| `/api/admin/login` | `POST` | Login admin |
| `/api/admin/register` | `POST` | Registrasi admin |
| `/api/admin/logout` | `POST` | Logout admin |
| `/api/admin/me` | `GET` | Info admin aktif |

## User Learning APIs

| Endpoint Group | Purpose |
| --- | --- |
| `/api/courses` | List course milik user |
| `/api/courses/[id]` | Detail dan delete course |
| `/api/generate-course` | Generate outline course dengan AI |
| `/api/generate-subtopic` | Generate halaman subtopik dengan AI |
| `/api/generate-examples` | Generate examples tambahan |
| `/api/ask-question` | Q&A berbasis AI |
| `/api/challenge-thinking` | Pertanyaan challenge |
| `/api/challenge-feedback` | Feedback atas jawaban challenge |
| `/api/challenge-response` | Simpan jawaban challenge |
| `/api/quiz/submit` | Simpan hasil quiz |
| `/api/quiz/status` | Ambil status quiz user |
| `/api/jurnal/save` | Simpan refleksi/jurnal historis |
| `/api/transcript/save` | Simpan transcript |
| `/api/feedback` | Simpan direct feedback atau compatibility write |
| `/api/user-progress` | Ambil/simpan progress |
| `/api/learning-profile` | Ambil/simpan learning profile |
| `/api/discussion/start` | Mulai diskusi Socratic |
| `/api/discussion/respond` | Lanjutkan diskusi |
| `/api/discussion/history` | Riwayat diskusi |
| `/api/discussion/module-status` | Status diskusi per modul |

## Admin APIs

### Dashboard And Monitoring

- `/api/admin/dashboard`
- `/api/admin/monitoring/logging`
- `/api/admin/insights`
- `/api/admin/insights/export`

### Users

- `/api/admin/users`
- `/api/admin/users/export`
- `/api/admin/users/[id]`
- `/api/admin/users/[id]/detail`
- `/api/admin/users/[id]/activity-summary`
- `/api/admin/users/[id]/subtopics`
- `/api/admin/siswa/[id]/evolusi`

### Activity

`/api/admin/activity/*` mencakup inspection dan analytics untuk:

- actions
- analytics
- ask-question
- challenge
- courses
- discussion
- export
- feedback
- generate-course
- jurnal
- learning-profile
- quiz
- search
- topics
- transcript

### Discussions

`/api/admin/discussions/*` dipakai untuk:

- daftar session
- detail session
- analytics
- module status
- feedback review

### Research

`/api/admin/research/*` dipakai untuk:

- analytics
- auto scores
- auto score summary
- bulk operations
- classifications
- classify
- export
- indicators
- sessions

## Validation Pattern

Endpoint penting memvalidasi payload dengan schema di `src/lib/schemas.ts`. Jika menambah endpoint baru, buat schema lebih dulu jika payload bukan trivial.

## Reflection Notes

- `/api/jurnal/save` adalah write-path utama untuk refleksi terstruktur.
- `jurnal` disimpan sebagai history log, bukan one-row-per-course.
- `/api/feedback` masih valid untuk jalur feedback langsung, tetapi angka admin/research harus dibaca sebagai model refleksi terpadu dari `jurnal + feedback`.
- bila migration `origin_jurnal_id` diterapkan, row `feedback` hasil mirror dari jurnal sebaiknya membawa linkage eksplisit ke row sumbernya.
- rollout live untuk domain ini dipersiapkan lewat `scripts/reflection-rollout-live.mjs` dan snippet di `docs/sql/`.

## Error Pattern

Secara umum:

- `401` untuk autentikasi gagal atau token kedaluwarsa
- `403` untuk CSRF mismatch atau akses ditolak
- `404` untuk resource tidak ditemukan
- `429` untuk rate limit
- `500` untuk unexpected server error

Route tidak selalu seragam sepenuhnya, jadi saat merapikan endpoint baru sebaiknya ikuti pola error yang sudah dipakai di domain terdekat.

## Source Of Truth

Untuk daftar route lengkap, lihat `src/app/api/`. Dokumen ini berfungsi sebagai peta domain API, bukan dump semua handler line-by-line.
