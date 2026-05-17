#!/usr/bin/env node
// Local snapshot of research-critical tables. Run before demo / sidang as a
// rollback safety net. Supabase free tier already has daily auto-backup
// with 7-day retention via the dashboard, but the dashboard backup includes
// EVERYTHING (auth, storage, system). This dump is a focused snapshot of
// just the rows that matter for RM2/RM3 evidence, written as line-delimited
// JSON files we can `cat | psql` back if needed.
//
// Usage: node scripts/dump-research-tables.mjs [--out=backups/YYYYMMDD]
// Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in env.

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

config({ path: '.env.local' });
config({ path: '.env' });

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const OUT = args.out || join('backups', date);
mkdirSync(OUT, { recursive: true });

const TABLES = [
  // Identity (minimum context for relinking other tables)
  'users',
  'learning_profiles',

  // Content authored by the researcher
  'courses',
  'subtopics',
  'leaf_subtopics',
  'subtopic_cache',
  'course_unlock_dependencies',
  'materials',
  'material_chunks',

  // Student activity (the actual evidence)
  'quiz',
  'quiz_submissions',
  'jurnal',
  'transcript',
  'user_progress',
  'learning_sessions',
  'ask_question_history',
  'challenge_responses',
  'research_artifacts',

  // Research pipeline
  'prompt_revisions',
  'prompt_classifications',
  'cognitive_indicators',
  'auto_cognitive_scores',
  'research_evidence_items',
  'research_auto_coding_runs',
  'triangulation_records',
  'inter_rater_reliability',
];

const supa = createClient(URL, KEY, { auth: { persistSession: false } });

async function dump(table) {
  // Page through results — Supabase caps a single response at 1000 rows.
  const PAGE = 1000;
  let from = 0;
  let total = 0;
  const path = join(OUT, `${table}.jsonl`);
  let buf = '';
  while (true) {
    const { data, error } = await supa.from(table).select('*').range(from, from + PAGE - 1);
    if (error) {
      console.error(`  ${table}: ${error.message}`);
      return { table, total: 0, error: error.message };
    }
    if (!data || data.length === 0) break;
    for (const row of data) buf += JSON.stringify(row) + '\n';
    total += data.length;
    if (data.length < PAGE) break;
    from += PAGE;
  }
  writeFileSync(path, buf);
  return { table, total };
}

async function main() {
  console.log(`Dumping to ${OUT}\n`);
  const results = await Promise.all(TABLES.map(dump));
  console.log('');
  let totalRows = 0;
  for (const r of results) {
    if (r.error) {
      console.log(`  SKIP  ${r.table.padEnd(30)} — ${r.error}`);
    } else {
      console.log(`  OK    ${r.table.padEnd(30)} ${r.total} rows`);
      totalRows += r.total;
    }
  }
  console.log(`\nTotal: ${totalRows} rows across ${TABLES.length} tables.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
