// src/app/api/challenge-thinking/route.ts
import { NextResponse } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';

// OpenAI client and model are centralized in src/lib/openai

export async function POST(req: Request) {
  try {
    const { context, level = 'intermediate' } = await req.json();

    // Helper to get difficulty settings based on user level
    const getDifficultyByLevel = (userLevel: string) => {
      switch (userLevel.toLowerCase()) {
        case 'beginner':
          return {
            complexity: 'simple',
            description: 'very straightforward, basic recall or understanding questions',
            example: 'What is the main purpose of...'
          };
        case 'intermediate':
          return {
            complexity: 'moderate',
            description: 'questions that require application of concepts',
            example: 'How would you apply... in a specific context?'
          };
        case 'advanced':
          return {
            complexity: 'challenging',
            description: 'complex questions that require analysis and synthesis',
            example: 'Analyze the relationship between... and explain how...'
          };
        default:
          return {
            complexity: 'moderate',
            description: 'balanced difficulty questions',
            example: 'Explain how... affects...'
          };
      }
    };

    const difficulty = getDifficultyByLevel(level);

    const systemMessage = {
      role: 'system',
      content: `You are an expert educational assistant that generates clear, engaging questions based on learning content.
Your goal is to create questions that help learners think more deeply about the material while matching their skill level.

Language policy:
- Write in the same language as the provided content/context.
- If mixed, choose the dominant language.

For the current user with "${level}" skill level, create a ${difficulty.complexity} question - ${difficulty.description}.
The question should:
- Be clear, conversational, and easy to understand
- Directly relate to the main concepts in the content
- Be answerable based on the information provided (not require external knowledge)
- Encourage thinking but be appropriate for the user's level
- Avoid academic jargon unless necessary for the subject
- Be formatted as a single straightforward question

Example format for this level: "${difficulty.example}"`
    };

    const userMessage = {
      role: 'user',
      content: `Here is the learning content:\n\n${context}\n\nBased on this content, generate one thoughtful question that challenges the user's understanding at a "${level}" level. Use the same language as the content above.`
    };

    const response = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      messages: [systemMessage, userMessage],
      max_tokens: 800,
    });

    const question = response.choices?.[0]?.message?.content?.trim() || '';
    return NextResponse.json({ question });
  } catch (err: any) {
    console.error('Error generating challenge question:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
