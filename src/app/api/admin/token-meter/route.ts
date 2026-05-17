// src/app/api/admin/token-meter/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';

// ─── AI endpoint definitions ───────────────────────────────────────────────

/**
 * AI endpoint paths yang mengonsumsi OpenAI tokens.
 * Digunakan untuk filter query api_logs dan estimasi fallback.
 */
const AI_ENDPOINT_KEYS = [
  'generate-course',
  'generate-subtopic',
  'generate-examples',
  'ask-question',
  'challenge-thinking',
  'challenge-feedback',
] as const;

type EndpointKey = (typeof AI_ENDPOINT_KEYS)[number];

const AI_PATH_MAP: Record<EndpointKey, string> = {
  'generate-course':   '/api/generate-course',
  'generate-subtopic': '/api/generate-subtopic',
  'generate-examples': '/api/generate-examples',
  'ask-question':      '/api/ask-question',
  'challenge-thinking':'/api/challenge-thinking',
  'challenge-feedback':'/api/challenge-feedback',
};

const ENDPOINT_LABELS: Record<EndpointKey, string> = {
  'generate-course':   'Generate Kursus',
  'generate-subtopic': 'Generate Subtopik',
  'generate-examples': 'Generate Contoh',
  'ask-question':      'Tanya Jawab',
  'challenge-thinking':'Tantangan Berpikir',
  'challenge-feedback':'Feedback Tantangan',
};

/**
 * Estimasi token per call berdasarkan path endpoint.
 * Sesuai spesifikasi: generate-course ~3000, generate-subtopic ~1500,
 * ask-question ~800, challenge-thinking ~1200.
 */
const TOKEN_ESTIMATES: Record<EndpointKey, number> = {
  'generate-course':    3000,
  'generate-subtopic':  1500,
  'generate-examples':   900,
  'ask-question':        800,
  'challenge-thinking': 1200,
  'challenge-feedback':  600,
};

// ─── Pricing constants ─────────────────────────────────────────────────────

/**
 * gpt-4o-mini pricing (input $0.15/1M + output $0.60/1M, 50/50 split):
 * blended ≈ $0.375/1M token
 *
 * Spesifikasi menyebut "gpt-5-mini" ($0.30 input + $1.20 output / 1M, 50/50):
 * blended = ($0.30 + $1.20) / 2 / 1_000_000 = $0.75/1M
 * Gunakan angka ini agar sesuai spec.
 */
const PRICE_PER_TOKEN_USD = 0.75 / 1_000_000;

/** Kurs IDR per 1 USD (konstan; update manual jika perlu) */
const KURS_IDR = 15_800;

// ─── Helpers ───────────────────────────────────────────────────────────────

function pathToKey(path: string): EndpointKey | null {
  for (const key of AI_ENDPOINT_KEYS) {
    if (path === AI_PATH_MAP[key] || path.startsWith(AI_PATH_MAP[key])) {
      return key;
    }
  }
  return null;
}

function estimateTokens(
  path: string,
  metadata: Record<string, unknown> | null,
): number {
  if (metadata) {
    const fromMeta =
      (metadata.tokens as number | undefined) ??
      ((metadata.usage as Record<string, number> | undefined)?.total_tokens) ??
      null;
    if (typeof fromMeta === 'number' && fromMeta > 0) return fromMeta;
  }
  const key = pathToKey(path);
  return key ? TOKEN_ESTIMATES[key] : 1000;
}

function toCostUsd(tokens: number): number {
  return Math.round(tokens * PRICE_PER_TOKEN_USD * 1_000_000) / 1_000_000;
}

function toCostIdr(tokens: number): number {
  return Math.round(tokens * PRICE_PER_TOKEN_USD * KURS_IDR * 100) / 100;
}

type Period = 'today' | 'week' | 'month' | 'all';

function getPeriodStart(period: Period): string | null {
  const now = new Date();
  if (period === 'today') {
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (period === 'week') {
    now.setDate(now.getDate() - 7);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  if (period === 'month') {
    now.setDate(now.getDate() - 30);
    now.setHours(0, 0, 0, 0);
    return now.toISOString();
  }
  return null; // 'all' — no filter
}

/** Bangun array 7 titik harian dari baris log */
function buildSparkline(
  rows: Array<{
    created_at: string;
    path: string;
    metadata: Record<string, unknown> | null;
  }>,
): Array<{ date: string; tokens: number; costUsd: number; costIdr: number }> {
  const days: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    days.push(d.toISOString().slice(0, 10));
  }

  const dayMap = new Map<string, number>();
  for (const d of days) dayMap.set(d, 0);

  for (const row of rows) {
    const day = row.created_at.slice(0, 10);
    if (dayMap.has(day)) {
      const t = estimateTokens(row.path, row.metadata);
      dayMap.set(day, (dayMap.get(day) ?? 0) + t);
    }
  }

  return days.map((date) => {
    const tokens = dayMap.get(date) ?? 0;
    return { date, tokens, costUsd: toCostUsd(tokens), costIdr: toCostIdr(tokens) };
  });
}

// ─── Handler ───────────────────────────────────────────────────────────────

async function getHandler(req: NextRequest): Promise<NextResponse> {
  const { searchParams } = req.nextUrl;
  const period = (searchParams.get('period') ?? 'today') as Period;
  const courseId = searchParams.get('courseId') ?? null;

  if (!['today', 'week', 'month', 'all'].includes(period)) {
    return NextResponse.json(
      { error: 'period harus today|week|month|all' },
      { status: 400 },
    );
  }

  const allPaths = Object.values(AI_PATH_MAP);
  const periodStart = getPeriodStart(period);

  // Query api_logs — hanya ambil 200-call AI, status 200
  let query = adminDb
    .from('api_logs')
    .select('path, metadata, user_id, created_at')
    .in('path', allPaths)
    .eq('status_code', 200)
    .order('created_at', { ascending: false })
    .limit(5000);

  if (periodStart) {
    query = query.gte('created_at', periodStart);
  }

  const { data: rows, error } = await query;

  if (error) {
    console.error('[TokenMeter] Query failed', error);
    return NextResponse.json({ error: 'Gagal mengambil data token' }, { status: 500 });
  }

  type LogRow = {
    path: string;
    metadata: Record<string, unknown> | null;
    user_id: string | null;
    created_at: string;
  };

  const typedRows = (rows ?? []) as LogRow[];

  // ── Aggregate totals ──
  let totalTokens = 0;
  const totalCalls = typedRows.length;

  // ── By endpoint breakdown ──
  const endpointMap = new Map<
    EndpointKey,
    { tokens: number; calls: number }
  >();
  for (const key of AI_ENDPOINT_KEYS) {
    endpointMap.set(key, { tokens: 0, calls: 0 });
  }

  for (const row of typedRows) {
    const tokens = estimateTokens(row.path, row.metadata);
    totalTokens += tokens;

    const key = pathToKey(row.path);
    if (key) {
      const bucket = endpointMap.get(key)!;
      bucket.tokens += tokens;
      bucket.calls += 1;
    }
  }

  const byEndpoint = AI_ENDPOINT_KEYS.map((key) => {
    const { tokens, calls } = endpointMap.get(key)!;
    return {
      key,
      label: ENDPOINT_LABELS[key],
      tokens,
      calls,
      costUsd: toCostUsd(tokens),
      costIdr: toCostIdr(tokens),
    };
  }).filter((e) => e.calls > 0); // Hanya tampilkan yang punya data

  // ── By day breakdown (7 hari terakhir untuk period=week, selalu ada) ──
  const byDay = buildSparkline(typedRows);

  return NextResponse.json({
    totalTokens,
    totalCalls,
    estimatedCostUSD: toCostUsd(totalTokens),
    estimatedCostIDR: toCostIdr(totalTokens),
    byEndpoint,
    byDay,
    meta: {
      period,
      courseId,
      periodStart,
      kursIdr: KURS_IDR,
      pricePerMillionUSD: PRICE_PER_TOKEN_USD * 1_000_000,
      rowsAnalyzed: typedRows.length,
      hasRealTokenData: typedRows.some(
        (r) =>
          r.metadata &&
          ((r.metadata.tokens as number | undefined) ?? 0) > 0,
      ),
    },
  });
}

export const GET = withApiLogging(withProtection(getHandler, { adminOnly: true }), {
  label: 'token-meter',
  awaitLog: false,
});
