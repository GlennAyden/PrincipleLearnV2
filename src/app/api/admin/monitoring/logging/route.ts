import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

const MONITORED_INPUT_PATHS = [
  '/api/generate-course',
  '/api/ask-question',
  '/api/challenge-response',
  '/api/quiz/submit',
  '/api/feedback',
  '/api/jurnal/save',
  '/api/transcript/save',
  '/api/discussion/start',
  '/api/discussion/respond',
  '/api/learning-profile',
] as const;

const CRITICAL_ALERT_PATHS = [
  '/api/jurnal/save',
  '/api/transcript/save',
  '/api/quiz/submit',
  '/api/discussion/start',
  '/api/discussion/respond',
] as const;

type ApiLogRow = {
  path: string | null;
  status_code: number | null;
  created_at: string | null;
  error_message: string | null;
};

function isFailure(statusCode: number | null) {
  return typeof statusCode === 'number' && statusCode >= 400;
}

function startsWithAny(path: string, patterns: readonly string[]) {
  return patterns.some((base) => path.startsWith(base));
}

export async function GET(request: NextRequest) {
  try {
    // ── Auth Guard ──
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }
    try {
      const payload = jwt.verify(token, JWT_SECRET) as { role?: string };
      if (payload.role?.toLowerCase() !== 'admin') {
        return NextResponse.json({ message: 'Forbidden' }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const daysRaw = Number(searchParams.get('days') || '7');
    const days = Number.isFinite(daysRaw) && daysRaw > 0 ? Math.min(daysRaw, 30) : 7;

    const since = new Date();
    since.setDate(since.getDate() - days);

    const { data, error } = await adminDb
      .from('api_logs')
      .select('path,status_code,created_at,error_message')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) {
      return NextResponse.json({ error: 'Failed to read api logs' }, { status: 500 });
    }

    const rows = (Array.isArray(data) ? data : []) as ApiLogRow[];
    const recentRows = rows.filter((row) => {
      const createdAt = row.created_at ? new Date(row.created_at) : null;
      if (!createdAt || Number.isNaN(createdAt.getTime())) return false;
      return createdAt >= since;
    });

    const monitored = recentRows.filter((row) => {
      const path = row.path || '';
      return startsWithAny(path, MONITORED_INPUT_PATHS);
    });

    const summaryByPath = MONITORED_INPUT_PATHS.map((path) => {
      const pathRows = monitored.filter((row) => (row.path || '').startsWith(path));
      const total = pathRows.length;
      const failed = pathRows.filter((row) => isFailure(row.status_code)).length;
      const success = total - failed;
      const failureRate = total > 0 ? Number(((failed / total) * 100).toFixed(2)) : 0;

      return {
        path,
        total,
        success,
        failed,
        failureRate,
      };
    });

    const topFailingEndpoints = [...summaryByPath]
      .filter((item) => item.failed > 0)
      .sort((a, b) => b.failed - a.failed)
      .slice(0, 10);

    const alerts = summaryByPath
      .filter((item) => CRITICAL_ALERT_PATHS.includes(item.path as (typeof CRITICAL_ALERT_PATHS)[number]))
      .filter((item) => item.failed >= 3 || item.failureRate >= 10)
      .map((item) => ({
        severity: item.failed >= 10 || item.failureRate >= 25 ? 'high' : 'medium',
        path: item.path,
        failed: item.failed,
        failureRate: item.failureRate,
        message:
          item.failed >= 10 || item.failureRate >= 25
            ? 'Critical route menunjukkan kegagalan tinggi. Perlu investigasi segera.'
            : 'Critical route menunjukkan tren kegagalan meningkat. Perlu dipantau ketat.',
      }));

    return NextResponse.json({
      periodDays: days,
      monitoredPaths: MONITORED_INPUT_PATHS,
      totals: {
        total: monitored.length,
        failed: monitored.filter((row) => isFailure(row.status_code)).length,
        success: monitored.filter((row) => !isFailure(row.status_code)).length,
      },
      summaryByPath,
      topFailingEndpoints,
      alerts,
    });
  } catch (err) {
    console.error('[AdminMonitoring][Logging] Unexpected error', err);
    return NextResponse.json({ error: 'Failed to generate logging summary' }, { status: 500 });
  }
}
