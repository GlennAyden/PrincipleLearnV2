// src/app/api/ask-question/route.ts
import { NextResponse, NextRequest } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';
import { adminDb, DatabaseError } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

// OpenAI client and model are centralized in src/lib/openai

export async function POST(request: NextRequest) {
  try {
    // Parse request body for question and context
    const {
      question,
      context,
      userId,
      courseId,
      subtopic,
      moduleIndex,
      subtopicIndex,
      pageNumber,
    } = await request.json();

    const normalizeIndex = (value: unknown) => {
      if (typeof value === 'number' && Number.isFinite(value)) return value;
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (!Number.isNaN(parsed)) return parsed;
      }
      return 0;
    };

    if (!question || !question.trim() || !context) {
      return NextResponse.json(
        { error: 'Missing required fields: question and context are required.' },
        { status: 400 }
      );
    }

    if (!userId || !courseId) {
      return NextResponse.json(
        { error: 'User identifier and courseId are required.' },
        { status: 400 }
      );
    }

    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
    }

    const systemMessage = {
      role: 'system',
      content: `You are an expert educational assistant that provides helpful, accurate answers to questions about course content.
Your goal is to explain concepts clearly, provide examples when useful, and help users understand the material.

Language policy:
- Answer in the same language as the user's question.
- If mixed, choose the dominant language; avoid unnecessary translation.

Guidelines for your answers:
- Provide clear and straightforward explanations
- Use everyday language and avoid technical jargon unless necessary
- Format your answers to be easy to read with appropriate spacing and structure
- When appropriate, include examples that illustrate concepts
- Base your answers on the course content, not external knowledge
- Be concise but thorough
- Format your response with markdown when helpful (bullet points, numbering, etc.)

Remember: the user is learning this content, so explain things in a way that builds understanding.`
    };

    const userMessage = {
      role: 'user',
      content: `Course content:
${context}

User's question: "${question}"

Please answer in the same language as the question above. Base your answer strictly on the provided course content.`
    };

    // Prepare messages array (cast to any to satisfy TS overloads)
    const messages = [
      systemMessage,
      userMessage,
    ] as any;

    // Call OpenAI Chat Completion
    const res = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      messages,
      max_tokens: 2000,
    });

    const answer = res.choices?.[0]?.message?.content || '';
    const normalizedQuestion = question.trim();
    
    // Save QnA transcript to database
    if (courseId) {
      try {
        const timestamp = new Date().toISOString();
        const transcriptData = {
          user_id: userId,
          course_id: courseId,
          module_index: normalizeIndex(moduleIndex),
          subtopic_index: normalizeIndex(subtopicIndex),
          page_number: normalizeIndex(pageNumber),
          subtopic_label: subtopic || null,
          question: normalizedQuestion,
          answer,
          created_at: timestamp,
          updated_at: timestamp
        };

        const { error: insertError } = await adminDb
          .from('ask_question_history')
          .insert(transcriptData);

        if (insertError) {
          throw new DatabaseError('Failed to insert transcript record', insertError);
        }

        console.log('QnA transcript saved to database:', {
          user: userId,
          course: courseId,
          subtopic,
          moduleIndex: transcriptData.module_index,
          subtopicIndex: transcriptData.subtopic_index,
          pageNumber: transcriptData.page_number
        });
      } catch (error) {
        const message =
          error instanceof DatabaseError ? error.message : 'Unexpected database error';
        console.error('Error saving QnA transcript to database:', message, error);
        // Continue execution even if database save fails
      }
    }
    
    return NextResponse.json({ answer });
  } catch (error: any) {
    console.error('Error generating answer:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
