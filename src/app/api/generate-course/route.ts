// src/app/api/generate-course/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { DatabaseService } from '@/lib/database';
import type { ChatCompletionMessageParam } from 'openai/resources/chat/completions';
import { withApiLogging } from '@/lib/api-logger';

interface GenerateCourseRequestBody {
  topic: string;
  goal: string;
  level: string;
  extraTopics?: string;
  problem?: string;
  assumption?: string;
  userId?: string;
  userEmail?: string;
}

interface UserRecord {
  id: string;
  email: string;
}

// Add CORS headers for API — restrict to same origin in production
const corsHeaders = {
  'Access-Control-Allow-Origin': process.env.NEXT_PUBLIC_APP_URL || process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

// Handle OPTIONS request for CORS
export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders });
}

async function resolveUserByIdentifier(identifier?: string | null): Promise<UserRecord | null> {
  const trimmed = identifier?.trim();
  if (!trimmed) return null;

  const byId = await DatabaseService.getRecords<UserRecord>('users', {
    filter: { id: trimmed },
    limit: 1,
  });
  if (byId.length > 0) return byId[0];

  const byEmail = await DatabaseService.getRecords<UserRecord>('users', {
    filter: { email: trimmed },
    limit: 1,
  });
  if (byEmail.length > 0) return byEmail[0];

  return null;
}

// OpenAI client and model are centralized in src/lib/openai

async function postHandler(req: NextRequest) {
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
    const {
      topic,
      goal,
      level,
      extraTopics,
      problem,
      assumption,
      userId,
      userEmail,
    } = requestBody as GenerateCourseRequestBody;

    const headerUserId = req.headers.get('x-user-id');
    const headerUserEmail = req.headers.get('x-user-email');
    const actorIdentifier = userId || userEmail || headerUserId || headerUserEmail || null;

    // Validate required fields
    if (!topic || !goal || !level) {
      console.error('[Generate Course] Missing required fields:', { topic, goal, level });
      return NextResponse.json(
        { error: 'Missing required fields: topic, goal, or level' },
        { status: 400 }
      );
    }

    console.log(`[Generate Course] Received request for topic: "${topic}" from user: ${actorIdentifier || 'anonymous'}`);
    const requestPayload = {
      step1: { topic, goal },
      step2: { level, extraTopics },
      step3: { problem, assumption },
    };

    // 4. Prompt yang lebih komprehensif
    const systemMessage: ChatCompletionMessageParam = {
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

    const userMessage: ChatCompletionMessageParam = {
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
            max_completion_tokens: 8192, // GPT-5-mini needs higher limit due to thinking tokens
          }),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('OpenAI API timeout after 90 seconds')), 90000)
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
    console.log('[Generate Course] Response structure:', JSON.stringify({
      choices: response.choices?.map((c: any) => ({
        finish_reason: c.finish_reason,
        message: {
          role: c.message?.role,
          content: c.message?.content ? `[${c.message.content.length} chars]` : null,
          refusal: c.message?.refusal,
        }
      })),
      model: response.model,
      usage: response.usage
    }, null, 2));

    // 6. Ambil dan bersihkan output
    const textRaw = response.choices?.[0]?.message?.content;
    if (!textRaw || !textRaw.trim()) {
      console.error('[Generate Course] Empty content! Full message:', JSON.stringify(response.choices?.[0]?.message));
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

    // 7.1 Tambahkan node diskusi penutup untuk setiap subtopik
    outline = appendDiscussionNodes(outline);

    // 8. Save course to database
    let createdCourse: any = null;

    if (actorIdentifier) {
      try {
        const userRecord =
          (await resolveUserByIdentifier(userId)) ||
          (await resolveUserByIdentifier(userEmail)) ||
          (await resolveUserByIdentifier(headerUserId)) ||
          (await resolveUserByIdentifier(headerUserEmail));

        if (!userRecord) {
          throw new Error('Authenticated user could not be resolved from identifier');
        }

        // Create course record
        const courseData = {
          title: topic,
          description: goal,
          subject: topic,
          difficulty_level: level,
          estimated_duration: Math.max(outline.length * 15, 30), // min 30 minutes
          created_by: userRecord.id
        };

        const course = await DatabaseService.insertRecord('courses', courseData) as unknown as { id: string };
        createdCourse = course;
        console.log(`[Generate Course] Course created with ID: ${course.id}`);

        // Create subtopics for each module
        for (let i = 0; i < outline.length; i++) {
          const outlineModule = outline[i];
          const subtopicData = {
            course_id: course.id,
            title: outlineModule.module || `Module ${i + 1}`,
            content: JSON.stringify(outlineModule),
            order_index: i
          };

          await DatabaseService.insertRecord('subtopics', subtopicData);
        }

        console.log(`[Generate Course] Created ${outline.length} subtopics for course`);

        if (!createdCourse?.id) {
          throw new Error('Course creation failed before activity logging');
        }

        try {
          await DatabaseService.insertRecord('course_generation_activity', {
            user_id: userRecord.id,
            course_id: createdCourse.id,
            request_payload: requestPayload,
            outline,
          });
          console.log('[Generate Course] Logged course generation payload for admin activity');
        } catch (logError) {
          console.error('[Generate Course] Failed to store course generation activity log:', logError);
          throw logError;
        }
      } catch (error) {
        console.error('[Generate Course] Error saving to database:', error);
        console.error('[Generate Course] Error details:', error instanceof Error ? error.message : error);
        console.error('[Generate Course] Error stack:', error instanceof Error ? error.stack : 'No stack');
        throw error;
      }
    } else {
      console.warn('[Generate Course] No userId provided, course not saved');
    }

    // 9. Kirim balik outline + courseId
    console.log('[Generate Course] Returning outline to client');
    return NextResponse.json({ outline, courseId: createdCourse?.id || null }, { headers: corsHeaders });
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

export const POST = withApiLogging(postHandler, {
  label: 'generate-course',
});

function appendDiscussionNodes(modules: any[]): any[] {
  if (!Array.isArray(modules)) return [];

  return modules.map((module, moduleIdx) => {
    const currentModule = module ?? {};
    const originalSubtopics = Array.isArray(currentModule.subtopics)
      ? currentModule.subtopics.filter((item: any) => !!item)
      : [];

    const hasDiscussion = originalSubtopics.some(
      (item: any) =>
        item &&
        typeof item === 'object' &&
        (item.type === 'discussion' ||
          item.isDiscussion === true ||
          (typeof item.title === 'string' && item.title.toLowerCase().includes('diskusi penutup')))
    );

    if (hasDiscussion) {
      return {
        ...currentModule,
        subtopics: originalSubtopics,
      };
    }

    const baseTitle: string =
      typeof currentModule.module === 'string' && currentModule.module.trim()
        ? currentModule.module.trim()
        : `Module ${moduleIdx + 1}`;

    const discussionSubtopic = {
      title: 'Diskusi Penutup',
      overview:
        'Gunakan sesi diskusi ini untuk mengevaluasi pemahaman, menghubungkan materi dengan pengalaman nyata, dan memastikan seluruh tujuan pembelajaran tercapai.',
      type: 'discussion',
      isDiscussion: true,
      moduleTitle: baseTitle,
    };

    return {
      ...currentModule,
      subtopics: [...originalSubtopics, discussionSubtopic],
    };
  });
}
