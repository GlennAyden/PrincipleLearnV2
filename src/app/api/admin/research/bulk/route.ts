/**
 * API Route: Bulk Operations
 * Bulk classify from ask_question_history, score indicators
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyCsrfToken } from '@/lib/admin-auth';
import jwt from 'jsonwebtoken';
import { getPromptStageScore, normalizePromptStage } from '@/lib/research-normalizers';

const JWT_SECRET = process.env.JWT_SECRET!;

function verifyAdmin(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET!) as { userId: string; role: string };
    return payload.role?.toLowerCase() === 'admin' ? payload : null;
  } catch {
    return null;
  }
}

// POST /api/admin/research/bulk/classify-history
export async function POST(request: NextRequest) {
  try {
    const csrfError = verifyCsrfToken(request);
    if (csrfError) return csrfError;

    const admin = verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { session_id, dry_run = true } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    // Fetch prompts from session. The historical table does not always carry
    // a prompt_classification_id backlink, so we de-duplicate against
    // prompt_classifications instead of filtering a column that may not exist.
    const { data: prompts } = await adminDb
      .from('ask_question_history')
      .select('id, question, course_id, user_id, learning_session_id, session_number')
      .eq('learning_session_id', session_id)
      .limit(50); // Safety limit

    if (!prompts || prompts.length === 0) {
      return NextResponse.json({ message: 'No unclassified prompts found' });
    }

    const promptIds = prompts.map((prompt: { id: string }) => prompt.id);
    const { data: existingClassifications } = await adminDb
      .from('prompt_classifications')
      .select('prompt_id')
      .eq('prompt_source', 'ask_question')
      .in('prompt_id', promptIds);
    const classifiedIds = new Set(((existingClassifications || []) as Array<{ prompt_id: string }>).map((row) => row.prompt_id));
    const unclassifiedPrompts = prompts.filter((prompt: { id: string }) => !classifiedIds.has(prompt.id));

    if (unclassifiedPrompts.length === 0) {
      return NextResponse.json({ message: 'No unclassified prompts found' });
    }

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        prompts_to_classify: unclassifiedPrompts.length,
        already_classified: prompts.length - unclassifiedPrompts.length,
        sample: unclassifiedPrompts.slice(0, 3)
      });
    }

    // Bulk classify (simple rule-based for demo)
    const classifications = unclassifiedPrompts.map((prompt: {
      id: string;
      question: string;
      course_id: string;
      user_id: string;
      learning_session_id: string;
      session_number?: number | null;
    }) => {
      const stage = normalizePromptStage(classifyPrompt(prompt.question));
      return {
        prompt_source: 'ask_question' as const,
        prompt_id: prompt.id,
        learning_session_id: prompt.learning_session_id,
        user_id: prompt.user_id,
        course_id: prompt.course_id,
        prompt_text: prompt.question,
        prompt_sequence: prompt.session_number ?? null,
        prompt_stage: stage,
        prompt_stage_score: getPromptStageScore(stage),
        micro_markers: inferMicroMarkers(prompt.question, stage),
        primary_marker: inferMicroMarkers(prompt.question, stage)[0] ?? null,
        classified_by: 'bulk_auto',
        classification_method: 'rule_based',
        confidence_score: 0.8,
        classification_evidence: 'Klasifikasi otomatis berbasis aturan untuk pra-coding RM2.',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
    });

    const { data, error } = await adminDb
      .from('prompt_classifications')
      .insert(classifications);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      created: data.length,
      message: `${data.length} classifications created`
    });

  } catch (error: unknown) {
    console.error('Bulk error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
  }
}

function classifyPrompt(prompt: string): 'SCP' | 'SRP' | 'MQP' | 'REFLECTIVE' {
  const lower = prompt.toLowerCase();
  
  if (lower.includes('apa') || lower.includes('bagaimana') || lower.match(/^\w+\?$/)) {
    return 'SCP';
  }
  if (lower.includes('jelaskan') || lower.includes('mengapa') || lower.includes('bagaimana caranya')) {
    return 'SRP';
  }
  if (lower.includes('langkah') || lower.includes('proses') || lower.match(/\d+\./)) {
    return 'MQP';
  }
  return 'REFLECTIVE';
}

function inferMicroMarkers(prompt: string, stage: 'SCP' | 'SRP' | 'MQP' | 'REFLECTIVE'): string[] {
  const lower = prompt.toLowerCase();
  const markers = new Set<string>();
  if (lower.includes('tujuan') || lower.includes('konteks') || lower.includes('diketahui')) markers.add('GCP');
  if (lower.includes('langkah') || lower.includes('urutan') || lower.includes('proses') || lower.match(/\d+\./)) markers.add('PP');
  if (lower.includes('evaluasi') || lower.includes('banding') || lower.includes('kenapa') || lower.includes('mengapa') || stage === 'REFLECTIVE') markers.add('ARP');
  if (markers.size === 0) markers.add(stage === 'SCP' ? 'GCP' : stage === 'MQP' ? 'PP' : 'ARP');
  return Array.from(markers);
}

