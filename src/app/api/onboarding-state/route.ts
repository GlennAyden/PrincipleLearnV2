// src/app/api/onboarding-state/route.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { OnboardingStateSchema, parseBody } from '@/lib/schemas';

type OnboardingFlagRow = {
  intro_slides_completed?: boolean | null;
  course_tour_completed?: boolean | null;
};

const FLAG_TO_COLUMN = {
  intro_slides: 'intro_slides_completed',
  course_tour: 'course_tour_completed',
} as const;

function serialize(row: OnboardingFlagRow | null) {
  return {
    introSlidesCompleted: !!row?.intro_slides_completed,
    courseTourCompleted: !!row?.course_tour_completed,
  };
}

// GET — current user's onboarding flags. Returns both flags as false when the
// `learning_profiles` row does not exist yet (user hasn't finished the profile
// wizard) so the client can still treat a missing profile as "not yet seen".
export async function GET(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const { data, error } = await adminDb
      .from('learning_profiles')
      .select('intro_slides_completed, course_tour_completed')
      .eq('user_id', payload.userId)
      .maybeSingle() as { data: OnboardingFlagRow | null; error: { message: string } | null };

    if (error) {
      console.error('[OnboardingState] GET query error:', error);
      return NextResponse.json({ error: 'Gagal memuat status onboarding' }, { status: 500 });
    }

    return NextResponse.json({ success: true, state: serialize(data) });
  } catch (err: unknown) {
    console.error('[OnboardingState] GET error:', err);
    return NextResponse.json({ error: 'Failed to load onboarding state' }, { status: 500 });
  }
}

// POST — set a single onboarding flag. Binds to the JWT user id; the client
// cannot forge a target user id. If the `learning_profiles` row does not yet
// exist we treat the call as a no-op (the profile wizard will create it).
async function postHandler(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload?.userId) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    const rawBody = await request.json().catch(() => null);
    if (!rawBody) {
      return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
    }
    const parsed = parseBody(OnboardingStateSchema, rawBody);
    if (!parsed.success) return parsed.response;
    const { flag, value } = parsed.data;

    const column = FLAG_TO_COLUMN[flag];

    // `adminDb.from(...).eq(...).update(...)` — this project's query builder
    // accumulates filters BEFORE `.update()` (unlike raw supabase-js). The
    // wrapper also injects `updated_at` automatically, so we don't pass it.
    const { data, error } = await adminDb
      .from('learning_profiles')
      .eq('user_id', payload.userId)
      .update({ [column]: value }) as {
        data: OnboardingFlagRow[] | null;
        error: { message: string } | null;
      };

    if (error) {
      console.error('[OnboardingState] POST update error:', error);
      return NextResponse.json({ error: 'Gagal menyimpan status onboarding' }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] ?? null : data;
    return NextResponse.json({ success: true, state: serialize(row) });
  } catch (err: unknown) {
    console.error('[OnboardingState] POST error:', err);
    return NextResponse.json({ error: 'Failed to update onboarding state' }, { status: 500 });
  }
}

export const POST = withApiLogging(withProtection(postHandler), {
  label: 'onboarding-state-update',
});
