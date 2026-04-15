import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

interface LearningProfileRow {
  id: string;
  user_id: string;
  display_name: string | null;
  programming_experience: string | null;
  learning_style: string | null;
  learning_goals: string | null;
  challenges: string | null;
  updated_at: string | null;
  created_at: string | null;
}

interface UserRow {
  id: string;
  email: string | null;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export async function GET(req: NextRequest) {
  try {
    // Defense-in-depth auth check — middleware.ts already blocks non-admin
    // callers on /api/admin/*, but we re-verify here because the route
    // previously had NO in-handler guard at all and a misconfiguration of
    // the matcher would have silently exposed every learning profile.
    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;
    if (!tokenPayload) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }
    if ((tokenPayload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak: admin required' }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');

    let profiles: LearningProfileRow[] = await DatabaseService.getRecords<LearningProfileRow>('learning_profiles', {
      orderBy: { column: 'updated_at', ascending: false },
    });

    if (userId) {
      profiles = profiles.filter((profile) => profile.user_id === userId);
    }

    if (date) {
      const target = new Date(date);
      const start = new Date(target);
      start.setHours(0, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      profiles = profiles.filter((profile) => {
        const timestamp = profile.updated_at || profile.created_at;
        if (!timestamp) return false;
        const ts = new Date(timestamp);
        return ts >= start && ts <= end;
      });
    }

    const userCache = new Map<string, UserRow | null>();
    async function getUser(id: string) {
      if (userCache.has(id)) return userCache.get(id) ?? null;
      const users = await DatabaseService.getRecords<UserRow>('users', {
        filter: { id },
        limit: 1,
      });
      const user = users[0] ?? null;
      userCache.set(id, user);
      return user;
    }

    const payload = [];
    for (const profile of profiles) {
      const user = await getUser(profile.user_id);
      const timestamp = profile.updated_at || profile.created_at;
      payload.push({
        id: profile.id,
        timestamp: timestamp ? new Date(timestamp).toLocaleString('id-ID', DATE_OPTIONS) : 'Unknown time',
        userEmail: user?.email ?? 'Unknown User',
        userId: profile.user_id,
        displayName: profile.display_name ?? '',
        programmingExperience: profile.programming_experience ?? '',
        learningStyle: profile.learning_style ?? '',
        learningGoals: profile.learning_goals ?? '',
        challenges: profile.challenges ?? '',
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Activity][LearningProfile] Failed to fetch learning profile logs', error);
    return NextResponse.json({ error: 'Failed to fetch learning profile logs' }, { status: 500 });
  }
}
