-- MVR Item 2: course template metadata + unlock dependency table + seed 4 Fase E courses + 26 leaf-subtopik kanonik.
-- Konten leaf dikosongkan; Item 4b (cache lock + QA) yang nanti generate isi.
-- Applied via Supabase migration `mvr_w2_course_template_unlock_and_seed_fase_e` (version 20260516061720).

-- 1. Tambah kolom template di courses
ALTER TABLE courses
  ADD COLUMN is_template BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN template_topic VARCHAR(50),
  ADD COLUMN source_reference TEXT;

CREATE INDEX idx_courses_is_template ON courses(is_template);
CREATE INDEX idx_courses_template_topic ON courses(template_topic) WHERE template_topic IS NOT NULL;
CREATE UNIQUE INDEX uniq_courses_template_topic
  ON courses(template_topic)
  WHERE is_template = true AND template_topic IS NOT NULL;

-- 2. Tabel dependency unlock (1 row per template topic; self-FK ke prereq)
CREATE TABLE course_unlock_dependencies (
  course_template_topic VARCHAR(50) PRIMARY KEY,
  prereq_template_topic VARCHAR(50)
    REFERENCES course_unlock_dependencies(course_template_topic) ON DELETE SET NULL,
  unlock_threshold NUMERIC(3,2) NOT NULL DEFAULT 0.70
    CHECK (unlock_threshold >= 0 AND unlock_threshold <= 1),
  display_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Seed dependency 4 baris (insert per baris karena FK ke baris sebelumnya)
INSERT INTO course_unlock_dependencies (course_template_topic, prereq_template_topic, display_order) VALUES
  ('mengenal-algoritma', NULL, 1);
INSERT INTO course_unlock_dependencies (course_template_topic, prereq_template_topic, display_order) VALUES
  ('struktur-kendali', 'mengenal-algoritma', 2);
INSERT INTO course_unlock_dependencies (course_template_topic, prereq_template_topic, display_order) VALUES
  ('memilih-algoritma', 'struktur-kendali', 3);
INSERT INTO course_unlock_dependencies (course_template_topic, prereq_template_topic, display_order) VALUES
  ('struktur-data', 'memilih-algoritma', 4);

-- 4. Seed 4 course template + subtopics wrapper + 26 leaf via DO block.
-- Admin ID hardcoded per state DB 2026-05-16 (1 admin terdaftar).
-- Kolom `content` leaf-subtopic akan diisi oleh pipeline Item 4b — seed sengaja kosong.
DO $$
DECLARE
  v_admin_id UUID := 'ccb27949-30f6-4f9b-bcbe-d114f707bbea';
  v_course_1 UUID;
  v_course_2 UUID;
  v_course_3 UUID;
  v_course_4 UUID;
  v_subtopic_1 UUID;
  v_subtopic_2 UUID;
  v_subtopic_3 UUID;
  v_subtopic_4 UUID;
BEGIN
  -- Course 1: Mengenal Algoritma dan Pemrograman (hal. 29-44)
  INSERT INTO courses (title, description, subject, difficulty_level, estimated_duration, mode, is_template, template_topic, source_reference, created_by)
  VALUES (
    'Mengenal Algoritma dan Pemrograman',
    'Memahami konsep algoritma, hubungan berpikir komputasional, notasi diagram alir ANSI/ISO, dan pseudokode beserta tracing-nya (Fase E SMA).',
    'Algoritma & Pemrograman (Fase E)',
    'Beginner',
    180,
    'research', true, 'mengenal-algoritma',
    'Mushthofa dkk. 2023, Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi, Kemdikbudristek, Bab 2 hal. 29-44',
    v_admin_id
  ) RETURNING id INTO v_course_1;

  INSERT INTO subtopics (course_id, title, content, order_index)
  VALUES (v_course_1, '1. Mengenal Algoritma dan Pemrograman', '{}'::jsonb, 0)
  RETURNING id INTO v_subtopic_1;

  INSERT INTO leaf_subtopics (course_id, module_id, module_title, title, normalized_title, module_index, subtopic_index) VALUES
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.1 Algoritma: Definisi & Hubungan Berpikir Komputasional', '1.1 algoritma: definisi & hubungan berpikir komputasional', 0, 0),
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.2 Diagram Alir: Notasi ANSI/ISO',                                  '1.2 diagram alir: notasi ansi/iso',                                  0, 1),
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.3 Diagram Alir: Contoh & Latihan',                                 '1.3 diagram alir: contoh & latihan',                                 0, 2),
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.4 Menelusuri Diagram Alir (Tracing)',                              '1.4 menelusuri diagram alir (tracing)',                              0, 3),
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.5 Pseudokode: Konvensi & Contoh',                                  '1.5 pseudokode: konvensi & contoh',                                  0, 4),
    (v_course_1, v_subtopic_1, '1. Mengenal Algoritma dan Pemrograman', '1.6 Menelusuri Pseudokode',                                          '1.6 menelusuri pseudokode',                                          0, 5);

  -- Course 2: Membuat Program Sesuai Struktur Kendalinya (hal. 45-79)
  INSERT INTO courses (title, description, subject, difficulty_level, estimated_duration, mode, is_template, template_topic, source_reference, created_by)
  VALUES (
    'Membuat Program Sesuai Struktur Kendalinya',
    'Menguasai ekspresi, operator, percabangan (if-else, switch-case, bersarang), perulangan (for/while/do-while/bersarang), dan fungsi beserta variabel lokal (Fase E SMA).',
    'Algoritma & Pemrograman (Fase E)',
    'Beginner',
    420,
    'research', true, 'struktur-kendali',
    'Mushthofa dkk. 2023, Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi, Kemdikbudristek, Bab 2 hal. 45-79',
    v_admin_id
  ) RETURNING id INTO v_course_2;

  INSERT INTO subtopics (course_id, title, content, order_index)
  VALUES (v_course_2, '2. Membuat Program Sesuai Struktur Kendalinya', '{}'::jsonb, 0)
  RETURNING id INTO v_subtopic_2;

  INSERT INTO leaf_subtopics (course_id, module_id, module_title, title, normalized_title, module_index, subtopic_index) VALUES
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.1 Belajar Algoritma sambil Menyelesaikan Masalah',          '2.1 belajar algoritma sambil menyelesaikan masalah',          0, 0),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.2 Ekspresi: Operand & Operator',                            '2.2 ekspresi: operand & operator',                            0, 1),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.3 Operator Matematika/Logika/Relasional/Kesamaan',          '2.3 operator matematika/logika/relasional/kesamaan',          0, 2),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.4 Percabangan If-Else',                                     '2.4 percabangan if-else',                                     0, 3),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.5 Percabangan Switch-Case',                                 '2.5 percabangan switch-case',                                 0, 4),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.6 Percabangan Bersarang',                                   '2.6 percabangan bersarang',                                   0, 5),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.7 Perulangan For-Loop',                                     '2.7 perulangan for-loop',                                     0, 6),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.8 Perulangan While',                                        '2.8 perulangan while',                                        0, 7),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.9 Perulangan Do-While',                                     '2.9 perulangan do-while',                                     0, 8),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.10 Perulangan Bersarang & Perulangan Tak Terbatas',         '2.10 perulangan bersarang & perulangan tak terbatas',         0, 9),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.11 Fungsi: Membuat & Memanggil',                            '2.11 fungsi: membuat & memanggil',                            0, 10),
    (v_course_2, v_subtopic_2, '2. Membuat Program Sesuai Struktur Kendalinya', '2.12 Fungsi: Variabel Lokal',                                 '2.12 fungsi: variabel lokal',                                 0, 11);

  -- Course 3: Memilih Algoritma untuk Masalah di Kehidupan Nyata (hal. 80-95)
  INSERT INTO courses (title, description, subject, difficulty_level, estimated_duration, mode, is_template, template_topic, source_reference, created_by)
  VALUES (
    'Memilih Algoritma untuk Masalah di Kehidupan Nyata',
    'Mempelajari pencarian (searching), pengurutan (sorting): bubble sort, insertion sort, dan selection sort beserta analisis pemilihan algoritma (Fase E SMA).',
    'Algoritma & Pemrograman (Fase E)',
    'Beginner',
    240,
    'research', true, 'memilih-algoritma',
    'Mushthofa dkk. 2023, Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi, Kemdikbudristek, Bab 2 hal. 80-95',
    v_admin_id
  ) RETURNING id INTO v_course_3;

  INSERT INTO subtopics (course_id, title, content, order_index)
  VALUES (v_course_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '{}'::jsonb, 0)
  RETURNING id INTO v_subtopic_3;

  INSERT INTO leaf_subtopics (course_id, module_id, module_title, title, normalized_title, module_index, subtopic_index) VALUES
    (v_course_3, v_subtopic_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '3.1 Pencarian (Searching): Konsep',  '3.1 pencarian (searching): konsep',  0, 0),
    (v_course_3, v_subtopic_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '3.2 Pengurutan (Sorting): Pengantar','3.2 pengurutan (sorting): pengantar',0, 1),
    (v_course_3, v_subtopic_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '3.3 Bubble Sort',                    '3.3 bubble sort',                    0, 2),
    (v_course_3, v_subtopic_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '3.4 Insertion Sort',                 '3.4 insertion sort',                 0, 3),
    (v_course_3, v_subtopic_3, '3. Memilih Algoritma untuk Masalah di Kehidupan Nyata', '3.5 Selection Sort',                 '3.5 selection sort',                 0, 4);

  -- Course 4: Memilih Struktur Data (hal. 96-105)
  INSERT INTO courses (title, description, subject, difficulty_level, estimated_duration, mode, is_template, template_topic, source_reference, created_by)
  VALUES (
    'Memilih Struktur Data untuk Masalah di Kehidupan Nyata',
    'Mempelajari struktur data dasar: antrean (queue) dan tumpukan (stack) beserta operasi enqueue/dequeue dan push/pop dalam konteks pemecahan masalah nyata (Fase E SMA).',
    'Algoritma & Pemrograman (Fase E)',
    'Beginner',
    180,
    'research', true, 'struktur-data',
    'Mushthofa dkk. 2023, Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi, Kemdikbudristek, Bab 2 hal. 96-105',
    v_admin_id
  ) RETURNING id INTO v_course_4;

  INSERT INTO subtopics (course_id, title, content, order_index)
  VALUES (v_course_4, '4. Memilih Struktur Data untuk Masalah di Kehidupan Nyata', '{}'::jsonb, 0)
  RETURNING id INTO v_subtopic_4;

  INSERT INTO leaf_subtopics (course_id, module_id, module_title, title, normalized_title, module_index, subtopic_index) VALUES
    (v_course_4, v_subtopic_4, '4. Memilih Struktur Data untuk Masalah di Kehidupan Nyata', '4.1 Pengantar Struktur Data', '4.1 pengantar struktur data', 0, 0),
    (v_course_4, v_subtopic_4, '4. Memilih Struktur Data untuk Masalah di Kehidupan Nyata', '4.2 Antrean (Queue)',          '4.2 antrean (queue)',          0, 1),
    (v_course_4, v_subtopic_4, '4. Memilih Struktur Data untuk Masalah di Kehidupan Nyata', '4.3 Tumpukan (Stack)',         '4.3 tumpukan (stack)',         0, 2);
END $$;
