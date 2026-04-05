Berikut tahapan yang bisa kamu pakai untuk membangun “subtopic discussion” sebagai penutup tiap subtopik:

1. Rancang Struktur Data

Tentukan format outline: setiap subtopik otomatis punya node ekstra Diskusi Penutup.
Siapkan tabel Supabase baru: discussion_sessions (user, course, subtopic, status, phase, goals) dan discussion_messages (session_id, role, content, step_key, metadata).
Definisikan template pertanyaan/step di file JSON atau DB: fase diagnosis, analogi, latihan, evaluasi, ringkasan, plus rubric learning_goals.
2. API Backend

POST /api/discussion/start: buat atau resume session untuk user & subtopik; kirim prompt awal. Validasi auth + progres.
POST /api/discussion/respond: simpan jawaban, jalankan logic pemilihan prompt berikut (rule engine atau LLM dengan rubric), update goals & phase, tentukan apakah sesi sudah selesai.
(Opsional) GET /api/discussion/history: ambil riwayat untuk render ulang UI.
Integrasikan dengan user_progress: ketika session status completed, tandai subtopik selesai.
3. Agent / Logic Socratic

Implementasikan state machine: Diagnosis → Penjelasan → Latihan → Konsolidasi. Pastikan setiap phase punya daftar prompt dan kondisi transisi.
Gunakan rubric goals untuk memutuskan kelulusan: bila semua goal true, kirim pesan penutup dan update session.
4. Frontend

Saat outline dirender, muncul card/tab Diskusi Penutup.
Komponen diskusi: lakukan start ketika user masuk pertama kali, tampilkan chat thread, form input, indikator progress (fase + goals tercapai).
Tangani status completed dengan badge “Done” dan tombol lanjut modul berikutnya.
5. Monitoring & Ops

Logging pada setiap API call untuk memudahkan debugging.
Sediakan admin view untuk melihat transcript diskusi, status goal, dan intervensi manual bila diperlukan.


_____________________________

In order to auto-build the “Template Pertanyaan & Rubric” from the outline/materi generators (tanpa menulis manual per subtopik), kita perlu menyiapkan beberapa komponen baru:

1. Pipeline Generasi Template

Tambahkan tahap “discussion template generation” setelah outline + konten subtopik selesai dibuat. Pipeline menerima outline, learning objectives, dan ringkasan materi tiap subtopik.
Gunakan LLM (atau rule-based) untuk menyusun: daftar goals, daftar fase diskusi, prompt per step, dan rubric indikator keberhasilan. Output harus sudah sesuai schema JSON yang kita pakai.
2. Prompt/Instruksi LLM

Siapkan prompt sistem yang menjelaskan gaya Socratic, struktur fase (diagnosis → eksplorasi → latihan → sintesis), dan format JSON. Sertakan contoh JSON singkat sebagai referensi.
Input ke LLM meliputi:
ringkasan subtopik (judul, poin utama, kesimpulan),
learning outcomes,
daftar miskonsepsi umum jika tersedia.
Tekankan agar goal dihasilkan dari learning objectives dan konsep penting dalam materi.
3. Validator & Normalizer

Buat utilitas server yang memvalidasi JSON hasil LLM: cek field wajib (templateId, phases, learning_goals), pastikan referensi goal (goal_refs) valid.
Lakukan normalisasi: assign step_key unik, batasi panjang prompt/opsi, escape karakter khusus.
4. Penyimpanan & Versi

Simpan template dalam tabel baru discussion_templates:
discussion_templates(
  id uuid PK,
  course_id uuid,
  subtopic_id uuid,
  version text,
  source jsonb,         -- outline snapshot/material
  template jsonb,
  created_at timestamptz,
  generated_by text     -- 'auto'
);
Hubungkan discussion_sessions.template_version dengan discussion_templates.version supaya ketika materi diperbarui, kita bisa regenerate versi baru tapi tetap menjaga sesi lama.
5. Integrasi Outline Generator

Setelah outline generator selesai menulis materi pages untuk subtopik, trigger job generateDiscussionTemplate(subtopicContext):
ringkas materi jika perlu (pre-summarizer),
panggil LLM dengan prompt di atas,
validasi/normalisasi,
simpan ke discussion_templates,
update metadata subtopik (discussion_template_version).
6. Fallback & Review

Jika validasi gagal, tandai status = needs_review dan jatuhkan template default minimal agar UI tetap jalan (misal prompt generik).
Siapkan CLI/admin tool untuk meninjau dan mengedit template yang terhasilkan (karena auto-generation mungkin perlu koreksi manual di awal).
7. Monitoring & Testing

Log token usage, waktu respon, dan error.
Unit test validator + schema (menggunakan sample JSON).
End-to-end test: generate outline dummy → jalankan pipeline → pastikan UI diskusi bisa start dengan template auto-generated.


_______________________



1. Skema Tabel Supabase
Jalankan SQL ini sekali saja untuk membuat tabel & indeks.

-- Template hasil auto-generasi
CREATE TABLE discussion_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  version text NOT NULL,                      -- mis. "2024-10-21T10:30:00Z"
  source jsonb NOT NULL,                      -- snapshot outline & materi
  template jsonb NOT NULL,                    -- hasil LLM (phases, goals, dsb)
  generated_by text NOT NULL DEFAULT 'auto',
  status text NOT NULL DEFAULT 'ready',       -- ready | needs_review | failed
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX discussion_templates_unique
  ON discussion_templates (subtopic_id, version);

-- Session & pesan (lihat detail sebelumnya)
CREATE TABLE discussion_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  subtopic_id uuid NOT NULL REFERENCES subtopics(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES discussion_templates(id) ON DELETE RESTRICT,
  status text NOT NULL CHECK (status IN ('in_progress','completed','abandoned')),
  phase text NOT NULL,
  learning_goals jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, subtopic_id)
);

CREATE TABLE discussion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES discussion_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('agent','student','system')),
  content text NOT NULL,
  step_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX discussion_messages_session_idx
  ON discussion_messages (session_id, created_at);
Tambahkan RLS/policy mengikuti pola tabel lain (user hanya boleh baca/kirim miliknya).

2. Service generateDiscussionTemplate.ts
Taruh di src/services/discussion/generateDiscussionTemplate.ts:

import { openai } from '@/lib/openai';
import { adminDb } from '@/lib/database';
import { z } from 'zod';

const templateSchema = z.object({
  templateId: z.string(),
  phases: z.array(z.object({
    id: z.string(),
    description: z.string().optional(),
    steps: z.array(z.object({
      key: z.string(),
      prompt: z.string(),
      expected_type: z.enum(['open','mcq','scale','reflection']).default('open'),
      options: z.array(z.string()).optional(),
      answer: z.string().optional(),
      feedback: z.object({
        correct: z.string().optional(),
        incorrect: z.string().optional()
      }).optional(),
      goal_refs: z.array(z.string()).default([])
    }))
  })),
  learning_goals: z.array(z.object({
    id: z.string(),
    description: z.string()
  }))
});

interface GenerateParams {
  courseId: string;
  subtopicId: string;
  subtopicTitle: string;
  learningObjectives: string[];
  summary: string;
  keyTakeaways: string[];
  misconceptions?: string[];
}

export async function generateDiscussionTemplate(params: GenerateParams) {
  const { courseId, subtopicId } = params;
  const source = {
    ...params,
    generatedAt: new Date().toISOString()
  };

  const prompt = buildPrompt(params);
  const completion = await openai.responses.create({
    model: 'gpt-4.1-mini',
    input: prompt,
    response_format: { type: 'json_schema', json_schema: templateSchema }
  });

  const raw = completion.output_text;
  const parsed = templateSchema.parse(JSON.parse(raw));
  const version = new Date().toISOString();

  const { data, error } = await adminDb
    .from('discussion_templates')
    .insert({
      course_id: courseId,
      subtopic_id: subtopicId,
      version,
      source,
      template: parsed,
      generated_by: 'auto'
    })
    .select('id')
    .single();

  if (error) throw error;
  return { templateId: data.id, version, template: parsed };
}

function buildPrompt({
  subtopicTitle,
  learningObjectives,
  summary,
  keyTakeaways,
  misconceptions = []
}: GenerateParams) {
  return `You are an instructional designer building a Socratic discussion.
Subtopic title: ${subtopicTitle}
Learning objectives:
- ${learningObjectives.join('\n- ')}

Key takeaways:
- ${keyTakeaways.join('\n- ')}

Common misconceptions:
- ${misconceptions.join('\n- ') || 'None provided'}

Produce JSON matching schema:
{
  "templateId": string,
  "phases": [
    { "id": "diagnosis", "steps": [...] },
    { "id": "exploration", ... },
    { "id": "practice", ... },
    { "id": "synthesis", ... }
  ],
  "learning_goals": [{ "id": "...", "description": "..." }]
}
Rules:
- Use the subtopic content to craft goals and prompts.
- Each phase must have ≥1 step.
- Practice phase must include at least one question with answer & feedback.
- Link steps to goals via goal_refs.
Return JSON only.`;
}
3. Integrasi Pipeline Outline
Di modul generator existing (misal src/services/content/generateSubtopic.ts):

Setelah materi & key takeaways dikembalikan, panggil generateDiscussionTemplate.
Update metadata subtopik (discussion_template_version/template_id) di DB.
Return ke frontend bersamaan dengan data subtopik.
4. API Diskusi

POST /api/discussion/start:
Ambil atau buat session (cek discussion_sessions untuk user & subtopic).
Jika belum ada, fetch discussion_templates terbaru (fallback ke versi default kalau status needs_review).
Inisialisasi learning_goals (array goals with covered=false).
Simpan pesan pembuka (phase diagnosis, step ...q1).
POST /api/discussion/respond:
Simpan jawaban student.
Jalankan evaluator: cocokkan ke rule/LLM (kamu bisa buat modul scoreResponse). Tandai goals tercapai di JSON.
Pilih prompt berikut atau kirim feedback final kalau semua covered.
Update phase/status.
5. Validator CLI (opsional)
Tambahkan script pnpm run validate:template yang membaca entry baru di discussion_templates berstatus needs_review dan memvalidasi dengan schema.

6. Frontend Update

Sidebar: tambahkan step Diskusi Penutup per subtopik (ambil dari outline metadata).
Tab discussion page: fetch session (start/resume), render chat, progress goals, disable “Complete” hingga session status completed.
7. Monitoring

Log generation event (success/error) di Supabase table system_logs atau Sentry.
Pastikan rate-limit request ke OpenAI.

Berikut skrip SQL lengkap untuk mengaktifkan RLS dan menambahkan policy sehingga setiap pengguna hanya bisa mengakses data diskusinya sendiri (dengan pengecualian template yang dapat dibaca semua akun terautentikasi):

-- DISCUSSION TEMPLATES (dibaca oleh semua user terautentikasi)
ALTER TABLE discussion_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view discussion templates"
  ON discussion_templates
  FOR SELECT
  TO authenticated
  USING (true);

-- DISCUSSION SESSIONS (user hanya bisa kelola sesi miliknya)
ALTER TABLE discussion_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their discussion sessions"
  ON discussion_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their discussion sessions"
  ON discussion_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their discussion sessions"
  ON discussion_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid()::text = user_id::text)
  WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can delete their discussion sessions"
  ON discussion_sessions
  FOR DELETE
  TO authenticated
  USING (auth.uid()::text = user_id::text);

-- DISCUSSION MESSAGES (hanya pemilik sesi yang boleh baca/tulis)
ALTER TABLE discussion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their discussion messages"
  ON discussion_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM discussion_sessions s
      WHERE s.id = discussion_messages.session_id
        AND s.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can insert their discussion messages"
  ON discussion_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM discussion_sessions s
      WHERE s.id = discussion_messages.session_id
        AND s.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can update their discussion messages"
  ON discussion_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM discussion_sessions s
      WHERE s.id = discussion_messages.session_id
        AND s.user_id::text = auth.uid()::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM discussion_sessions s
      WHERE s.id = discussion_messages.session_id
        AND s.user_id::text = auth.uid()::text
    )
  );

CREATE POLICY "Users can delete their discussion messages"
  ON discussion_messages
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM discussion_sessions s
      WHERE s.id = discussion_messages.session_id
        AND s.user_id::text = auth.uid()::text
    )
  );
Jalankan skrip ini setelah tabel dibuat. Pastikan role authenticated sudah ada (default di Supabase).