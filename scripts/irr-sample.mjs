#!/usr/bin/env node
/**
 * Stratified random sampling 25% of `prompt_classifications` (Mode Penelitian)
 * for IRR double-coding workflow (MVR Item 8d).
 *
 * - Strata: stage (SCP / SRP / MQP / REFLECTIVE).
 * - Per stratum: random 25%, but minimum 5 (or all rows if stratum < 5).
 * - Output: scripts/irr-sample-<ISO-timestamp>.json
 *
 * Usage:
 *   node scripts/irr-sample.mjs
 *   node scripts/irr-sample.mjs --seed=42         # reproducible sampling
 *   node scripts/irr-sample.mjs --dry-run         # preview only, no file write
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local.
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);

const DRY_RUN = Boolean(args['dry-run']);
const SEED_ARG = typeof args.seed === 'string' ? parseInt(args.seed, 10) : null;
const SAMPLE_RATIO = 0.25;
const MIN_PER_STAGE = 5;

// Stages we stratify by. Schema uses 'REFLECTIVE' (uppercase) per
// docs/sql/create_research_tables.sql; UI label in codebook is 'Reflektif'.
const STAGES = ['SCP', 'SRP', 'MQP', 'REFLECTIVE'];

// Mulberry32 — small, deterministic PRNG for reproducible --seed runs.
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(array, rng) {
  const a = [...array];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchUniverse() {
  // We sample only rows produced by the primary classifier (NOT secondary
  // rater), restricted to Mode Penelitian. The cognitive_indicators score
  // payload is joined separately because of the FK relationship.
  const { data: rows, error } = await supabase
    .from('prompt_classifications')
    .select(`
      id,
      prompt_id,
      prompt_text,
      prompt_source,
      prompt_stage,
      user_id,
      course_id,
      mode,
      classified_by,
      created_at
    `)
    .eq('mode', 'research')
    .in('prompt_stage', STAGES)
    .neq('classified_by', 'researcher_2')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return rows ?? [];
}

async function fetchScoresForClassifications(classificationIds) {
  if (classificationIds.length === 0) return new Map();

  // Cognitive_indicators has FK prompt_classification_id; one row per (clf, rater).
  // We fetch the primary assessor row when available.
  const { data, error } = await supabase
    .from('cognitive_indicators')
    .select(`
      prompt_classification_id,
      assessed_by,
      ct_decomposition,
      ct_pattern_recognition,
      ct_abstraction,
      ct_algorithm_design,
      ct_evaluation_debugging,
      ct_generalization,
      cth_interpretation,
      cth_analysis,
      cth_evaluation,
      cth_inference,
      cth_explanation,
      cth_self_regulation
    `)
    .in('prompt_classification_id', classificationIds)
    .neq('assessed_by', 'researcher_2');

  if (error) {
    console.warn(`Could not fetch cognitive_indicators: ${error.message}`);
    return new Map();
  }

  const byClassification = new Map();
  for (const row of data ?? []) {
    // Prefer earliest non-secondary row per classification.
    if (!byClassification.has(row.prompt_classification_id)) {
      byClassification.set(row.prompt_classification_id, row);
    }
  }
  return byClassification;
}

async function fetchAiResponsesForPrompts(promptSources) {
  // promptSources is a Map<promptId, source>; we batch by source to fetch
  // ai_response text from the corresponding table.
  const responsesByPromptId = new Map();
  const bySource = new Map();
  for (const [pid, src] of promptSources) {
    if (!bySource.has(src)) bySource.set(src, []);
    bySource.get(src).push(pid);
  }

  for (const [source, ids] of bySource) {
    if (ids.length === 0) continue;
    let table = null;
    let respCol = null;
    if (source === 'ask_question') {
      table = 'ask_question_history';
      respCol = 'response_text';
    } else if (source === 'challenge') {
      table = 'challenge_responses';
      respCol = 'student_response';
    } else if (source === 'discussion') {
      table = 'discussion_messages';
      respCol = 'content';
    }
    if (!table || !respCol) continue;
    const { data, error } = await supabase
      .from(table)
      .select(`id, ${respCol}`)
      .in('id', ids);
    if (error) {
      console.warn(`Could not fetch ${table}: ${error.message}`);
      continue;
    }
    for (const row of data ?? []) {
      responsesByPromptId.set(row.id, row[respCol] ?? '');
    }
  }
  return responsesByPromptId;
}

function pickScoreFields(row) {
  if (!row) return {};
  return {
    ct_decomposition: row.ct_decomposition ?? 0,
    ct_pattern_recognition: row.ct_pattern_recognition ?? 0,
    ct_abstraction: row.ct_abstraction ?? 0,
    ct_algorithm_design: row.ct_algorithm_design ?? 0,
    ct_evaluation_debugging: row.ct_evaluation_debugging ?? 0,
    ct_generalization: row.ct_generalization ?? 0,
    cth_interpretation: row.cth_interpretation ?? 0,
    cth_analysis: row.cth_analysis ?? 0,
    cth_evaluation: row.cth_evaluation ?? 0,
    cth_inference: row.cth_inference ?? 0,
    cth_explanation: row.cth_explanation ?? 0,
    cth_self_regulation: row.cth_self_regulation ?? 0,
  };
}

async function main() {
  console.log('IRR Sampling — MVR Item 8d');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | Seed: ${SEED_ARG ?? '(random)'} | Ratio: ${SAMPLE_RATIO}`);

  const universe = await fetchUniverse();
  console.log(`Universe: ${universe.length} prompt_classifications (mode=research, primary rater only)\n`);

  if (universe.length === 0) {
    console.warn('No rows to sample. Exiting.');
    process.exit(0);
  }

  const seed = SEED_ARG ?? (Math.floor(Math.random() * 2 ** 31) >>> 0);
  const rng = makeRng(seed);

  // Stratify by stage.
  const byStage = new Map(STAGES.map((s) => [s, []]));
  for (const row of universe) {
    const stage = row.prompt_stage;
    if (byStage.has(stage)) byStage.get(stage).push(row);
  }

  const sampledRows = [];
  const perStage = {};

  for (const stage of STAGES) {
    const pool = byStage.get(stage) ?? [];
    const target = Math.max(MIN_PER_STAGE, Math.ceil(pool.length * SAMPLE_RATIO));
    const take = Math.min(target, pool.length);
    const shuffled = shuffle(pool, rng);
    const picked = shuffled.slice(0, take);
    sampledRows.push(...picked);
    perStage[stage] = picked.length;
    console.log(`  ${stage}: universe=${pool.length}, target=${target}, picked=${picked.length}`);
  }

  console.log(`\nTotal sample: ${sampledRows.length}`);

  // Fetch joined data (scores + AI responses).
  const classificationIds = sampledRows.map((r) => r.id);
  const promptSources = new Map(sampledRows.map((r) => [r.prompt_id, r.prompt_source]));

  console.log('Fetching joined cognitive_indicators + AI responses...');
  const [scoresMap, aiResponsesMap] = await Promise.all([
    fetchScoresForClassifications(classificationIds),
    fetchAiResponsesForPrompts(promptSources),
  ]);

  const items = sampledRows.map((r) => ({
    promptClassificationId: r.id,
    promptId: r.prompt_id,
    promptSource: r.prompt_source,
    promptText: r.prompt_text,
    aiResponse: aiResponsesMap.get(r.prompt_id) ?? null,
    currentStage: r.prompt_stage,
    currentScores: pickScoreFields(scoresMap.get(r.id)),
    courseId: r.course_id,
    userId: r.user_id,
    classifiedBy: r.classified_by,
    createdAt: r.created_at,
  }));

  const payload = {
    generatedAt: new Date().toISOString(),
    seed,
    sampleRatio: SAMPLE_RATIO,
    minPerStage: MIN_PER_STAGE,
    totalUniverse: universe.length,
    totalSample: items.length,
    perStage,
    items,
  };

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No file written. Summary:');
    console.log(JSON.stringify({
      generatedAt: payload.generatedAt,
      seed: payload.seed,
      totalUniverse: payload.totalUniverse,
      totalSample: payload.totalSample,
      perStage: payload.perStage,
    }, null, 2));
    return;
  }

  const outDir = path.join(process.cwd(), 'scripts');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(outDir, `irr-sample-${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), 'utf-8');

  console.log(`\nWritten: ${outPath}`);
  console.log(`Per-stage: ${JSON.stringify(perStage)}`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
