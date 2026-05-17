#!/usr/bin/env node
// Production smoke test — hit a handful of critical endpoints and assert
// they respond within a reasonable budget. Run AFTER each push to main once
// the Vercel deploy is READY.
//
// Usage:
//   node scripts/smoke-test-prod.mjs
//   node scripts/smoke-test-prod.mjs --base=https://principle-learn-v3.vercel.app
//
// Exits 0 if all checks pass, 1 if any check fails. Designed to be cheap
// (~5s total) so it can run unattended.

const args = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.split('=');
    return [k.replace(/^--/, ''), v ?? true];
  })
);

const BASE = args.base || 'https://principle-learn-v3.vercel.app';

// Each check: { path, method, expectedStatus, maxMs, requireBody? }
// Endpoints picked because they exercise (a) edge cache, (b) Lambda init,
// (c) middleware auth refusal, (d) page SSR. If any of these hangs, the
// underlying class of bug is the same as the 2026-05-16 outage.
const CHECKS = [
  { path: '/api/health', method: 'GET', expectedStatus: 200, maxMs: 5000, requireBody: 'ok' },
  { path: '/api/auth/me', method: 'GET', expectedStatus: 401, maxMs: 5000 },
  { path: '/', method: 'GET', expectedStatus: 200, maxMs: 10000 },
  { path: '/login', method: 'GET', expectedStatus: 200, maxMs: 10000 },
];

function check(endpoint) {
  const url = `${BASE}${endpoint.path}`;
  const start = Date.now();
  return fetch(url, { method: endpoint.method, redirect: 'manual' })
    .then(async (res) => {
      const elapsed = Date.now() - start;
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {
        // ignore — some responses have no body
      }
      return { endpoint, elapsed, status: res.status, bodyText };
    })
    .catch((err) => ({ endpoint, elapsed: Date.now() - start, status: 0, error: err.message }));
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  const results = await Promise.all(CHECKS.map(check));
  let allOk = true;
  for (const r of results) {
    const tag = `${r.endpoint.method} ${r.endpoint.path}`;
    if (r.error) {
      console.error(`  FAIL  ${tag} — ${r.error} (${r.elapsed}ms)`);
      allOk = false;
      continue;
    }
    const statusOk = r.status === r.endpoint.expectedStatus;
    const timeOk = r.elapsed <= r.endpoint.maxMs;
    const bodyOk = !r.endpoint.requireBody || r.bodyText.includes(r.endpoint.requireBody);
    if (statusOk && timeOk && bodyOk) {
      console.log(`  OK    ${tag} — HTTP ${r.status} in ${r.elapsed}ms`);
    } else {
      const reasons = [];
      if (!statusOk) reasons.push(`status ${r.status} (want ${r.endpoint.expectedStatus})`);
      if (!timeOk) reasons.push(`${r.elapsed}ms > ${r.endpoint.maxMs}ms`);
      if (!bodyOk) reasons.push(`body missing "${r.endpoint.requireBody}"`);
      console.error(`  FAIL  ${tag} — ${reasons.join(', ')}`);
      allOk = false;
    }
  }
  console.log('');
  process.exit(allOk ? 0 : 1);
}

main();
