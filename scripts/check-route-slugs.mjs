#!/usr/bin/env node
// Detect Next.js dynamic route slug-name conflicts.
//
// Catches the class of bug that produced INTERNAL_FUNCTION_INVOCATION_TIMEOUT
// on 2026-05-16 when /api/courses/[id]/route.ts and
// /api/courses/[courseId]/unlock-status/route.ts coexisted under the same
// parent path with different slug names. Next.js refuses to bundle such a
// routing tree, but the error surfaces only at deploy time on Vercel — not
// during `next build` locally if the conflict spans separately-rendered
// route segments. This linter scans the filesystem directly so the check
// runs in <100ms with no build step.
//
// Usage: node scripts/check-route-slugs.mjs
// Exit code: 0 if clean, 1 if any conflict found.

import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const APP_ROOT = join(process.cwd(), 'src', 'app');

const DYNAMIC_SEGMENT_RE = /^\[(\.\.\.)?([^\]]+)\]$/;

function isDynamicSegment(name) {
  return DYNAMIC_SEGMENT_RE.test(name);
}

function extractSlugName(folderName) {
  const m = folderName.match(DYNAMIC_SEGMENT_RE);
  return m ? m[2] : null;
}

// Walks the directory tree and records every (parentPath -> Set<slugName>) pair.
// Conflict = parent has more than one distinct slug name among its direct
// dynamic children.
function walk(dir, slugsByParent) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }

  const directDynamicSlugs = new Map(); // slug -> folder name (e.g. "courseId" -> "[courseId]")
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    let st;
    try {
      st = statSync(fullPath);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;

    if (isDynamicSegment(entry)) {
      const slug = extractSlugName(entry);
      if (slug) {
        const existing = directDynamicSlugs.get(slug);
        if (!existing) directDynamicSlugs.set(slug, entry);
      }
    }

    walk(fullPath, slugsByParent);
  }

  if (directDynamicSlugs.size > 0) {
    slugsByParent.set(relative(APP_ROOT, dir) || '.', directDynamicSlugs);
  }
}

const slugsByParent = new Map();
walk(APP_ROOT, slugsByParent);

const conflicts = [];
for (const [parent, slugs] of slugsByParent) {
  if (slugs.size > 1) {
    conflicts.push({
      parent,
      slugs: Array.from(slugs.entries()).map(([slug, folder]) => ({ slug, folder })),
    });
  }
}

if (conflicts.length === 0) {
  console.log('OK — no dynamic route slug-name conflicts found.');
  process.exit(0);
}

console.error('ERROR — dynamic route slug-name conflicts detected:\n');
for (const c of conflicts) {
  console.error(`  Parent: src/app/${c.parent}`);
  for (const { slug, folder } of c.slugs) {
    console.error(`    - ${folder}  (slug: "${slug}")`);
  }
  console.error('');
}
console.error('Next.js refuses to bundle a route tree with sibling dynamic segments using different slug names.');
console.error('Rename one folder so both siblings use the same slug name.\n');
process.exit(1);
