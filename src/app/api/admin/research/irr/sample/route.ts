import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { withApiLogging } from '@/lib/api-logger';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';

/**
 * MVR Item 8d — return the latest IRR sample file produced by
 * `scripts/irr-sample.mjs`. Used by /admin/riset/irr/ to feed the rater UI
 * with the same sample the kappa script will later read.
 */
async function getHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const scriptsDir = path.join(process.cwd(), 'scripts');
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(scriptsDir);
  } catch {
    return NextResponse.json(
      { error: 'Folder scripts/ tidak ditemukan. Jalankan dari root project.' },
      { status: 500 },
    );
  }

  const matches = entries
    .filter((name) => /^irr-sample-.*\.json$/i.test(name))
    .map((name) => {
      const full = path.join(scriptsDir, name);
      const stat = fs.statSync(full);
      return { name, full, mtimeMs: stat.mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (matches.length === 0) {
    return NextResponse.json(
      {
        error: 'Belum ada file sampel IRR. Jalankan `node scripts/irr-sample.mjs` lebih dulu.',
        code: 'IRR_SAMPLE_MISSING',
      },
      { status: 404 },
    );
  }

  const latest = matches[0];
  let payload: unknown;
  try {
    payload = JSON.parse(fs.readFileSync(latest.full, 'utf-8'));
  } catch (err) {
    return NextResponse.json(
      { error: `Gagal membaca file sampel: ${err instanceof Error ? err.message : 'unknown'}` },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    file: latest.name,
    generatedAtFs: new Date(latest.mtimeMs).toISOString(),
    payload,
  });
}

export const GET = withApiLogging(getHandler, { label: 'admin-research-irr-sample' });
