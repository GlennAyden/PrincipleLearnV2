// src/app/api/learning-profile/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { LearningProfileSchema, parseBody } from '@/lib/schemas';

interface LearningProfileRow {
  id: string;
  user_id: string;
  display_name?: string;
  programming_experience?: string;
  learning_style?: string;
  learning_goals?: string;
  challenges?: string;
  created_at?: string | null;
  updated_at?: string | null;
}

function sanitizeProfile(profile: LearningProfileRow | null) {
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

// GET — load the learning profile for the current user (or, for admins,
// any user passed via the `userId` query param).
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const isAdmin = (payload.role ?? '').toLowerCase() === 'admin';
    const effectiveUserId = isAdmin && requestedUserId ? requestedUserId : payload.userId;

    if (!isAdmin && requestedUserId && requestedUserId !== payload.userId) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    const { data: profile, error } = await adminDb
      .from('learning_profiles')
      .select('*')
      .eq('user_id', effectiveUserId)
      .maybeSingle() as { data: LearningProfileRow | null; error: { message: string } | null };

    if (error) {
      console.error('[LearningProfile] GET query error:', error);
      return NextResponse.json({ error: 'Gagal memuat profil' }, { status: 500 });
    }

    return NextResponse.json({
      exists: !!profile,
      profile: sanitizeProfile(profile),
    });
  } catch (err: unknown) {
    console.error('[LearningProfile] GET error:', err);
    return NextResponse.json({ error: 'Failed to load profile' }, { status: 500 });
  }
}

// POST — save or update learning profile. Always binds to the JWT user id;
// clients cannot forge a `userId` in the body.
async function postHandler(request: NextRequest) {
  try {
    // `withProtection` has already verified CSRF + auth, but we still
    // re-parse the JWT here because it is the single source of truth for
    // the target user_id (the body MUST NOT carry one).
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const parsed = parseBody(LearningProfileSchema, rawBody);
    if (!parsed.success) return parsed.response;
    const {
      displayName,
      programmingExperience,
      learningStyle,
      learningGoals,
      challenges,
    } = parsed.data;

    const userId = payload.userId;

    // Upsert profile
    const { data, error } = await adminDb
      .from('learning_profiles')
      .upsert({
        user_id: userId,
        display_name: displayName,
        programming_experience: programmingExperience,
        learning_style: learningStyle,
        learning_goals: learningGoals,
        challenges: challenges,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' }) as { data: LearningProfileRow[] | LearningProfileRow | null; error: { message: string } | null };

    if (error) {
      console.error('[LearningProfile] Save error:', error);
      return NextResponse.json(
        { error: 'Gagal menyimpan profil' },
        { status: 500 }
      );
    }

    const profile = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, profile: sanitizeProfile(profile ?? null) });
  } catch (err: unknown) {
    console.error('[LearningProfile] POST error:', err);
    return NextResponse.json(
      { error: 'Failed to save profile' },
      { status: 500 }
    );
  }
}

// `withProtection` runs the CSRF double-submit check + ensures a valid JWT;
// `withApiLogging` persists the call to api_logs for the admin dashboard.
export const POST = withApiLogging(withProtection(postHandler), {
  label: 'learning-profile-save',
});
