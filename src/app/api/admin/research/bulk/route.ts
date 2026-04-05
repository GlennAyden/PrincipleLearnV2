/**
 * API Route: Bulk Operations
 * Bulk classify from ask_question_history, score indicators
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';

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
    const admin = verifyAdmin(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json();
    const { session_id, dry_run = true } = body;

    if (!session_id) {
      return NextResponse.json({ error: 'session_id required' }, { status: 400 });
    }

    // Fetch unclassified prompts from session
    const { data: prompts } = await adminDb
      .from('ask_question_history')
      .select('id, question, course_id, user_id, learning_session_id')
      .eq('learning_session_id', session_id)
      .is('prompt_classification_id', null) // Unclassified
      .limit(50); // Safety limit

    if (!prompts || prompts.length === 0) {
      return NextResponse.json({ message: 'No unclassified prompts found' });
    }

    if (dry_run) {
      return NextResponse.json({
        dry_run: true,
        prompts_to_classify: prompts.length,
        sample: prompts.slice(0, 3)
      });
    }

    // Bulk classify (simple rule-based for demo)
    const classifications = prompts.map((prompt: { id: string; question: string; course_id: string; user_id: string; learning_session_id: string }) => ({
      prompt_source: 'ask_question' as const,
      prompt_id: prompt.id,
      learning_session_id: prompt.learning_session_id,
      user_id: prompt.user_id,
      course_id: prompt.course_id,
      prompt_text: prompt.question,
      prompt_stage: classifyPrompt(prompt.question) as any,
      classified_by: 'bulk_auto',
      classification_method: 'rule_based',
      confidence_score: 0.8,
      created_at: new Date().toISOString()
    }));

    const { data, error } = await adminDb
      .from('prompt_classifications')
      .insert(classifications);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      created: data.length,
      message: `${data.length} classifications created`
    });

  } catch (error: any) {
    console.error('Bulk error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
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

