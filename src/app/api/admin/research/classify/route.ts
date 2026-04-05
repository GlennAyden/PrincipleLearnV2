/**
 * API Route: Auto-Classification with LLM
 * POST /api/admin/research/classify
 * 
 * Suggests prompt stage, confidence, rationale, and micro-markers
 * using a SINGLE OpenAI call (optimized from 2 calls)
 */

import { NextRequest, NextResponse } from 'next/server';
import { openai } from '@/lib/openai';
import jwt from 'jsonwebtoken';
import type { PromptStage, MicroMarker } from '@/types/research';

const JWT_SECRET = process.env.JWT_SECRET!;
const OPENAI_MODEL = 'gpt-4o-mini';

interface ClassifyRequest {
    prompt_text: string;
    context?: string;
}

interface ClassifyResponse {
    suggested_stage: PromptStage;
    confidence: number;
    rationale: string;
    micro_markers: MicroMarker[];
    examples_matched: string[];
}

function verifyAdmin(request: NextRequest) {
    const token = request.cookies.get('access_token')?.value;
    if (!token) return null;
    try {
        const payload = jwt.verify(token, JWT_SECRET) as { userId: string; role: string };
        return payload.role?.toLowerCase() === 'admin' ? payload : null;
    } catch {
        return null;
    }
}

// POST /api/admin/research/classify
export async function POST(request: NextRequest) {
    try {
        const admin = verifyAdmin(request);
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body: ClassifyRequest = await request.json();
        if (!body.prompt_text?.trim()) {
            return NextResponse.json({ error: 'prompt_text required' }, { status: 400 });
        }

        // SINGLE combined prompt - classification + analysis in one call
        const combinedPrompt = `
Kamu adalah ahli analisis prompt pendidikan. Klasifikasikan prompt siswa berikut dan berikan analisis lengkap.

## Tahap Prompt:
- SCP (1): Pertanyaan tunggal, langsung, minim konteks masalah
- SRP (2): Prompt direformulasi setelah respons AI untuk memperjelas tujuan/langkah
- MQP (3): Pertanyaan berlapis, iteratif dalam satu rangkaian masalah
- REFLECTIVE (4): Evaluasi solusi, bandingkan alternatif, justifikasi keputusan

## Penanda Mikro:
- GCP: Goal and Contextualized Prompting - menegaskan tujuan belajar dan konteks masalah
- PP: Procedural Prompting - meminta langkah prosedural bertahap
- ARP: Analytical and Reflective Prompting - mengevaluasi kualitas solusi

## Prompt Siswa:
"${body.prompt_text}"

## Konteks:
${body.context || 'Tidak ada konteks tambahan'}

## Instruksi:
Jawab dalam format JSON yang valid:
{
  "stage": "SCP" atau "SRP" atau "MQP" atau "REFLECTIVE",
  "confidence": 0.0 sampai 1.0,
  "rationale": "penjelasan singkat mengapa tahap ini dipilih",
  "micro_markers": ["GCP", "PP", "ARP"] (pilih yang relevan, bisa kosong),
  "examples_matched": ["deskripsi singkat pola yang cocok"]
}
`;

        const completion = await openai.chat.completions.create({
            model: OPENAI_MODEL,
            messages: [{ role: 'user', content: combinedPrompt }],
            temperature: 0.2,
            max_tokens: 300,
            response_format: { type: 'json_object' }
        });

        const responseText = completion.choices[0]?.message?.content || '{}';
        let parsed: {
            stage?: string;
            confidence?: number;
            rationale?: string;
            micro_markers?: string[];
            examples_matched?: string[];
        };

        try {
            parsed = JSON.parse(responseText);
        } catch {
            parsed = {};
        }

        // Validate and normalize stage
        const validStages: PromptStage[] = ['SCP', 'SRP', 'MQP', 'REFLECTIVE'];
        const rawStage = (parsed.stage || '').toUpperCase();
        const suggested_stage: PromptStage = validStages.includes(rawStage as PromptStage)
            ? rawStage as PromptStage
            : 'SCP';

        // Validate and normalize confidence
        const confidence = Math.max(0, Math.min(1, parsed.confidence || 0.7));

        // Validate micro markers
        const validMarkers: MicroMarker[] = ['GCP', 'PP', 'ARP'];
        const micro_markers = (parsed.micro_markers || [])
            .filter((m: string) => validMarkers.includes(m as MicroMarker)) as MicroMarker[];

        const result: ClassifyResponse = {
            suggested_stage,
            confidence,
            rationale: parsed.rationale || 'LLM classification',
            micro_markers,
            examples_matched: parsed.examples_matched || []
        };

        return NextResponse.json({ success: true, data: result });

    } catch (error: unknown) {
        console.error('Classification error:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json(
            { error: 'Classification failed', details: message },
            { status: 500 }
        );
    }
}
