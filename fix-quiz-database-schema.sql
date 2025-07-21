-- Fix quiz database schema and add sample data
-- This should be run in Supabase SQL editor

-- Step 1: Add unique constraint for quiz questions (to prevent duplicates)
ALTER TABLE quiz ADD CONSTRAINT quiz_unique_question 
UNIQUE (course_id, subtopic_id, question);

-- Step 2: Get course and subtopic info for current data
-- (Run this to see what we have)
SELECT 
  c.id as course_id,
  c.title as course_title,
  s.id as subtopic_id,
  s.title as subtopic_title,
  s.order_index
FROM courses c
LEFT JOIN subtopics s ON c.id = s.course_id
WHERE c.title ILIKE '%python%'
ORDER BY s.order_index;

-- Step 3: Insert sample quiz questions for Module 1
INSERT INTO quiz (course_id, subtopic_id, question, options, correct_answer, explanation, created_at)
VALUES 
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 1' LIMIT 1),
  'Apa yang dimaksud dengan Python?',
  '["Sebuah bahasa pemrograman", "Sebuah ular", "Sebuah software", "Sebuah website"]'::jsonb,
  'Sebuah bahasa pemrograman',
  'Jawaban yang benar adalah: Sebuah bahasa pemrograman',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 1' LIMIT 1),
  'Mengapa Python populer di kalangan programmer?',
  '["Sulit dipelajari", "Mudah dipelajari dan sintaks yang jelas", "Hanya untuk web", "Tidak gratis"]'::jsonb,
  'Mudah dipelajari dan sintaks yang jelas',
  'Jawaban yang benar adalah: Mudah dipelajari dan sintaks yang jelas',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 1' LIMIT 1),
  'Bagaimana cara menginstall Python di Windows?',
  '["Download dari python.org", "Tidak bisa di Windows", "Harus bayar dulu", "Perlu kompile sendiri"]'::jsonb,
  'Download dari python.org',
  'Jawaban yang benar adalah: Download dari python.org',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 1' LIMIT 1),
  'Apa keuntungan utama Python dibanding bahasa lain?',
  '["Lebih lambat", "Sintaks yang kompleks", "Mudah dibaca dan dipelajari", "Hanya untuk data science"]'::jsonb,
  'Mudah dibaca dan dipelajari',
  'Jawaban yang benar adalah: Mudah dibaca dan dipelajari',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 1' LIMIT 1),
  'Python pertama kali dikembangkan oleh siapa?',
  '["Mark Zuckerberg", "Guido van Rossum", "Bill Gates", "Larry Page"]'::jsonb,
  'Guido van Rossum',
  'Jawaban yang benar adalah: Guido van Rossum',
  NOW()
)
ON CONFLICT (course_id, subtopic_id, question) DO UPDATE SET
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  explanation = EXCLUDED.explanation,
  created_at = EXCLUDED.created_at;

-- Step 4: Add quiz questions for Module 2
INSERT INTO quiz (course_id, subtopic_id, question, options, correct_answer, explanation, created_at)
VALUES 
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 2' LIMIT 1),
  'Apa itu variabel dalam Python?',
  '["Tempat menyimpan data", "Sebuah fungsi", "Sebuah library", "Sebuah error"]'::jsonb,
  'Tempat menyimpan data',
  'Jawaban yang benar adalah: Tempat menyimpan data',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 2' LIMIT 1),
  'Tipe data mana yang digunakan untuk menyimpan angka desimal?',
  '["int", "str", "float", "bool"]'::jsonb,
  'float',
  'Jawaban yang benar adalah: float',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 2' LIMIT 1),
  'Bagaimana cara membuat komentar dalam Python?',
  '["// komentar", "/* komentar */", "# komentar", "-- komentar"]'::jsonb,
  '# komentar',
  'Jawaban yang benar adalah: # komentar',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 2' LIMIT 1),
  'Operator mana yang digunakan untuk pembagian di Python?',
  '["+", "-", "*", "/"]'::jsonb,
  '/',
  'Jawaban yang benar adalah: /',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 2' LIMIT 1),
  'Apa hasil dari 10 // 3 di Python?',
  '["3.33", "3", "4", "Error"]'::jsonb,
  '3',
  'Jawaban yang benar adalah: 3',
  NOW()
)
ON CONFLICT (course_id, subtopic_id, question) DO UPDATE SET
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  explanation = EXCLUDED.explanation,
  created_at = EXCLUDED.created_at;

-- Step 5: Add quiz questions for Module 3
INSERT INTO quiz (course_id, subtopic_id, question, options, correct_answer, explanation, created_at)
VALUES 
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 3' LIMIT 1),
  'Apa itu fungsi dalam Python?',
  '["Blok kode yang dapat dipanggil berulang", "Variabel khusus", "Tipe data", "Library"]'::jsonb,
  'Blok kode yang dapat dipanggil berulang',
  'Jawaban yang benar adalah: Blok kode yang dapat dipanggil berulang',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 3' LIMIT 1),
  'Keyword apa yang digunakan untuk mendefinisikan fungsi?',
  '["function", "def", "func", "define"]'::jsonb,
  'def',
  'Jawaban yang benar adalah: def',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 3' LIMIT 1),
  'Bagaimana cara mengimport modul math?',
  '["include math", "import math", "using math", "require math"]'::jsonb,
  'import math',
  'Jawaban yang benar adalah: import math',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 3' LIMIT 1),
  'Apa fungsi dari parameter dalam fungsi?',
  '["Menyimpan hasil", "Menerima input", "Membuat loop", "Menghentikan fungsi"]'::jsonb,
  'Menerima input',
  'Jawaban yang benar adalah: Menerima input',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 3' LIMIT 1),
  'Keyword apa yang digunakan untuk mengembalikan nilai dari fungsi?',
  '["give", "return", "send", "output"]'::jsonb,
  'return',
  'Jawaban yang benar adalah: return',
  NOW()
)
ON CONFLICT (course_id, subtopic_id, question) DO UPDATE SET
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  explanation = EXCLUDED.explanation,
  created_at = EXCLUDED.created_at;

-- Step 6: Add quiz questions for Module 4
INSERT INTO quiz (course_id, subtopic_id, question, options, correct_answer, explanation, created_at)
VALUES 
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 4' LIMIT 1),
  'Apa itu OOP dalam Python?',
  '["Object Oriented Programming", "Open Online Platform", "Operator Overload Protocol", "Output Optimization Process"]'::jsonb,
  'Object Oriented Programming',
  'Jawaban yang benar adalah: Object Oriented Programming',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 4' LIMIT 1),
  'Keyword apa yang digunakan untuk membuat class?',
  '["class", "object", "create", "new"]'::jsonb,
  'class',
  'Jawaban yang benar adalah: class',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 4' LIMIT 1),
  'Apa itu inheritance dalam OOP?',
  '["Membuat variabel", "Pewarisan sifat dari class lain", "Menghapus object", "Membuat fungsi"]'::jsonb,
  'Pewarisan sifat dari class lain',
  'Jawaban yang benar adalah: Pewarisan sifat dari class lain',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 4' LIMIT 1),
  'Method apa yang dipanggil saat object dibuat?',
  '["__start__", "__init__", "__create__", "__new__"]'::jsonb,
  '__init__',
  'Jawaban yang benar adalah: __init__',
  NOW()
),
(
  (SELECT c.id FROM courses c WHERE c.title ILIKE '%python%' LIMIT 1),
  (SELECT s.id FROM courses c JOIN subtopics s ON c.id = s.course_id WHERE c.title ILIKE '%python%' AND s.title = 'Module 4' LIMIT 1),
  'Apa itu encapsulation dalam OOP?',
  '["Membuat class baru", "Menyembunyikan detail implementasi", "Menggabungkan class", "Menghapus method"]'::jsonb,
  'Menyembunyikan detail implementasi',
  'Jawaban yang benar adalah: Menyembunyikan detail implementasi',
  NOW()
)
ON CONFLICT (course_id, subtopic_id, question) DO UPDATE SET
  options = EXCLUDED.options,
  correct_answer = EXCLUDED.correct_answer,
  explanation = EXCLUDED.explanation,
  created_at = EXCLUDED.created_at;

-- Step 7: Verify the quiz questions were inserted
SELECT 
  q.id,
  q.question,
  q.correct_answer,
  s.title as subtopic_title,
  c.title as course_title
FROM quiz q
JOIN subtopics s ON q.subtopic_id = s.id
JOIN courses c ON q.course_id = c.id
WHERE c.title ILIKE '%python%'
ORDER BY s.order_index, q.created_at;

-- Step 8: Count total quiz questions
SELECT 
  s.title as subtopic,
  COUNT(q.id) as quiz_count
FROM subtopics s
LEFT JOIN quiz q ON s.id = q.subtopic_id
JOIN courses c ON s.course_id = c.id
WHERE c.title ILIKE '%python%'
GROUP BY s.id, s.title, s.order_index
ORDER BY s.order_index;