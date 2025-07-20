// src/app/api/generate-subtopic/route.ts

import { NextResponse } from 'next/server';
import { OpenAI } from 'openai';

// Ambil API key dari env
let apiKey = process.env.OPENAI_API_KEY;
// Fallback ke admin key kalau perlu (FIXED: proper validation)
if (!apiKey || apiKey === 'your-openai-api-key-here' || apiKey === 'sk-your-openai-api-key') {
  console.warn(
    'Env key invalid atau missing, falling back to hardcoded admin key for subtopic'
  );
  apiKey = 'sk-proj-your-openai-api-key-here';
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
    const { module: moduleTitle, subtopic } = payload;
    if (!moduleTitle || !subtopic) {
      return NextResponse.json(
        { error: 'module and subtopic are required' },
        { status: 400 }
      );
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
      model: 'gpt-4o-mini',
      messages: [systemMessage, userMessage] as any,
      temperature: 0.7,
      max_tokens: 4000,
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
      
      if (hasIssues) {
        console.warn('Generated content had issues with paragraph counts that were automatically fixed');
      }
      
    } catch (parseErr) {
      console.error('Failed to parse JSON from AI:', { cleaned, sanitized, parseErr });
      return NextResponse.json(
        { error: 'Invalid JSON from AI' },
        { status: 500 }
      );
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
