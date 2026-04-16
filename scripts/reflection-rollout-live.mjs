import { createClient } from '@supabase/supabase-js'
import { config as loadEnv } from 'dotenv'
import fs from 'node:fs/promises'
import path from 'node:path'

loadEnv({ path: '.env', override: false })
loadEnv({ path: '.env.local', override: true })

const projectUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const managementToken =
  process.env.SUPABASE_ACCESS_TOKEN ||
  process.env.SUPABASE_MANAGEMENT_TOKEN ||
  ''

const args = new Set(process.argv.slice(2))
const applySafe = args.has('--apply-safe')
const jsonOnly = args.has('--json')

if (!projectUrl || !serviceRoleKey) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const client = createClient(projectUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

const projectRef = (() => {
  try {
    const url = new URL(projectUrl)
    return url.hostname.split('.')[0] ?? ''
  } catch {
    return ''
  }
})()

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNullable(value, fallback = '') {
  return value == null ? fallback : String(value)
}

function normalizeIndex(value) {
  if (value == null) return null
  const numeric = Number(value)
  return Number.isFinite(numeric) ? numeric : null
}

function toScopeKey(row) {
  return [
    normalizeNullable(row.user_id),
    normalizeNullable(row.course_id),
    normalizeNullable(row.subtopic_id),
    normalizeText(row.subtopic_label),
    normalizeNullable(row.module_index, '-1'),
    normalizeNullable(row.subtopic_index, '-1'),
  ].join('::')
}

function toCourseKey(row) {
  return [
    normalizeNullable(row.user_id),
    normalizeNullable(row.course_id),
  ].join('::')
}

function toCourseSubtopicKey(row) {
  return [
    normalizeNullable(row.user_id),
    normalizeNullable(row.course_id),
    normalizeNullable(row.subtopic_id),
  ].join('::')
}

function groupCounts(rows, keyFn) {
  const counts = new Map()
  for (const row of rows) {
    const key = keyFn(row)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  return Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

async function fetchAll(table, columns, pageSize = 1000) {
  const rows = []
  let from = 0

  while (true) {
    const to = from + pageSize - 1
    const { data, error } = await client
      .from(table)
      .select(columns)
      .range(from, to)

    if (error) {
      throw new Error(`[${table}] ${error.code ?? 'unknown'} ${error.message}`)
    }

    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
    from += pageSize
  }

  return rows
}

async function detectOriginColumn() {
  const { error } = await client
    .from('feedback')
    .select('id, origin_jurnal_id')
    .limit(1)

  if (!error) return { exists: true, code: null }
  if (error.code === '42703') return { exists: false, code: error.code }
  throw new Error(`[feedback.origin_jurnal_id] ${error.code ?? 'unknown'} ${error.message}`)
}

async function runManagementQuery(sql, readOnly = true) {
  if (!managementToken) {
    return {
      available: false,
      reason: 'Missing SUPABASE_ACCESS_TOKEN or SUPABASE_MANAGEMENT_TOKEN',
    }
  }

  if (!projectRef) {
    return {
      available: false,
      reason: 'Unable to derive project ref from NEXT_PUBLIC_SUPABASE_URL',
    }
  }

  const response = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${managementToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: sql,
      read_only: readOnly,
    }),
  })

  const text = await response.text()
  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    parsed = text
  }

  if (!response.ok) {
    return {
      available: true,
      ok: false,
      status: response.status,
      body: parsed,
    }
  }

  return {
    available: true,
    ok: true,
    body: parsed,
  }
}

function buildMirrorCollisions(journals, feedbacks) {
  const feedbackByScope = new Map()
  for (const feedback of feedbacks) {
    const scopeKey = toScopeKey(feedback)
    const entries = feedbackByScope.get(scopeKey) ?? []
    entries.push(feedback)
    feedbackByScope.set(scopeKey, entries)
  }

  const collisions = []

  for (const journal of journals) {
    const scopeKey = toScopeKey(journal)
    const candidates = feedbackByScope.get(scopeKey) ?? []
    const journalTime = new Date(journal.created_at).getTime()
    if (!Number.isFinite(journalTime)) continue

    const matching = candidates.filter((feedback) => {
      const feedbackTime = new Date(feedback.created_at).getTime()
      if (!Number.isFinite(feedbackTime)) return false
      return Math.abs(feedbackTime - journalTime) <= 5 * 60 * 1000
    })

    if (matching.length > 1) {
      collisions.push({
        jurnalId: journal.id,
        matchingFeedbackRows: matching.length,
        scopeKey,
      })
    }
  }

  return collisions
}

function summarizePrecheck({ journals, feedbacks, transcripts, originColumn }) {
  const invalidRatings = feedbacks.filter(
    (feedback) =>
      feedback.rating != null &&
      (Number(feedback.rating) < 1 || Number(feedback.rating) > 5),
  )

  const negativeJurnalIndices = journals.filter(
    (journal) =>
      (normalizeIndex(journal.module_index) ?? 0) < 0 ||
      (normalizeIndex(journal.subtopic_index) ?? 0) < 0,
  )

  const negativeFeedbackIndices = feedbacks.filter(
    (feedback) =>
      (normalizeIndex(feedback.module_index) ?? 0) < 0 ||
      (normalizeIndex(feedback.subtopic_index) ?? 0) < 0,
  )

  const duplicateCoursePairs = groupCounts(journals, toCourseKey)
  const duplicateCourseSubtopicPairs = groupCounts(journals, toCourseSubtopicKey)
  const mirrorCollisions = buildMirrorCollisions(journals, feedbacks)

  return {
    checkedAt: new Date().toISOString(),
    projectRef,
    counts: {
      jurnalRows: journals.length,
      feedbackRows: feedbacks.length,
      transcriptRows: transcripts.length,
    },
    schema: {
      originJurnalIdExists: originColumn.exists,
    },
    quality: {
      invalidFeedbackRatings: invalidRatings.length,
      negativeJurnalIndices: negativeJurnalIndices.length,
      negativeFeedbackIndices: negativeFeedbackIndices.length,
    },
    duplicates: {
      userCoursePairs: duplicateCoursePairs,
      userCourseSubtopicPairs: duplicateCourseSubtopicPairs,
      mirrorCollisions,
    },
    safeAdditiveReady:
      invalidRatings.length === 0 &&
      negativeJurnalIndices.length === 0 &&
      negativeFeedbackIndices.length === 0,
  }
}

async function applySafeMigrations(summary) {
  if (!managementToken) {
    throw new Error(
      'Cannot apply live migrations from this workspace without SUPABASE_ACCESS_TOKEN or SUPABASE_MANAGEMENT_TOKEN.',
    )
  }

  if (!summary.safeAdditiveReady) {
    throw new Error('Precheck failed for additive constraints. Resolve invalid ratings/indices first.')
  }

  const safeFiles = [
    'docs/sql/add_feedback_rating_guardrails.sql',
    'docs/sql/align_reflection_history_model.sql',
    'docs/sql/add_feedback_origin_jurnal_link.sql',
  ]

  const results = []

  for (const relativePath of safeFiles) {
    const absolutePath = path.resolve(relativePath)
    const sql = await fs.readFile(absolutePath, 'utf8')
    const result = await runManagementQuery(sql, false)
    results.push({
      file: relativePath,
      ...result,
    })

    if (!result.available || !result.ok) {
      throw new Error(
        `Failed applying ${relativePath}: ${JSON.stringify(result.body ?? result.reason ?? result, null, 2)}`,
      )
    }
  }

  return results
}

function printHuman(summary, schemaChecks, applyResults) {
  console.log('Reflection rollout live precheck')
  console.log(`Project    : ${summary.projectRef || 'unknown'}`)
  console.log(`Checked at : ${summary.checkedAt}`)
  console.log(`Rows       : jurnal=${summary.counts.jurnalRows}, feedback=${summary.counts.feedbackRows}, transcript=${summary.counts.transcriptRows}`)
  console.log(`Schema     : origin_jurnal_id=${summary.schema.originJurnalIdExists ? 'present' : 'missing'}`)
  console.log(`Quality    : invalid_rating=${summary.quality.invalidFeedbackRatings}, jurnal_negative_index=${summary.quality.negativeJurnalIndices}, feedback_negative_index=${summary.quality.negativeFeedbackIndices}`)
  console.log(`Duplicates : user/course=${summary.duplicates.userCoursePairs.length}, user/course/subtopic=${summary.duplicates.userCourseSubtopicPairs.length}, mirror_collisions=${summary.duplicates.mirrorCollisions.length}`)
  console.log(`Safe phase : ${summary.safeAdditiveReady ? 'READY' : 'BLOCKED'}`)

  if (schemaChecks.constraints) {
    console.log('Schema API : constraints query attempted')
    console.log(JSON.stringify(schemaChecks.constraints, null, 2))
  } else if (schemaChecks.reason) {
    console.log(`Schema API : ${schemaChecks.reason}`)
  }

  if (applyResults) {
    console.log('Applied additive migrations:')
    console.log(JSON.stringify(applyResults, null, 2))
  }
}

async function main() {
  const [originColumn, journals, feedbacks, transcripts] = await Promise.all([
    detectOriginColumn(),
    fetchAll(
      'jurnal',
      'id, user_id, course_id, subtopic_id, subtopic_label, module_index, subtopic_index, created_at',
    ),
    fetchAll(
      'feedback',
      'id, user_id, course_id, subtopic_id, subtopic_label, module_index, subtopic_index, rating, comment, created_at',
    ),
    fetchAll('transcript', 'id'),
  ])

  const summary = summarizePrecheck({
    journals,
    feedbacks,
    transcripts,
    originColumn,
  })

  let schemaChecks = {
    reason: 'Management API token not available; skipped live catalog query.',
  }

  if (managementToken) {
    schemaChecks = {
      constraints: await runManagementQuery(`
select
  n.nspname as schema_name,
  t.relname as table_name,
  c.conname,
  c.contype,
  pg_get_constraintdef(c.oid) as definition
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname = 'public'
  and t.relname in ('jurnal', 'feedback', 'transcript')
order by t.relname, c.conname;
      `.trim(), true),
    }
  }

  let applyResults = null
  if (applySafe) {
    applyResults = await applySafeMigrations(summary)
  }

  if (jsonOnly) {
    console.log(
      JSON.stringify(
        {
          summary,
          schemaChecks,
          applyResults,
        },
        null,
        2,
      ),
    )
    return
  }

  printHuman(summary, schemaChecks, applyResults)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
