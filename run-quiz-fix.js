// Script to fix quiz database schema and add sample data
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function fixQuizDatabase() {
  console.log('🔧 Fixing Quiz Database Schema and Data...\n');
  
  try {
    // Step 1: Check current state
    console.log('1. Checking current database state...');
    const { data: courses } = await supabase
      .from('courses')
      .select('id, title')
      .order('created_at', { ascending: false });
    
    console.log(`Found ${courses.length} courses`);
    
    if (courses.length === 0) {
      console.log('❌ No courses found');
      return;
    }
    
    const pythonCourse = courses.find(c => c.title.toLowerCase().includes('python'));
    if (!pythonCourse) {
      console.log('❌ No Python course found');
      return;
    }
    
    console.log('Using Python course:', pythonCourse.title);
    
    const { data: subtopics } = await supabase
      .from('subtopics')
      .select('id, title, order_index')
      .eq('course_id', pythonCourse.id)
      .order('order_index');
    
    console.log(`Found ${subtopics.length} subtopics`);
    
    // Step 2: Add unique constraint (this might fail if it already exists, that's ok)
    console.log('\n2. Adding unique constraint...');
    try {
      await supabase.rpc('exec_sql', {
        sql: 'ALTER TABLE quiz ADD CONSTRAINT quiz_unique_question UNIQUE (course_id, subtopic_id, question);'
      });
      console.log('✅ Unique constraint added');
    } catch (constraintError) {
      console.log('⚠️  Constraint might already exist:', constraintError.message);
    }
    
    // Step 3: Create quiz data for each module
    console.log('\n3. Creating quiz questions...');
    
    const quizData = {
      'Module 1': [
        {
          question: 'Apa yang dimaksud dengan Python?',
          options: ['Sebuah bahasa pemrograman', 'Sebuah ular', 'Sebuah software', 'Sebuah website'],
          correctIndex: 0
        },
        {
          question: 'Mengapa Python populer di kalangan programmer?',
          options: ['Sulit dipelajari', 'Mudah dipelajari dan sintaks yang jelas', 'Hanya untuk web', 'Tidak gratis'],
          correctIndex: 1
        },
        {
          question: 'Bagaimana cara menginstall Python di Windows?',
          options: ['Download dari python.org', 'Tidak bisa di Windows', 'Harus bayar dulu', 'Perlu kompile sendiri'],
          correctIndex: 0
        },
        {
          question: 'Apa keuntungan utama Python dibanding bahasa lain?',
          options: ['Lebih lambat', 'Sintaks yang kompleks', 'Mudah dibaca dan dipelajari', 'Hanya untuk data science'],
          correctIndex: 2
        },
        {
          question: 'Python pertama kali dikembangkan oleh siapa?',
          options: ['Mark Zuckerberg', 'Guido van Rossum', 'Bill Gates', 'Larry Page'],
          correctIndex: 1
        }
      ],
      'Module 2': [
        {
          question: 'Apa itu variabel dalam Python?',
          options: ['Tempat menyimpan data', 'Sebuah fungsi', 'Sebuah library', 'Sebuah error'],
          correctIndex: 0
        },
        {
          question: 'Tipe data mana yang digunakan untuk menyimpan angka desimal?',
          options: ['int', 'str', 'float', 'bool'],
          correctIndex: 2
        },
        {
          question: 'Bagaimana cara membuat komentar dalam Python?',
          options: ['// komentar', '/* komentar */', '# komentar', '-- komentar'],
          correctIndex: 2
        },
        {
          question: 'Operator mana yang digunakan untuk pembagian di Python?',
          options: ['+', '-', '*', '/'],
          correctIndex: 3
        },
        {
          question: 'Apa hasil dari 10 // 3 di Python?',
          options: ['3.33', '3', '4', 'Error'],
          correctIndex: 1
        }
      ],
      'Module 3': [
        {
          question: 'Apa itu fungsi dalam Python?',
          options: ['Blok kode yang dapat dipanggil berulang', 'Variabel khusus', 'Tipe data', 'Library'],
          correctIndex: 0
        },
        {
          question: 'Keyword apa yang digunakan untuk mendefinisikan fungsi?',
          options: ['function', 'def', 'func', 'define'],
          correctIndex: 1
        },
        {
          question: 'Bagaimana cara mengimport modul math?',
          options: ['include math', 'import math', 'using math', 'require math'],
          correctIndex: 1
        },
        {
          question: 'Apa fungsi dari parameter dalam fungsi?',
          options: ['Menyimpan hasil', 'Menerima input', 'Membuat loop', 'Menghentikan fungsi'],
          correctIndex: 1
        },
        {
          question: 'Keyword apa yang digunakan untuk mengembalikan nilai dari fungsi?',
          options: ['give', 'return', 'send', 'output'],
          correctIndex: 1
        }
      ],
      'Module 4': [
        {
          question: 'Apa itu OOP dalam Python?',
          options: ['Object Oriented Programming', 'Open Online Platform', 'Operator Overload Protocol', 'Output Optimization Process'],
          correctIndex: 0
        },
        {
          question: 'Keyword apa yang digunakan untuk membuat class?',
          options: ['class', 'object', 'create', 'new'],
          correctIndex: 0
        },
        {
          question: 'Apa itu inheritance dalam OOP?',
          options: ['Membuat variabel', 'Pewarisan sifat dari class lain', 'Menghapus object', 'Membuat fungsi'],
          correctIndex: 1
        },
        {
          question: 'Method apa yang dipanggil saat object dibuat?',
          options: ['__start__', '__init__', '__create__', '__new__'],
          correctIndex: 1
        },
        {
          question: 'Apa itu encapsulation dalam OOP?',
          options: ['Membuat class baru', 'Menyembunyikan detail implementasi', 'Menggabungkan class', 'Menghapus method'],
          correctIndex: 1
        }
      ]
    };
    
    let totalInserted = 0;
    
    for (const subtopic of subtopics) {
      const moduleQuizzes = quizData[subtopic.title];
      if (!moduleQuizzes) {
        console.log(`⚠️  No quiz data for ${subtopic.title}`);
        continue;
      }
      
      console.log(`Adding ${moduleQuizzes.length} quiz questions for ${subtopic.title}...`);
      
      const quizInserts = moduleQuizzes.map(quiz => ({
        course_id: pythonCourse.id,
        subtopic_id: subtopic.id,
        question: quiz.question,
        options: quiz.options,
        correct_answer: quiz.options[quiz.correctIndex],
        explanation: `Jawaban yang benar adalah: ${quiz.options[quiz.correctIndex]}`,
        created_at: new Date().toISOString()
      }));
      
      // Use regular insert since we don't have the constraint yet
      const { data: insertedQuizzes, error: insertError } = await supabase
        .from('quiz')
        .insert(quizInserts)
        .select('id');
      
      if (insertError) {
        // Try upsert instead
        const { data: upsertedQuizzes, error: upsertError } = await supabase
          .from('quiz')
          .upsert(quizInserts, { ignoreDuplicates: true })
          .select('id');
        
        if (upsertError) {
          console.error(`❌ Failed to insert quizzes for ${subtopic.title}:`, upsertError);
        } else {
          const inserted = upsertedQuizzes?.length || 0;
          console.log(`✅ Upserted ${inserted} quiz questions for ${subtopic.title}`);
          totalInserted += inserted;
        }
      } else {
        const inserted = insertedQuizzes?.length || 0;
        console.log(`✅ Inserted ${inserted} quiz questions for ${subtopic.title}`);
        totalInserted += inserted;
      }
    }
    
    // Step 4: Verify the results
    console.log(`\n4. Verification: Total ${totalInserted} quiz questions processed`);
    
    const { data: verifyQuizzes, error: verifyError } = await supabase
      .from('quiz')
      .select('id, question, subtopic_id, subtopics(title)')
      .eq('course_id', pythonCourse.id);
    
    if (verifyError) {
      console.error('❌ Verification failed:', verifyError);
    } else {
      console.log(`✅ Verified: ${verifyQuizzes.length} quiz questions exist in database`);
      
      // Group by subtopic
      const bySubtopic = verifyQuizzes.reduce((acc, quiz) => {
        const subtopicTitle = quiz.subtopics?.title || 'Unknown';
        if (!acc[subtopicTitle]) acc[subtopicTitle] = 0;
        acc[subtopicTitle]++;
        return acc;
      }, {});
      
      Object.entries(bySubtopic).forEach(([subtopic, count]) => {
        console.log(`  - ${subtopic}: ${count} questions`);
      });
    }
    
    console.log('\n✅ Quiz database fix completed!');
    console.log('Now test the quiz functionality in your application.');
    
  } catch (error) {
    console.error('💥 Quiz fix failed:', error);
  }
}

fixQuizDatabase();