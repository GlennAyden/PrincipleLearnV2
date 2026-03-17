// src/app/api/learning-profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function sanitizeProfile(profile: any) {
  if (!profile) return null;
  return {
    id: profile.id,
    userId: profile.user_id,
    displayName: profile.display_name ?? '',
    programmingExperience: profile.programming_experience ?? '',
    learningStyle: profile.learning_style ?? '',
    learningGoals: profile.learning_goals ?? '',
    challenges: profile.challenges ?? '',
    createdAt: profile.created_at ?? null,
    updatedAt: profile.updated_at ?? null,
  };
}

// GET — check if learning profile exists for a user
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const userId = requestedUserId || payload.userId;

    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    if (userId !== payload.userId && (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data: profile, error } = await adminDb
      .from('learning_profiles')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[LearningProfile] GET query error:', error);
      return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
    }

    return NextResponse.json({
      exists: !!profile,
      profile: sanitizeProfile(profile),
    });
  } catch (err: any) {
    console.error('[LearningProfile] GET error:', err);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

// POST — save or update learning profile
async function postHandler(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json();
    const {
      userId,
      displayName,
      programmingExperience,
      learningStyle,
      learningGoals,
      challenges,
    } = body;

    if (!userId || userId !== payload.userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
    }

    const normalizedDisplayName = normalizeText(displayName);
    const normalizedProgrammingExperience = normalizeText(programmingExperience);
    const normalizedLearningStyle = normalizeText(learningStyle);
    const normalizedLearningGoals = normalizeText(learningGoals);
    const normalizedChallenges = normalizeText(challenges);

    if (!normalizedDisplayName || !normalizedProgrammingExperience || !normalizedLearningStyle) {
      return NextResponse.json(
        { error: 'displayName, programmingExperience, and learningStyle are required' },
        { status: 400 }
      );
    }

    // Upsert profile
    const { data, error } = await adminDb
      .from('learning_profiles')
      .upsert({
        user_id: userId,
        display_name: normalizedDisplayName,
        programming_experience: normalizedProgrammingExperience,
        learning_style: normalizedLearningStyle,
        learning_goals: normalizedLearningGoals,
        challenges: normalizedChallenges,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('[LearningProfile] Save error:', error);
      return NextResponse.json(
        { error: 'Failed to save profile' },
        { status: 500 }
      );
    }

    const profile = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, profile: sanitizeProfile(profile) });
  } catch (err: any) {
    console.error('[LearningProfile] POST error:', err);
    return NextResponse.json(
      { error: err.message || 'Failed to save profile' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'learning-profile-save',
});
