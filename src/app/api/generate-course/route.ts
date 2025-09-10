// src/app/api/generate-course/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { DatabaseService } from '@/lib/database';

// Add CORS headers for API
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

// OpenAI client and model are centralized in src/lib/openai

export async function POST(req: NextRequest) {
  console.log('[Generate Course] Starting course generation process');
  
  try {
    // Check if request body is valid
    let requestBody;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      console.error('[Generate Course] Invalid JSON in request body:', parseError);
      return NextResponse.json(
        { error: 'Invalid JSON in request body' },
        { status: 400 }
      );
    }

    // 3. Terima payload
    const { topic, goal, level, extraTopics, problem, assumption, userId } = requestBody;
    
    // Validate required fields
    if (!topic || !goal || !level) {
      console.error('[Generate Course] Missing required fields:', { topic, goal, level });
      return NextResponse.json(
        { error: 'Missing required fields: topic, goal, or level' },
        { status: 400 }
      );
    }
      
    console.log(`[Generate Course] Received request for topic: "${topic}" from user: ${userId || 'anonymous'}`);

    // 4. Prompt yang lebih komprehensif
    const systemMessage = {
      role: 'system',
      content: `You are an expert educational content developer specialized in creating detailed, comprehensive, and structured learning plans. 
Your expertise lies in breaking down complex topics into logical modules with clear, informative subtopics that build upon each other.
You create content that is appropriate for the user's skill level, connects to real-world problems, and addresses common misconceptions.`
    };
    
    const userMessage = {
      role: 'user',
      content: `
Buatkan outline pembelajaran komprehensif untuk topik "${topic}" dengan tujuan "${goal}".

## TINGKAT PENGETAHUAN PENGGUNA
Level: ${level}

## INFORMASI TAMBAHAN
Topik spesifik yang ingin dipelajari: ${extraTopics || "Tidak ada preferensi khusus."}
Masalah nyata yang ingin dipecahkan: ${problem}
Asumsi awal pengguna: ${assumption}

## PANDUAN PEMBUATAN KONTEN (OPTIMIZED FOR SPEED)
1. Buat 4-5 modul utama yang membangun pengetahuan secara bertahap
2. Untuk setiap modul, buat 4-6 subtopik yang saling berkaitan
3. Setiap subtopik harus memiliki:
   - Judul yang jelas dan deskriptif
   - Overview singkat (1-2 kalimat) yang menjelaskan konsep utama yang akan dipelajari
4. Pastikan konten sesuai dengan level ${level} dan tujuan pembelajaran

## FORMAT OUTPUT (WITH SUMMARIES)
Output harus berupa MURNI JSON array tanpa blok kode Markdown:
[
  {
    "module": "1. Judul Modul Lengkap", 
    "subtopics": [
      {
        "title": "1.1 Judul Subtopik Deskriptif",
        "overview": "Penjelasan singkat 1-2 kalimat tentang apa yang akan dipelajari dalam subtopik ini."
      },
      {
        "title": "1.2 Judul Subtopik Deskriptif", 
        "overview": "Penjelasan singkat 1-2 kalimat tentang konsep yang akan dibahas."
      }
    ]
  }
]
      `
    };

    console.log('[Generate Course] Calling OpenAI API');
    
    // 5. Panggil OpenAI dengan retry logic + timeout
    let response;
    let attempt = 0;
    const maxAttempts = 3;
    
    while (attempt < maxAttempts) {
      try {
        attempt++;
        console.log(`[Generate Course] Attempt ${attempt}/${maxAttempts}`);
        
        response = await Promise.race([
          openai.chat.completions.create({
            model: defaultOpenAIModel,
            messages: [systemMessage, userMessage],
            max_completion_tokens: 1500, // Reduced for faster response
          }),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('OpenAI API timeout after 60 seconds')), 60000)
          )
        ]) as any;
        
        break; // Success, exit retry loop
        
      } catch (error: any) {
        console.error(`[Generate Course] Attempt ${attempt} failed:`, error.message);
        
        if (attempt === maxAttempts) {
          // Last attempt failed, throw error
          throw new Error(`OpenAI API failed after ${maxAttempts} attempts: ${error.message}`);
        }
        
        // Wait 2 seconds before retry with exponential backoff
        await new Promise(resolve => setTimeout(resolve, 2000 * attempt));
      }
    }

    console.log('[Generate Course] Received response from OpenAI');
    
    // 6. Ambil dan bersihkan output
    const textRaw = response.choices?.[0]?.message?.content;
    if (!textRaw || !textRaw.trim()) {
      throw new Error('Empty response from model');
    }
    const cleaned = textRaw
      .replace(/```json\s*/g, '')
      .replace(/```/g, '')
      .trim();

    // 7. Parse JSON
    let outline;
    try {
      outline = JSON.parse(cleaned);
      console.log(`[Generate Course] Successfully parsed JSON with ${outline.length} modules`);
    } catch (parseErr: any) {
      console.error('[Generate Course] Failed to parse JSON:', { cleaned, parseErr });
      throw new Error('Invalid JSON response from AI');
    }
    
    // 8. Save course to database
    console.log(`[Generate Course] DEBUG: userId = ${userId}`);
    console.log(`[Generate Course] DEBUG: outline length = ${outline?.length}`);
    
    if (userId) {
      console.log(`[Generate Course] Saving course to database for user: ${userId}`);
      
      try {
        // Validate user exists
        console.log(`[Generate Course] DEBUG: Looking up user with email: ${userId}`);
        const users = await DatabaseService.getRecords('users', {
          filter: { email: userId },
          limit: 1
        });
        
        console.log(`[Generate Course] DEBUG: Found ${users.length} users`);
        console.log(`[Generate Course] DEBUG: Users data:`, users);
        
        if (users.length === 0) {
          console.warn(`[Generate Course] User with email ${userId} not found in database`);
        } else {
          const user = users[0];
          console.log(`[Generate Course] DEBUG: User found:`, { id: user.id, email: user.email });
          
          // Create course record
          const courseData = {
            title: topic,
            description: goal,
            subject: topic,
            difficulty_level: level,
            estimated_duration: outline.length * 15, // 15 minutes per module estimate
            created_by: user.id
          };
          
          console.log(`[Generate Course] DEBUG: Course data to insert:`, courseData);
          
          const course = await DatabaseService.insertRecord('courses', courseData);
          console.log(`[Generate Course] Course created with ID: ${course.id}`);
          console.log(`[Generate Course] DEBUG: Course created successfully:`, course);
          
          // Create subtopics for each module
          console.log(`[Generate Course] DEBUG: Creating ${outline.length} subtopics`);
          for (let i = 0; i < outline.length; i++) {
            const module = outline[i];
            const subtopicData = {
              course_id: course.id,
              title: module.module || `Module ${i + 1}`,
              content: JSON.stringify(module),
              order_index: i
            };
            
            console.log(`[Generate Course] DEBUG: Creating subtopic ${i + 1}:`, subtopicData);
            const subtopic = await DatabaseService.insertRecord('subtopics', subtopicData);
            console.log(`[Generate Course] DEBUG: Subtopic created:`, subtopic);
          }
          
          console.log(`[Generate Course] Created ${outline.length} subtopics for course`);
        }
      } catch (error) {
        console.error('[Generate Course] Error saving to database:', error);
        console.error('[Generate Course] Error details:', error instanceof Error ? error.message : error);
        console.error('[Generate Course] Error stack:', error instanceof Error ? error.stack : 'No stack');
        // Continue execution even if database save fails
      }
    } else {
      console.warn('[Generate Course] No userId provided, course not saved');
    }

    // 9. Kirim balik outline
    console.log('[Generate Course] Returning outline to client');
    return NextResponse.json({ outline }, { headers: corsHeaders });
  } catch (err: any) {
    console.error('[Generate Course] Error generating course outline:', err);
    console.error('[Generate Course] Error details:', err.message);
    console.error('[Generate Course] Error stack:', err.stack);
    return NextResponse.json(
      { error: err.message || 'Failed to generate outline' },
      { status: 500, headers: corsHeaders }
    );
  }
}
