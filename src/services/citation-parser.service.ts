/**
 * MVR Item 4 — extract `[c{uuid}]` citation markers from an AI response and
 * deduplicate them. The Sokratik prompt instructs the AI to insert exactly
 * this format after each factual claim, so the regex is tight: opening `[c`,
 * a UUID v4-ish pattern, closing `]`.
 *
 * Returns the array of UUIDs in the order they first appeared in the answer.
 * Order matters for analyzing which chunk the AI leaned on first.
 */

const CITATION_RE = /\[c([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/gi;

export function parseCitations(answer: string): string[] {
  if (!answer) return [];
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of answer.matchAll(CITATION_RE)) {
    const id = match[1].toLowerCase();
    if (!seen.has(id)) {
      seen.add(id);
      ordered.push(id);
    }
  }
  return ordered;
}
