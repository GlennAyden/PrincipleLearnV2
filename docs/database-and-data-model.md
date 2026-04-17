# Database And Data Model

## Database Role In The System

Supabase PostgreSQL adalah storage utama untuk:

- akun dan session-related data
- course dan subtopic
- hasil belajar dan aktivitas user
- log admin dan monitoring
- data riset RM2 dan RM3

## Access Modes

`src/lib/database.ts` menyediakan dua mode akses:

- service-role client untuk operasi backend yang perlu kontrol aplikasi penuh
- anon client untuk read-only path tertentu

Karena auth tidak memakai Supabase Auth, banyak otorisasi tetap dilakukan di layer aplikasi.

## Core Data Domains

### Identity And Access

- `users`
- token/cookie flows di level aplikasi
- `learning_profiles`
- `rate_limits`

### Course Delivery

- `courses`
- `subtopics`
- `subtopic_cache`
- `discussion_templates`

### Learning Activity

- `quiz`
- `quiz_submissions`
- `ask_question_history`
- `challenge_responses`
- `jurnal`
- `feedback`
- `transcript`
- `discussion_sessions`
- `discussion_messages`
- `learning_sessions`

### Monitoring And Operations

- `api_logs`
- admin-related activity tables
- optional table seperti `discussion_admin_actions`

### Research

- `prompt_classifications`
- `cognitive_indicators`
- `auto_cognitive_scores`
- `inter_rater_reliability`

## Important Modeling Notes

- `jurnal` adalah nama domain yang sengaja dipertahankan.
- model refleksi saat ini bersifat historis: setiap submit `jurnal` membuat row baru, bukan overwrite satu row per course.
- `feedback` masih dipertahankan sebagai tabel terpisah untuk rating/comment dan beberapa jalur legacy, tetapi secara admin/read-model ia diperlakukan sebagai bagian dari domain refleksi yang sama.
- `feedback.origin_jurnal_id` adalah penghubung eksplisit antara mirror feedback dan row `jurnal` asalnya; row feedback langsung boleh tetap `NULL`.
- quiz dan subtopic punya kebutuhan sinkronisasi label dan cache key; `quiz-sync.ts` membantu menjaga konsistensinya.
- `subtopic_cache` penting untuk menghindari regenerasi AI yang tidak perlu.
- `discussion_templates.source.generation` menyimpan provenance template diskusi untuk analisis riset (`ai_initial` vs `ai_regenerated`, scope, trigger, model, prompt version, jumlah attempt, dan `status`). Kolom `generated_by` tetap dipakai sebagai compatibility marker runtime (`auto`/`auto-module`).
- Row `discussion_templates` dengan `generated_by = 'preparation-status'` adalah status operasional persiapan template (`queued`, `running`, `failed`, `superseded`), bukan template siap pakai. Runtime harus hanya memakai template valid dari `generated_by = 'auto'` atau `auto-module`.
- Data demo activity tidak boleh otomatis dibuat di production; seed demo hanya aktif di non-production atau jika `ENABLE_PRODUCTION_ACTIVITY_SEED=true` diset secara eksplisit.
- research tables bukan hanya arsip; mereka bagian aktif dari admin analytics.

## Conceptual Relationships

- satu `user` dapat memiliki banyak `courses`
- satu `course` memiliki banyak `subtopics`
- satu `subtopic` dapat menghasilkan banyak aktivitas: quiz, ask-question, challenge, refleksi (`jurnal + feedback`), transcript
- satu `discussion_session` terkait dengan course/modul tertentu dan memiliki banyak `discussion_messages`
- satu interaksi yang relevan secara riset dapat dipetakan ke klasifikasi prompt dan/atau cognitive score

## Reflection Model

- write-path utama refleksi user ada di `/api/jurnal/save`
- `jurnal` menyimpan isi refleksi utama, konteks subtopik, dan payload kualitatif yang dibutuhkan untuk audit historis
- `feedback` menyimpan rating/comment yang bisa berasal dari submit langsung atau mirror dari structured reflection; mirror baru dari `/api/jurnal/save` harus membawa `origin_jurnal_id`
- admin activity, dashboard, dan insights membaca keduanya sebagai satu model refleksi terpadu untuk menghindari double count
- legacy unique constraint pada `jurnal` tidak dipakai lagi; riwayat refleksi harus historis per submit/subtopik

## Data Ownership Rules

- course dan aktivitas belajar harus selalu bisa dipetakan ke user pemilik
- admin dapat membaca agregasi dan detail untuk kebutuhan operasional/riset
- endpoint public tidak boleh mengekspos data mentah lintas user

## Operational References

Folder [`docs/sql/`](sql/) dipertahankan sebagai referensi SQL lama untuk migration snippets, perbaikan schema, dan audit manual. Ia bukan sumber kebenaran utama, tetapi masih berguna saat recovery atau verifikasi struktur.

Snippet yang relevan untuk domain refleksi sekarang:

- `docs/sql/align_reflection_history_model.sql`
- `docs/sql/add_feedback_rating_guardrails.sql`
- `docs/sql/add_feedback_origin_jurnal_link.sql`
- `docs/sql/backfill_feedback_origin_jurnal_id.sql`
- `docs/sql/enforce_feedback_origin_jurnal_uniqueness.sql`
- `docs/sql/drop_legacy_jurnal_user_course_unique.sql`

## Contributor Checklist

- saat menambah tabel baru, dokumentasikan domain dan ownership-nya
- saat menambah aktivitas user baru, pikirkan apakah perlu muncul di admin analytics
- saat mengubah `jurnal` atau `feedback`, cek apakah perubahan itu masih konsisten dengan unified reflection read-model
- saat mengubah schema quiz/subtopic, cek dampak ke `quiz-sync.ts`
- saat menambah data riset baru, jelaskan relasinya ke RM2 atau RM3
