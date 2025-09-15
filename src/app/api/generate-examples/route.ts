// src/app/api/generate-examples/route.ts
import { NextResponse } from 'next/server';
import { openai, defaultOpenAIModel } from '@/lib/openai';

// OpenAI client and model are centralized in src/lib/openai

export async function POST(req: Request) {
  try {
    const { context } = await req.json();
    if (!context) {
      return NextResponse.json({ error: 'Missing context in request body' }, { status: 400 });
    }

    const systemMessage = {
      role: 'system',
      content: `You are an educational assistant that provides illustrative examples to deepen understanding of a given topic.

Language policy:
- Write in the same language as the provided context text.
- If mixed, choose the dominant language and avoid unnecessary translation.

Guidelines for your examples:
- Use clear, straightforward language that's easy to understand
- Provide practical, real-world examples that relate to everyday experiences when possible
- Make examples concise but complete enough to illustrate the concept
- Create a detailed, compelling example that clearly demonstrates the main concept`
    };
    
    const userMessage = {
      role: 'user',
      content: `Here is the context of the subtopic:\n${context}\n\nPlease generate one detailed, concise, real-world example in the same language as the context above. Return the result as a JSON object with an "examples" array containing a single string.`
    };

    const response = await openai.chat.completions.create({
      model: defaultOpenAIModel,
      messages: [systemMessage, userMessage],
      max_tokens: 1500,
    });

    const raw = response.choices?.[0]?.message?.content ?? '';
    if (!raw.trim()) {
      throw new Error('Empty response from model');
    }
    // Clean JSON block if wrapped
    const cleaned = raw.replace(/```json\s*/, '').replace(/```/g, '').trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
      
      // Ensure we have exactly 1 example
      if (!parsed.examples || !Array.isArray(parsed.examples) || parsed.examples.length === 0) {
        parsed.examples = ['No example available.'];
      } else if (parsed.examples.length > 1) {
        // Just take the first example if multiple are returned
        parsed.examples = [parsed.examples[0]];
      }
      
    } catch (err: any) {
      console.error('Failed to parse JSON from examples:', { cleaned, err });
      throw new Error('Invalid JSON response from AI');
    }

    return NextResponse.json(parsed);
  } catch (err: any) {
    console.error('Error generating examples:', err);
    return NextResponse.json({ error: err.message || 'Failed to generate examples' }, { status: 500 });
  }
}
