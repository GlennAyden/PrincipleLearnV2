// src/app/api/challenge-feedback/route.ts
import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  throw new Error('Missing OPENAI_API_KEY environment variable on the server');
}

const openai = new OpenAI({ apiKey });

export async function POST(req: Request) {
  try {
    const { question, answer, context, level = 'intermediate' } = await req.json();

    if (!question || !answer) {
      return NextResponse.json({ error: 'Question and answer are required' }, { status: 400 });
    }

    // Helper function to adjust feedback style based on user level
    const getFeedbackStyleByLevel = (userLevel: string) => {
      switch (userLevel.toLowerCase()) {
        case 'beginner':
          return {
            tone: 'encouraging and supportive',
            detail: 'basic, straightforward',
            focus: 'key concepts and correct misconceptions',
            approach: 'praise effort, be very positive about any correct elements'
          };
        case 'intermediate':
          return {
            tone: 'balanced and constructive',
            detail: 'moderate depth',
            focus: 'application of concepts and deeper understanding',
            approach: 'acknowledge strengths while suggesting improvements'
          };
        case 'advanced':
          return {
            tone: 'professional and nuanced',
            detail: 'in-depth and comprehensive',
            focus: 'critical analysis and connections between concepts',
            approach: 'provide sophisticated insights and challenging extensions'
          };
        default:
          return {
            tone: 'balanced and helpful',
            detail: 'moderate detail',
            focus: 'key concepts and understanding',
            approach: 'balance encouragement with constructive feedback'
          };
      }
    };

    const feedbackStyle = getFeedbackStyleByLevel(level);

    const systemMessage = {
      role: 'system',
      content: `You are an expert educational assistant providing feedback on a user's answer to a question.

Create feedback that is:
- In ${feedbackStyle.tone} tone appropriate for a "${level}" level user
- Provides ${feedbackStyle.detail} explanations
- Focuses on ${feedbackStyle.focus}
- ${feedbackStyle.approach}
- Written in Indonesian language with a conversational, friendly tone (tidak terlalu formal)

Structure your feedback clearly with:
1. **Kekuatan Jawaban:** - Highlight 1-2 positive aspects of the user's answer
2. **Poin untuk Peningkatan:** - Provide 1-2 specific suggestions for improvement
3. **Konsep Inti yang Perlu Diketahui:** - Outline the key concepts that should be included

Use formatting to improve readability:
- Use **bold text** for section headers and important points
- Use bullet points (- point 1) for listing items
- Number items when sequence matters (1. First point)
- Keep paragraphs short and focused

Keep your feedback concise and supportive, while maintaining clarity and helpfulness.`
    };
    
    const userMessage = {
      role: 'user',
      content: `Learning context: ${context}

Question: ${question}

User's answer (${level} level): "${answer}"

Please provide appropriate feedback for this answer, considering the user's level and the answer quality.`
    };

    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [systemMessage, userMessage] as any,
      max_tokens: 600,
    });

    const feedbackRaw = response.choices?.[0]?.message?.content?.trim() || '';
    return NextResponse.json({ feedback: feedbackRaw });
  } catch (err: any) {
    console.error('Error generating challenge feedback:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
