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
You create content that is appropriate for the user's skill level, connects to real-world problems, and addresses common misconceptions.

Language policy:
- Write all outputs in the same language as the user's inputs.
- Detect the dominant language from the combined user inputs (topic, goal, extraTopics, problem, assumption).
- If inputs are mixed, choose the dominant language; if ambiguous, mirror the language of the "topic" field.
- Do not translate the user's inputs; preserve technical terms in the chosen language.`
    };
    
    const userMessage = {
      role: 'user',
      content: `
Create a comprehensive learning outline for the topic "${topic}" with the learning goal "${goal}".

USER KNOWLEDGE LEVEL
Level: ${level}

ADDITIONAL INFORMATION
Specific topics to include: ${extraTopics || "No specific preferences."}
Real-world problem to solve: ${problem}
User's initial assumption: ${assumption}

CONTENT CREATION GUIDE (OPTIMIZED FOR SPEED)
1. Create 4-5 main modules that progressively build knowledge.
2. For each module, create 4-6 related subtopics.
3. Each subtopic must include:
   - A clear, descriptive title
   - A brief overview (1-2 sentences) explaining the key concept to be learned
4. Ensure the content matches the ${level} level and the learning goal

OUTPUT FORMAT (WITH SUMMARIES)
Return a PURE JSON array (no Markdown code fences):
[
  {
    "module": "1. Full Module Title",
    "subtopics": [
      {
        "title": "1.1 Descriptive Subtopic Title",
        "overview": "A concise 1-2 sentence explanation of what is covered in this subtopic."
      },
      {
        "title": "1.2 Descriptive Subtopic Title",
        "overview": "A concise 1-2 sentence explanation of the concept."
      }
    ]
  }
]

Important: Write all titles and overviews in the same language as the user's inputs above.`
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
