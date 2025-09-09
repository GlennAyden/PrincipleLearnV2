// src/app/api/generate-subtopic/route.ts

import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable on the server');
}

const openai = new OpenAI({ apiKey });

export async function POST(request: Request) {
  try {
    const payload = await request.json().catch(() => null);
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      );
    }
    const { module: moduleTitle, subtopic, courseId } = payload;
    if (!moduleTitle || !subtopic) {
      return NextResponse.json(
        { error: 'module and subtopic are required' },
        { status: 400 }
      );
    }

    // Database caching for performance optimization
    if (courseId) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Check cache first
        const cacheKey = `${courseId}-${moduleTitle}-${subtopic}`;
        const { data: cached } = await supabase
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .single();

        if (cached?.content) {
          console.log('🚀 Returning cached subtopic data');
          return NextResponse.json(cached.content);
        }
      } catch (cacheError) {
        // Continue with generation if cache fails
        console.warn('Cache read failed:', cacheError);
      }
    }

    // Sistem prompt: instruksi pembuatan konten dalam Bahasa Indonesia
    const systemMessage = {
      role: 'system',
      content: [
        'You are an expert educational content creator that generates structured, comprehensive learning content in JSON format.',
        'All responses must be in Bahasa Indonesia.',
        'You excel at explaining concepts thoroughly and providing detailed, informative content.',
        'Output must exactly follow this JSON schema without additional fields or markdown:',
        '{',
        '  "objectives": [string],',
        '  "pages": [{ "title": string, "paragraphs": [string] }],',
        '  "keyTakeaways": [string],',
        '  "quiz": [{ "question": string, "options": [string], "correctIndex": number }],',
        '  "whatNext": { "summary": string, "encouragement": string }',
        '}'
      ].join('\n')
    };

    // User prompt: permintaan konten untuk subtopik tertentu
    const userMessage = {
      role: 'user',
      content: [
        `Buat konten untuk subtopik "${subtopic}" dalam modul "${moduleTitle}":`,
        '- Daftar tujuan pembelajaran (`objectives`).',
        '- Array `pages` dengan:',
        '  * `title` untuk setiap halaman yang jelas dan deskriptif',
        '  * Array `paragraphs` dengan TEPAT 3-5 paragraf yang komprehensif untuk setiap halaman.',
        '  * Setiap paragraf harus berisi 2-4 kalimat yang menjelaskan konsep dengan detail.',
        '  * Paragraf harus saling terkait dan membangun pemahaman yang kohesif.',
        '- Daftar `keyTakeaways`.',
        '- `quiz` dengan 5 pertanyaan (masing-masing 4 opsi & `correctIndex`).',
        '- Objek `whatNext` berisi `summary` dan `encouragement`.',
        'Kembalikan hanya objek JSON tanpa teks lain.'
      ].join(' ')
    };

    const resp = await openai.chat.completions.create({
      model: 'gpt-5-mini-2025-08-07',
      messages: [systemMessage, userMessage],
      max_completion_tokens: 4000,
    });

    const raw = resp.choices?.[0]?.message?.content ?? '';
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const sanitized = cleaned.replace(/,(?=\s*?[}\]])/g, '').trim();

    let data;
    try {
      data = JSON.parse(sanitized);
      
      // Validate that each page has 3-5 paragraphs
      let hasIssues = false;
      if (data.pages && Array.isArray(data.pages)) {
        for (let i = 0; i < data.pages.length; i++) {
          const page = data.pages[i];
          
          // Check if paragraphs array exists and has valid length
          if (!page.paragraphs || !Array.isArray(page.paragraphs)) {
            console.warn(`Page ${i + 1} has invalid paragraphs structure`);
            hasIssues = true;
            // Create empty paragraphs array if missing
            page.paragraphs = [];
          }
          
          // Handle too few paragraphs (less than 3)
          if (page.paragraphs.length < 3) {
            console.warn(`Page ${i + 1} has only ${page.paragraphs.length} paragraphs, minimum is 3`);
            hasIssues = true;
            
            // If we have at least one paragraph, duplicate the last one to reach minimum
            if (page.paragraphs.length > 0) {
              const lastParagraph = page.paragraphs[page.paragraphs.length - 1];
              while (page.paragraphs.length < 3) {
                page.paragraphs.push(lastParagraph);
              }
            } else {
              // If no paragraphs, add placeholder content
              page.paragraphs = [
                "Materi ini menjelaskan konsep dasar yang penting untuk dipahami.",
                "Pemahaman terhadap bagian ini akan membantu Anda mengikuti materi selanjutnya dengan lebih baik.",
                "Mari kita eksplorasi lebih dalam tentang topik ini untuk memperluas pengetahuan Anda."
              ];
            }
          }
          
          // Handle too many paragraphs (more than 5)
          if (page.paragraphs.length > 5) {
            console.warn(`Page ${i + 1} has ${page.paragraphs.length} paragraphs, maximum is 5`);
            hasIssues = true;
            // Keep only the first 5 paragraphs
            page.paragraphs = page.paragraphs.slice(0, 5);
          }
        }
      }

      // Validate quiz data
      if (!data.quiz || !Array.isArray(data.quiz)) {
        console.warn('Quiz data is missing or invalid, adding fallback quiz');
        hasIssues = true;
        data.quiz = [
          {
            question: "Apa yang telah Anda pelajari dari materi ini?",
            options: [
              "Konsep dasar yang dijelaskan dalam materi",
              "Penerapan praktis dari teori yang dipelajari", 
              "Hubungan antara konsep dengan implementasi",
              "Semua jawaban di atas benar"
            ],
            correctIndex: 3
          },
          {
            question: "Manakah dari pernyataan berikut yang paling tepat?",
            options: [
              "Materi ini mudah dipahami",
              "Materi ini memerlukan pemahaman mendalam",
              "Materi ini dapat diterapkan langsung",
              "Semua pernyataan di atas benar"
            ],
            correctIndex: 3
          },
          {
            question: "Bagaimana cara terbaik untuk menguasai materi ini?",
            options: [
              "Membaca berulang-ulang",
              "Praktik dan latihan",
              "Diskusi dengan orang lain",
              "Kombinasi membaca, praktik, dan diskusi"
            ],
            correctIndex: 3
          },
          {
            question: "Apa langkah selanjutnya setelah memahami materi ini?",
            options: [
              "Melanjutkan ke materi berikutnya",
              "Mengulang materi dari awal",
              "Mencoba menerapkan dalam praktek",
              "Melanjutkan sambil tetap berlatih"
            ],
            correctIndex: 3
          },
          {
            question: "Seberapa penting pemahaman materi ini untuk pembelajaran selanjutnya?",
            options: [
              "Tidak terlalu penting",
              "Cukup penting sebagai dasar",
              "Sangat penting untuk materi lanjutan",
              "Esensial untuk seluruh pembelajaran"
            ],
            correctIndex: 2
          }
        ];
      } else if (data.quiz.length !== 5) {
        console.warn(`Expected 5 quiz questions, got ${data.quiz.length}, fixing...`);
        hasIssues = true;
        
        // If we have some questions, pad with fallback
        while (data.quiz.length < 5) {
          data.quiz.push({
            question: `Pertanyaan tambahan ${data.quiz.length + 1}: Apa yang dapat Anda simpulkan dari materi ini?`,
            options: [
              "Materi memberikan pemahaman baru",
              "Materi memperkuat konsep sebelumnya",
              "Materi membuka wawasan lebih luas",
              "Semua jawaban di atas benar"
            ],
            correctIndex: 3
          });
        }
        
        // If too many questions, trim to 5
        if (data.quiz.length > 5) {
          data.quiz = data.quiz.slice(0, 5);
        }
      } else {
        // Validate each quiz question
        for (let i = 0; i < data.quiz.length; i++) {
          const quiz = data.quiz[i];
          if (!quiz.question || !Array.isArray(quiz.options) || quiz.options.length !== 4 || 
              typeof quiz.correctIndex !== 'number' || quiz.correctIndex < 0 || quiz.correctIndex > 3) {
            console.warn(`Quiz question ${i + 1} has invalid structure, fixing...`);
            hasIssues = true;
            data.quiz[i] = {
              question: `Pertanyaan ${i + 1}: Apa yang dapat Anda pelajari dari bagian ini?`,
              options: [
                "Konsep teoritis",
                "Penerapan praktis", 
                "Pemahaman mendalam",
                "Semua aspek di atas"
              ],
              correctIndex: 3
            };
          }
        }
      }
      
      if (hasIssues) {
        console.warn('Generated content had issues that were automatically fixed');
      }
      
    } catch (parseErr) {
      console.error('Failed to parse JSON from AI:', { cleaned, sanitized, parseErr });
      return NextResponse.json(
        { error: 'Invalid JSON from AI' },
        { status: 500 }
      );
    }

    // Save to cache for next time
    if (courseId && data) {
      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        const cacheKey = `${courseId}-${moduleTitle}-${subtopic}`;
        await supabase
          .from('subtopic_cache')
          .upsert({
            cache_key: cacheKey,
            content: data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        
        console.log('💾 Subtopic data cached successfully');

        // Also save quiz questions to database for proper data structure
        if (data.quiz && Array.isArray(data.quiz) && data.quiz.length > 0) {
          try {
            // Find subtopic record by matching the module content, not the individual subtopic name
            const { data: allSubtopics } = await supabase
              .from('subtopics')
              .select('id, title, content')
              .eq('course_id', courseId);

            let subtopicData = null;
            
            // Find the subtopic that contains this module in its content
            if (allSubtopics) {
              for (const sub of allSubtopics) {
                try {
                  const parsedContent = JSON.parse(sub.content);
                  if (parsedContent.module === moduleTitle) {
                    subtopicData = sub;
                    break;
                  }
                } catch (parseError) {
                  // If content is not valid JSON, try direct title match
                  if (sub.title === moduleTitle) {
                    subtopicData = sub;
                    break;
                  }
                }
              }
            }
            
            // Fallback: try direct lookup by subtopic parameter
            if (!subtopicData) {
              const { data: fallbackData } = await supabase
                .from('subtopics')
                .select('id, title')
                .eq('course_id', courseId)
                .eq('title', subtopic)
                .single();
              subtopicData = fallbackData;
            }

            const subtopicId = subtopicData?.id;
            
            if (subtopicId) {
              // Save each quiz question to database
              const quizInserts = data.quiz.map((q: any, index: number) => ({
                course_id: courseId,
                subtopic_id: subtopicId,
                question: q.question,
                options: q.options, // JSONB array
                correct_answer: q.options[q.correctIndex], // Store the actual correct answer text
                explanation: `Jawaban yang benar adalah: ${q.options[q.correctIndex]}`,
                created_at: new Date().toISOString()
              }));

              const { error: quizError } = await supabase
                .from('quiz')
                .upsert(quizInserts, { 
                  onConflict: 'course_id,subtopic_id,question',
                  ignoreDuplicates: false 
                });

              if (quizError) {
                console.warn('Quiz save error:', quizError);
              } else {
                console.log(`📝 Saved ${data.quiz.length} quiz questions to database for subtopic: ${subtopicData.title} (${subtopicId})`);
              }
            } else {
              console.warn('Subtopic not found for quiz saving:', { 
                courseId, 
                moduleTitle, 
                subtopic, 
                availableSubtopics: allSubtopics?.map(s => ({ id: s.id, title: s.title })) 
              });
            }
          } catch (quizSaveError) {
            console.warn('Quiz database save failed:', quizSaveError);
          }
        }
      } catch (saveError) {
        // Don't fail the request if caching fails
        console.warn('Cache save failed:', saveError);
      }
    }

    return NextResponse.json(data);
  } catch (err: any) {
    console.error('Error generating subtopic:', err);
    return NextResponse.json(
      { error: err.message },
      { status: 500 }
    );
  }
}
