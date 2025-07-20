// src/app/api/generate-course/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { OpenAI } from 'openai';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

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

// 1. Ambil API key dari env
let apiKey = process.env.OPENAI_API_KEY;
// 2. Fallback ke admin key kalau perlu (FIXED: proper validation)
if (!apiKey || apiKey === 'your-openai-api-key-here' || apiKey === 'sk-your-openai-api-key') {
  console.warn(
    'Env key invalid or missing, falling back to hardcoded admin key for testing'
  );
  apiKey = 'sk-proj-your-openai-api-key-here';
}

const openai = new OpenAI({ apiKey });

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
   - Overview singkat (1-2 kalimat) yang menjelaskan konsep utama
4. Pastikan konten sesuai dengan level ${level} dan tujuan pembelajaran

## FORMAT OUTPUT (SIMPLE)
Output harus berupa MURNI JSON array tanpa blok kode Markdown:
[
  {
    "module": "1. Judul Modul Lengkap", 
    "subtopics": [
      "1.1 Judul Subtopik Deskriptif",
      "1.2 Judul Subtopik Deskriptif",
      "1.3 Judul Subtopik Deskriptif"
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
            model: 'gpt-3.5-turbo',
            messages: [systemMessage, userMessage] as any,
            temperature: 0.7, 
            max_tokens: 1500, // Reduced for faster response
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
    const textRaw = response.choices[0].message?.content ?? '[]';
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
    
    // 8. Mock logging of course generation activity
    if (userId) {
      console.log(`[Generate Course] Mock activity logging for user: ${userId}`);
      
      // Mock user validation
      const validEmails = ['user@example.com', 'admin@example.com', 'test@example.com'];
      
      if (!validEmails.includes(userId)) {
        console.warn(`[Generate Course] User with email ${userId} not found in mock data`);
      } else {
        // Mock activity logging
        const mockLogEntry = {
          id: `log-${Date.now()}`,
          userId: userId,
          courseName: topic,
          parameter: JSON.stringify({
            topic, goal, level, extraTopics, problem, assumption
          }),
          createdAt: new Date().toISOString()
        };
        
        console.log('[Generate Course] Mock activity logged:', mockLogEntry);
      }
    } else {
      console.warn('[Generate Course] No userId provided, activity not logged');
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
