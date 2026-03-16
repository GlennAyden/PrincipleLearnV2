// src/app/api/learning-profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';

// GET — check if learning profile exists for a user
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    const { data: profile } = await adminDb
      .from('learning_profiles')
      .select('*')
      .eq('user_id', userId)
      .single();

    return NextResponse.json({
      exists: !!profile,
      profile: profile || null,
    });
  } catch (err: any) {
    console.error('[LearningProfile] GET error:', err);
    return NextResponse.json({ exists: false, profile: null });
  }
}

// POST — save or update learning profile
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      userId,
      displayName,
      programmingExperience,
      learningStyle,
      learningGoals,
      challenges,
    } = body;

    if (!userId || !displayName || !programmingExperience || !learningStyle) {
      return NextResponse.json(
        { error: 'userId, displayName, programmingExperience, and learningStyle are required' },
        { status: 400 }
      );
    }

    // Upsert profile
    const { data, error } = await adminDb
      .from('learning_profiles')
      .upsert({
        user_id: userId,
        display_name: displayName,
        programming_experience: programmingExperience,
        learning_style: learningStyle,
        learning_goals: learningGoals || '',
        challenges: challenges || '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[LearningProfile] Save error:', error);
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, profile: data });
  } catch (err: any) {
    console.error('[LearningProfile] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to save profile' },
      { status: 500 }
    );
  }
}
