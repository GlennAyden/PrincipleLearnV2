#!/usr/bin/env node
/**
 * Compute Cohen's κ for the IRR double-coding workflow (MVR Item 8d).
 *
 * - Reads pair classifications from `prompt_classifications`: rows where
 *   `classified_by='researcher_2'` are secondary; their `secondary_classification_id`
 *   points to the primary row (created by researcher_1 / auto / manual).
 * - Computes Cohen's κ per stage (SCP/SRP/MQP/REFLECTIVE) and overall (simple
 *   average across stages because marginal totals per stage are often unbalanced).
 * - Computes observed agreement Po per 12 cognitive dimensions.
 * - For prompts where rater_1 vs rater_2 disagree on stage, calls OpenAI as
 *   LLM tiebreaker. If tiebreaker columns exist on prompt_classifications they
 *   are written; otherwise the script prints a warning and continues without
 *   persisting the third opinion.
 * - INSERTs one row into `inter_rater_reliability` summarising the run.
 *
 * Usage:
 *   node scripts/irr-compute-kappa.mjs
 *   node scripts/irr-compute-kappa.mjs --no-llm   # skip tiebreaker
 *   node scripts/irr-compute-kappa.mjs --dry-run  # compute + print, do not INSERT
 *
 * Reads NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY
 * from .env.local. Exit code 0 on PASS (κ ≥ 0.70 AND Po ≥ 0.80), 1 on FAIL.
 */

import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-5-mini';

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
const NO_LLM = Boolean(args['no-llm']);
const STAGES = ['SCP', 'SRP', 'MQP', 'REFLECTIVE'];

const CT_DIMS = [
  'ct_decomposition',
  'ct_pattern_recognition',
  'ct_abstraction',
  'ct_algorithm_design',
  'ct_evaluation_debugging',
  'ct_generalization',
];
const CTH_DIMS = [
  'cth_interpretation',
  'cth_analysis',
  'cth_evaluation',
  'cth_inference',
  'cth_explanation',
  'cth_self_regulation',
];
const ALL_DIMS = [...CT_DIMS, ...CTH_DIMS];

const KAPPA_THRESHOLD = 0.70;
const PO_THRESHOLD = 0.80;

// ── helpers ────────────────────────────────────────────────────────

async function fetchPairs() {
  // Secondary rows have classified_by='researcher_2' and a non-null
  // secondary_classification_id pointing back to the primary classification row.
  const { data: secondary, error: sErr } = await supabase
    .from('prompt_classifications')
    .select('id, prompt_id, prompt_stage, user_id, course_id, secondary_classification_id, prompt_text, classified_by, mode')
    .eq('classified_by', 'researcher_2')
    .eq('mode', 'research')
    .not('secondary_classification_id', 'is', null);

  if (sErr) throw sErr;

  const primaryIds = (secondary ?? []).map((r) => r.secondary_classification_id).filter(Boolean);
  if (primaryIds.length === 0) return [];

  const { data: primary, error: pErr } = await supabase
    .from('prompt_classifications')
    .select('id, prompt_id, prompt_stage, user_id, course_id, prompt_text, classified_by, mode')
    .in('id', primaryIds);

  if (pErr) throw pErr;

  const primaryById = new Map((primary ?? []).map((r) => [r.id, r]));

  const pairs = [];
  for (const sec of secondary ?? []) {
    const prim = primaryById.get(sec.secondary_classification_id);
    if (!prim) continue;
    pairs.push({ primary: prim, secondary: sec });
  }
  return pairs;
}

async function fetchIndicatorsByClassificationIds(ids) {
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('cognitive_indicators')
    .select(`prompt_classification_id, assessed_by, ${ALL_DIMS.join(', ')}`)
    .in('prompt_classification_id', ids);
  if (error) {
    console.warn(`Could not fetch cognitive_indicators: ${error.message}`);
    return new Map();
  }
  const byId = new Map();
  for (const row of data ?? []) {
    byId.set(row.prompt_classification_id, row);
  }
  return byId;
}

/**
 * Cohen's κ for two raters on a categorical variable.
 * categories: ordered list of category labels.
 * pairs: array of [r1Label, r2Label].
 */
function cohensKappa(categories, pairs) {
  if (pairs.length === 0) return { kappa: NaN, po: NaN, pe: NaN, n: 0 };
  const n = pairs.length;
  let agree = 0;
  const marginal1 = Object.fromEntries(categories.map((c) => [c, 0]));
  const marginal2 = Object.fromEntries(categories.map((c) => [c, 0]));
  for (const [a, b] of pairs) {
    if (a === b) agree += 1;
    if (a in marginal1) marginal1[a] += 1;
    if (b in marginal2) marginal2[b] += 1;
  }
  const po = agree / n;
  let pe = 0;
  for (const c of categories) {
    pe += (marginal1[c] / n) * (marginal2[c] / n);
  }
  const kappa = pe === 1 ? 1 : (po - pe) / (1 - pe);
  return { kappa, po, pe, n };
}

/**
 * Per-stage κ: filter pairs where EITHER rater assigned the stage (one-vs-rest
 * binary κ), then macro-average. Reports κ for SCP, SRP, MQP, REFLECTIVE.
 */
function perStageKappa(pairs) {
  const out = {};
  for (const stage of STAGES) {
    const binary = pairs.map(([a, b]) => [a === stage ? stage : 'OTHER', b === stage ? stage : 'OTHER']);
    out[stage] = cohensKappa([stage, 'OTHER'], binary);
  }
  return out;
}

function poPerDimension(primaryRows, secondaryRows) {
  // Maps classification_id → row.
  const result = {};
  for (const dim of ALL_DIMS) {
    let agree = 0;
    let total = 0;
    for (const [primId, primRow] of primaryRows) {
      const secRow = secondaryRows.get(primId);
      if (!primRow || !secRow) continue;
      const a = primRow[dim];
      const b = secRow[dim];
      if (a === null || a === undefined || b === null || b === undefined) continue;
      total += 1;
      if (a === b) agree += 1;
    }
    result[dim] = { po: total > 0 ? agree / total : NaN, n: total };
  }
  return result;
}

async function llmTiebreaker(openai, promptText, aiResponse) {
  const sys = 'Anda adalah pakar pendidikan informatika SMA. Klasifikasikan prompt siswa ke 1 dari 4 stage. Jawab HANYA satu kata: SCP, SRP, MQP, atau REFLECTIVE.';
  const user = `Klasifikasikan prompt siswa berikut ke 1 dari 4 stage: SCP, SRP, MQP, REFLECTIVE.

Definisi:
- SCP: pertanyaan tunggal, minim konteks, definisi/contoh dasar
- SRP: prompt dengan konteks tujuan/batasan, satu fokus
- MQP: pertanyaan berlapis, beberapa sub-pertanyaan
- REFLECTIVE: evaluatif, membandingkan alternatif, justifikasi

Prompt siswa:
${(promptText || '').slice(0, 1500)}

Respons AI (jika tersedia):
${(aiResponse || '').slice(0, 1000)}

Output HANYA satu kata: SCP / SRP / MQP / REFLECTIVE.`;

  const completion = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: 'system', content: sys },
      { role: 'user', content: user },
    ],
    max_completion_tokens: 8,
  });

  const text = (completion.choices?.[0]?.message?.content ?? '').trim().toUpperCase();
  for (const stage of STAGES) {
    if (text.includes(stage)) return stage;
  }
  return null;
}

async function checkTiebreakerColumnsExist() {
  const { data, error } = await supabase
    .from('prompt_classifications')
    .select('tiebreaker_stage, tiebreaker_at')
    .limit(1);
  if (error) {
    return false;
  }
  // If select succeeded but the columns are missing, Supabase returns rows
  // without those keys — we only assume support when no error is thrown.
  return Array.isArray(data);
}

async function persistTiebreaker(primaryId, stage) {
  const { error } = await supabase
    .from('prompt_classifications')
    .update({
      tiebreaker_stage: stage,
      tiebreaker_at: new Date().toISOString(),
    })
    .eq('id', primaryId);
  if (error) throw error;
}

// ── main ───────────────────────────────────────────────────────────

async function main() {
  console.log('IRR Cohen\'s κ Computation — MVR Item 8d');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'} | LLM tiebreaker: ${NO_LLM ? 'DISABLED' : 'ENABLED'}\n`);

  const pairs = await fetchPairs();
  console.log(`Paired classifications (primary vs researcher_2): ${pairs.length}`);
  if (pairs.length === 0) {
    console.warn('No double-coded pairs found. Have raters submitted via /admin/riset/irr/?');
    process.exit(1);
  }

  // Stage κ
  const stagePairs = pairs.map((p) => [p.primary.prompt_stage, p.secondary.prompt_stage]);
  const overallAgree = stagePairs.filter(([a, b]) => a === b).length;
  const overallPo = overallAgree / stagePairs.length;
  const stageBreakdown = perStageKappa(stagePairs);

  // Overall κ = simple average across the 4 per-stage binary κ values.
  // Rationale: with imbalanced marginal distribution per stage we avoid
  // the multi-class κ collapsing to a uninformative single number; macro-
  // average is conservative and easy to defend in thesis methodology.
  const validKappas = STAGES.map((s) => stageBreakdown[s].kappa).filter((k) => !Number.isNaN(k));
  const overallKappa = validKappas.length > 0
    ? validKappas.reduce((a, b) => a + b, 0) / validKappas.length
    : NaN;

  // Per-dimension Po
  const allClassificationIds = [
    ...pairs.map((p) => p.primary.id),
    ...pairs.map((p) => p.secondary.id),
  ];
  const indicators = await fetchIndicatorsByClassificationIds(allClassificationIds);
  const primaryRows = new Map(pairs.map((p) => [p.primary.id, indicators.get(p.primary.id)]));
  const secondaryRows = new Map(pairs.map((p) => [p.primary.id, indicators.get(p.secondary.id)]));
  const dimensionBreakdown = poPerDimension(primaryRows, secondaryRows);

  // LLM tiebreaker for disagreements
  let tiebreakerColumnsAvailable = false;
  let tiebreakerCalls = 0;
  let tiebreakerSkipped = 0;
  if (!NO_LLM) {
    if (!OPENAI_API_KEY) {
      console.warn('OPENAI_API_KEY missing — skipping LLM tiebreaker.');
    } else {
      tiebreakerColumnsAvailable = await checkTiebreakerColumnsExist();
      if (!tiebreakerColumnsAvailable) {
        console.warn(
          'WARNING: prompt_classifications.tiebreaker_stage / tiebreaker_at columns NOT FOUND. ' +
          'Tiebreaker results will be computed and printed but NOT persisted. ' +
          'Add columns manually via migration if persistence is required.',
        );
      }
      const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
      const disagreements = pairs.filter((p) => p.primary.prompt_stage !== p.secondary.prompt_stage);
      console.log(`\nLLM tiebreaker: ${disagreements.length} disagreements to resolve...`);
      for (const pair of disagreements) {
        try {
          const stage = await llmTiebreaker(openai, pair.primary.prompt_text, '');
          tiebreakerCalls += 1;
          console.log(`  [${pair.primary.id.slice(0, 8)}] r1=${pair.primary.prompt_stage}, r2=${pair.secondary.prompt_stage}, llm=${stage ?? '(none)'}`);
          if (stage && tiebreakerColumnsAvailable && !DRY_RUN) {
            await persistTiebreaker(pair.primary.id, stage);
          } else if (!tiebreakerColumnsAvailable) {
            tiebreakerSkipped += 1;
          }
        } catch (err) {
          console.warn(`  tiebreaker failed for ${pair.primary.id}: ${err.message ?? err}`);
        }
      }
    }
  }

  // Summary
  console.log('\n=== RESULTS ===');
  console.log(`Overall κ (macro-avg per-stage): ${overallKappa.toFixed(4)}`);
  console.log(`Overall Po (stage exact match):  ${overallPo.toFixed(4)}`);
  console.log('\nPer-stage:');
  for (const stage of STAGES) {
    const r = stageBreakdown[stage];
    console.log(`  ${stage.padEnd(12)} κ=${Number.isNaN(r.kappa) ? 'n/a' : r.kappa.toFixed(4)}  Po=${Number.isNaN(r.po) ? 'n/a' : r.po.toFixed(4)}  n=${r.n}`);
  }
  console.log('\nPer-dimension Po:');
  for (const dim of ALL_DIMS) {
    const r = dimensionBreakdown[dim];
    console.log(`  ${dim.padEnd(28)} Po=${Number.isNaN(r.po) ? 'n/a' : r.po.toFixed(4)}  n=${r.n}`);
  }

  const meetsKappa = !Number.isNaN(overallKappa) && overallKappa >= KAPPA_THRESHOLD;
  const meetsPo = !Number.isNaN(overallPo) && overallPo >= PO_THRESHOLD;
  const overallAcceptable = meetsKappa && meetsPo;

  console.log(`\nκ ≥ ${KAPPA_THRESHOLD}: ${meetsKappa ? 'PASS' : 'FAIL'}`);
  console.log(`Po ≥ ${PO_THRESHOLD}: ${meetsPo ? 'PASS' : 'FAIL'}`);
  console.log(`Overall: ${overallAcceptable ? 'PASS' : 'FAIL'}`);

  if (tiebreakerSkipped > 0) {
    console.log(`\n(Note: ${tiebreakerSkipped} tiebreaker results not persisted — columns missing.)`);
  }

  // Persist to inter_rater_reliability — store per-stage and per-dimension
  // breakdowns inside the `notes` column as JSON because the live table
  // schema does not have dedicated JSONB breakdown columns; this avoids a
  // schema migration while still keeping the data structured.
  if (!DRY_RUN) {
    const notesPayload = {
      per_stage_breakdown: Object.fromEntries(
        STAGES.map((s) => [s, {
          kappa: stageBreakdown[s].kappa,
          po: stageBreakdown[s].po,
          n: stageBreakdown[s].n,
        }]),
      ),
      per_dimension_breakdown: dimensionBreakdown,
      tiebreaker_calls: tiebreakerCalls,
      tiebreaker_persisted: tiebreakerColumnsAvailable && !NO_LLM,
      computed_at: new Date().toISOString(),
    };

    const { error: insErr } = await supabase.from('inter_rater_reliability').insert({
      coding_round: `round_${new Date().toISOString().slice(0, 10)}`,
      coding_type: 'prompt_classification',
      total_units_coded: pairs.length,
      sample_size: pairs.length,
      sample_percentage: 25.00,
      rater_1_id: 'researcher_1',
      rater_2_id: 'researcher_2',
      observed_agreement: Number(overallPo.toFixed(4)),
      expected_agreement: null,
      cohens_kappa: Number(overallKappa.toFixed(4)),
      meets_po_threshold: meetsPo,
      meets_kappa_threshold: meetsKappa,
      overall_acceptable: overallAcceptable,
      notes: JSON.stringify(notesPayload),
    });

    if (insErr) {
      console.error('Failed to INSERT inter_rater_reliability:', insErr.message);
      process.exit(1);
    }
    console.log('\nInserted row into inter_rater_reliability.');
  } else {
    console.log('\n[DRY RUN] inter_rater_reliability INSERT skipped.');
  }

  process.exit(overallAcceptable ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
