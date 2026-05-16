'use client';

import { useCallback, useMemo, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '@/lib/api-client';
import { useInteractionTracking } from '@/hooks/useInteractionTracking';
import type { BlockBuilderConfig } from '@/types/interactive-blocks';
import styles from './PseudocodeBlockBuilder.module.scss';

interface PseudocodeBlockBuilderProps {
  config: BlockBuilderConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

// ─── Item in the workspace ───────────────────────────────────────────────────

interface WorkspaceItem {
  id: string;   // stable unique id
  token: string;
}

// ─── Auto-indent logic ───────────────────────────────────────────────────────

const INDENT_OPENERS = /^(IF\b|WHILE\b|FOR\b|ELSE\b)/i;
const INDENT_CLOSERS = /^(ENDIF\b|ENDWHILE\b|ENDFOR\b|ELSE\b)/i;

/**
 * Produce pseudocode string with 2-space auto-indent per nesting level.
 * - ELSE de-dents before itself then re-dents after.
 * - ENDIF / ENDWHILE / ENDFOR de-dent before themselves.
 */
function buildPreview(tokens: string[]): string {
  let level = 0;
  const lines: string[] = [];
  for (const token of tokens) {
    if (INDENT_CLOSERS.test(token)) {
      level = Math.max(0, level - 1);
    }
    lines.push('  '.repeat(level) + token);
    if (INDENT_OPENERS.test(token) && !INDENT_CLOSERS.test(token)) {
      level += 1;
    }
    // ELSE: already decremented; now increment for the body inside else
    if (/^ELSE$/i.test(token)) {
      level += 1;
    }
  }
  return lines.join('\n');
}

// ─── Syntax validation ───────────────────────────────────────────────────────

interface SyntaxError {
  message: string;
}

function validateSyntax(tokens: string[]): SyntaxError[] {
  const errors: SyntaxError[] = [];
  const openStack: string[] = [];

  for (const token of tokens) {
    const upper = token.trim().toUpperCase();
    if (upper.startsWith('IF')) openStack.push('IF');
    else if (upper.startsWith('WHILE')) openStack.push('WHILE');
    else if (upper.startsWith('FOR')) openStack.push('FOR');
    else if (upper === 'ENDIF') {
      if (openStack.at(-1) === 'IF') openStack.pop();
      else errors.push({ message: 'ENDIF tanpa IF yang cocok' });
    } else if (upper === 'ENDWHILE') {
      if (openStack.at(-1) === 'WHILE') openStack.pop();
      else errors.push({ message: 'ENDWHILE tanpa WHILE yang cocok' });
    } else if (upper === 'ENDFOR') {
      if (openStack.at(-1) === 'FOR') openStack.pop();
      else errors.push({ message: 'ENDFOR tanpa FOR yang cocok' });
    }
  }

  for (const open of openStack) {
    errors.push({ message: `${open} tidak ditutup (missing END${open})` });
  }

  return errors;
}

// ─── Sortable item ────────────────────────────────────────────────────────────

interface SortableTokenProps {
  item: WorkspaceItem;
  disabled: boolean;
  onRemove: (id: string) => void;
}

function SortableToken({ item, disabled, onRemove }: SortableTokenProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={[styles.token, isDragging ? styles.tokenDragging : ''].filter(Boolean).join(' ')}
      {...attributes}
      {...listeners}
    >
      <span className={styles.tokenGrip} aria-hidden>⠿</span>
      <code className={styles.tokenCode}>{item.token}</code>
      {!disabled && (
        <button
          type="button"
          className={styles.tokenDelete}
          onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
          aria-label={`Hapus token ${item.token}`}
          // Prevent dnd-kit from activating drag on button click
          onPointerDown={(e) => e.stopPropagation()}
        >
          ×
        </button>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * MVR Item 9.3 — PseudocodeBlockBuilder.
 *
 * Students assemble pseudocode from a token palette. Tokens are added to a
 * sortable workspace, can be reordered via dnd-kit, and deleted. A live preview
 * shows auto-indented pseudocode. On submit, syntax (bracket matching) and
 * semantic (token order) correctness are scored.
 */
export function PseudocodeBlockBuilder({
  config,
  courseId,
  subtopicId,
  leafSubtopicId,
  onSubmitted,
}: PseudocodeBlockBuilderProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();

  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const itemCounter = { current: 0 };
  // We use a ref-like approach via a closure variable for stable ids
  const nextId = (() => {
    let counter = 0;
    return () => `blk-${Date.now()}-${++counter}`;
  })();
  // Stable id generator stored in state doesn't cause re-renders; use a simple counter ref pattern
  const [idSeed] = useState({ n: 0 });
  void itemCounter; // suppress unused

  const makeId = () => {
    idSeed.n += 1;
    return `blk-${idSeed.n}`;
  };
  void nextId; // suppress

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── Derived state ──────────────────────────────────────────────────────────

  const tokens = items.map((i) => i.token);

  const syntaxErrors = useMemo(() => validateSyntax(tokens), [tokens]);
  const syntaxValid = syntaxErrors.length === 0;

  const preview = useMemo(() => buildPreview(tokens), [tokens]);

  // Semantic: order match
  const semanticCorrect = useMemo(() => {
    const norm = (s: string) => s.trim().toLowerCase();
    if (tokens.length !== config.expectedTokens.length) return false;
    return tokens.every((t, i) => norm(t) === norm(config.expectedTokens[i]));
  }, [tokens, config.expectedTokens]);

  const matchedTokenRatio = useMemo(() => {
    if (config.expectedTokens.length === 0) return 0;
    const norm = (s: string) => s.trim().toLowerCase();
    let matched = 0;
    const minLen = Math.min(tokens.length, config.expectedTokens.length);
    for (let i = 0; i < minLen; i++) {
      if (norm(tokens[i]) === norm(config.expectedTokens[i])) matched++;
    }
    return matched / config.expectedTokens.length;
  }, [tokens, config.expectedTokens]);

  // ── Actions ────────────────────────────────────────────────────────────────

  const addToken = (token: string) => {
    if (submitted) return;
    const newItem: WorkspaceItem = { id: makeId(), token };
    setItems((prev) => [...prev, newItem]);
    track('block_added', { token });
  };

  const removeItem = useCallback(
    (id: string) => {
      const item = items.find((i) => i.id === id);
      setItems((prev) => prev.filter((i) => i.id !== id));
      if (item) track('block_removed', { token: item.token });
    },
    [items, track],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setItems((prev) => {
        const oldIdx = prev.findIndex((i) => i.id === active.id);
        const newIdx = prev.findIndex((i) => i.id === over.id);
        const reordered = arrayMove(prev, oldIdx, newIdx);
        track('block_reordered', { newOrder: reordered.map((i) => i.token) });
        return reordered;
      });
    },
    [track],
  );

  // ── Submit ─────────────────────────────────────────────────────────────────

  const computeScore = (): number => {
    const syntaxPart = syntaxValid ? 0.4 : 0;
    const semanticPart = semanticCorrect ? 0.6 : matchedTokenRatio * 0.6;
    return Number((syntaxPart + semanticPart).toFixed(2));
  };

  const handleSubmit = async () => {
    if (items.length === 0) return;
    setSubmitting(true);
    setSubmitError('');

    if (syntaxErrors.length > 0) {
      for (const err of syntaxErrors) {
        track('validation_error', { message: err.message });
      }
    }

    const finalScore = computeScore();
    track('submitted', { finalScore, tokenCount: items.length });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'block_builder',
          artifactTitle: 'PseudocodeBlockBuilder submission',
          artifactContent: JSON.stringify({
            studentTokens: tokens,
            expectedTokens: config.expectedTokens,
            syntaxValid,
            semanticCorrect,
            score: finalScore,
          }),
          interactionEvents: getEvents(),
          completionStatus: 'submitted',
          componentScore: finalScore,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitted(true);
      setScore(finalScore);
      onSubmitted?.(json.artifactId ?? null, finalScore);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal submit.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      <div className={styles.layout}>
        {/* Palette */}
        <div className={styles.palette} role="toolbar" aria-label="Palette token pseudocode">
          <div className={styles.paletteHeader}>Token</div>
          {config.palette.map((token) => (
            <button
              key={token}
              type="button"
              className={styles.paletteBtn}
              onClick={() => addToken(token)}
              disabled={submitted}
              aria-label={`Tambah token ${token}`}
            >
              {token}
            </button>
          ))}
        </div>

        {/* Workspace */}
        <div className={styles.workspaceWrap}>
          <div className={styles.workspaceHeader}>
            Susun Pseudocode
            {items.length > 0 && (
              <span className={styles.tokenCount}>{items.length} token</span>
            )}
          </div>

          <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
            <SortableContext
              items={items.map((i) => i.id)}
              strategy={verticalListSortingStrategy}
            >
              <div
                className={styles.workspace}
                aria-label="Area susun token"
                aria-live="polite"
              >
                {items.length === 0 ? (
                  <div className={styles.emptyHint}>
                    Klik token di kiri untuk mulai menyusun pseudocode
                  </div>
                ) : (
                  items.map((item) => (
                    <SortableToken
                      key={item.id}
                      item={item}
                      disabled={submitted}
                      onRemove={removeItem}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </DndContext>

          {/* Syntax errors (live) */}
          {!submitted && syntaxErrors.length > 0 && items.length > 0 && (
            <div className={styles.syntaxErrors} role="alert" aria-label="Peringatan syntax">
              {syntaxErrors.map((err, i) => (
                <div key={i} className={styles.syntaxError}>
                  <span aria-hidden>!</span> {err.message}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Preview */}
      {items.length > 0 && (
        <div className={styles.previewWrap}>
          <div className={styles.previewHeader}>Preview</div>
          <pre className={styles.preview} aria-label="Preview pseudocode">{preview}</pre>
        </div>
      )}

      {/* Post-submit reveal */}
      {submitted && score !== null && (
        <div className={score >= 0.9 ? styles.successBox : styles.revealBox}>
          {semanticCorrect
            ? 'Urutan token sudah benar!'
            : (
              <>
                <div className={styles.revealLabel}>Urutan yang benar:</div>
                <pre className={styles.revealCode}>{config.expectedTokens.join('\n')}</pre>
              </>
            )}
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.eventBadge}>{eventCount} aksi tercatat</span>
        {!submitted && items.length > 0 && (
          <span className={syntaxValid ? styles.syntaxOk : styles.syntaxWarn}>
            {syntaxValid ? 'Syntax OK' : `${syntaxErrors.length} peringatan`}
          </span>
        )}
        {submitted && score !== null && (
          <span className={styles.scoreBadge}>Skor: {Math.round(score * 100)}%</span>
        )}
        {submitError && <span className={styles.error}>{submitError}</span>}
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || submitted || items.length === 0}
          aria-label="Submit pseudocode"
        >
          {submitting ? 'Mengirim...' : submitted ? 'Tersimpan' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
