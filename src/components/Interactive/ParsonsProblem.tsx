'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  DndContext,
  DragEndEvent,
  DragStartEvent,
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
import type { ParsonsConfig } from '@/types/interactive-blocks';
import styles from './ParsonsProblem.module.scss';

interface ParsonsProblemProps {
  config: ParsonsConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

/** Stable item identity so dnd-kit can track items across list moves. */
interface LineItem {
  id: string;   // unique stable id
  text: string; // the line content displayed
}

/** Seeded shuffle — deterministic for the same seed value. */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  // Simple mulberry32 PRNG
  let s = seed;
  const rand = () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// ─── Draggable card ──────────────────────────────────────────────────────────

interface DraggableCardProps {
  item: LineItem;
  disabled: boolean;
  /** null = not submitted yet; true = correct position; false = wrong */
  correctness: boolean | null;
}

function DraggableCard({ item, disabled, correctness }: DraggableCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id, disabled });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const cardClass = [
    styles.card,
    isDragging ? styles.cardDragging : '',
    correctness === true ? styles.cardCorrect : '',
    correctness === false ? styles.cardWrong : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div ref={setNodeRef} style={style} className={cardClass} {...attributes} {...listeners}>
      <pre className={styles.cardCode}>
        <code>{item.text}</code>
      </pre>
    </div>
  );
}

// ─── Drop zone label ─────────────────────────────────────────────────────────

function EmptyZone({ label }: { label: string }) {
  return <div className={styles.emptyZone}>{label}</div>;
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * MVR Item 9.2 — ParsonsProblem.
 *
 * Renders a two-column drag-drop puzzle. Students drag lines from the left
 * pool into the right solution column, ordering them to reconstruct correct
 * pseudocode. Distractors (if any) remain invalid in the solution.
 *
 * Scoring: fraction of solution positions whose text matches orderedLines[pos].
 * Distractor or blank positions count as wrong.
 */
export function ParsonsProblem({
  config,
  courseId,
  subtopicId,
  leafSubtopicId,
  onSubmitted,
}: ParsonsProblemProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();

  // Build initial shuffled pool from ordered lines + distractors
  const allLines: LineItem[] = useMemo(() => {
    const combined = [
      ...config.orderedLines,
      ...(config.distractors ?? []),
    ].map((text, i) => ({ id: `line-${i}`, text }));
    return seededShuffle(combined, config.orderedLines.length);
  }, [config]);

  const [pool, setPool] = useState<LineItem[]>(allLines);
  const [solution, setSolution] = useState<LineItem[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Track which item is being dragged so we can fire block_dragged once
  const draggingItemRef = useRef<LineItem | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  // ── correctness map post-submit ──────────────────────────────────────────

  const correctnessMap: Map<string, boolean> = useMemo(() => {
    if (!submitted) return new Map();
    const map = new Map<string, boolean>();
    solution.forEach((item, pos) => {
      const expected = (config.orderedLines[pos] ?? '').trim();
      map.set(item.id, item.text.trim() === expected);
    });
    return map;
  }, [submitted, solution, config.orderedLines]);

  // ── drag handlers ────────────────────────────────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const id = event.active.id as string;
      const fromPool = pool.some((x) => x.id === id);
      const item = (fromPool ? pool : solution).find((x) => x.id === id);
      if (item) {
        draggingItemRef.current = item;
        track('block_dragged', { from_pool: fromPool, line: item.text });
      }
    },
    [pool, solution, track],
  );

  /**
   * onDragEnd handles 4 cases:
   *   1. Pool → Solution (append to solution, remove from pool)
   *   2. Solution → Pool (append to pool, remove from solution)
   *   3. Reorder within Solution
   *   4. Reorder within Pool (no-op but harmless)
   */
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const inPool = (id: string) => pool.some((x) => x.id === id);
      const inSol = (id: string) => solution.some((x) => x.id === id);

      const fromPool = inPool(activeId);
      const toPool = inPool(overId) || overId === 'pool-drop';
      const toSol = inSol(overId) || overId === 'solution-drop';

      // Case 1: Pool → Solution
      if (fromPool && toSol) {
        const item = pool.find((x) => x.id === activeId)!;
        const overIdx = solution.findIndex((x) => x.id === overId);
        const insertAt = overIdx === -1 ? solution.length : overIdx;
        const newSol = [...solution];
        newSol.splice(insertAt, 0, item);
        setSolution(newSol);
        setPool((p) => p.filter((x) => x.id !== activeId));
        track('block_dropped', { to: 'solution', position: insertAt, line: item.text });
        return;
      }

      // Case 2: Solution → Pool
      if (inSol(activeId) && toPool) {
        const item = solution.find((x) => x.id === activeId)!;
        setPool((p) => [...p, item]);
        setSolution((s) => s.filter((x) => x.id !== activeId));
        track('block_dropped', {
          to: 'pool',
          position: pool.length,
          line: item.text,
        });
        return;
      }

      // Case 3: Reorder within Solution
      if (inSol(activeId) && inSol(overId)) {
        const oldIdx = solution.findIndex((x) => x.id === activeId);
        const newIdx = solution.findIndex((x) => x.id === overId);
        const reordered = arrayMove(solution, oldIdx, newIdx);
        setSolution(reordered);
        track('order_changed', { new_order: reordered.map((x) => x.text) });
        return;
      }

      // Case 4: Reorder within Pool — allowed but no research event needed
      if (fromPool && toPool && activeId !== overId) {
        const oldIdx = pool.findIndex((x) => x.id === activeId);
        const newIdx = pool.findIndex((x) => x.id === overId);
        setPool((p) => arrayMove(p, oldIdx, newIdx));
      }
    },
    [pool, solution, track],
  );

  // ── submit ───────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (solution.length === 0) return;
    setSubmitting(true);
    setSubmitError('');

    let correctPositions = 0;
    solution.forEach((item, pos) => {
      const expected = (config.orderedLines[pos] ?? '').trim();
      if (item.text.trim() === expected) correctPositions++;
    });
    const total = config.orderedLines.length;
    const finalScore = total > 0 ? Math.min(1, correctPositions / total) : 0;

    track('submitted', { correct_positions: correctPositions, total, score: finalScore });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'parsons',
          artifactTitle: 'ParsonsProblem submission',
          artifactContent: JSON.stringify({
            finalOrder: solution.map((x) => x.text),
            score: finalScore,
          }),
          interactionEvents: getEvents(),
          completionStatus: 'submitted',
          componentScore: Number(finalScore.toFixed(2)),
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

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <div className={styles.columns}>
          {/* Left — pool */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Baris tersedia</div>
            <SortableContext
              id="pool"
              items={pool.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className={styles.dropZone} data-droppable-id="pool-drop">
                {pool.length === 0 ? (
                  <EmptyZone label="Semua baris telah dipindahkan" />
                ) : (
                  pool.map((item) => (
                    <DraggableCard
                      key={item.id}
                      item={item}
                      disabled={submitted}
                      correctness={null}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>

          {/* Right — solution */}
          <div className={styles.column}>
            <div className={styles.columnHeader}>Susunan solusi</div>
            <SortableContext
              id="solution"
              items={solution.map((x) => x.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className={styles.dropZone} data-droppable-id="solution-drop">
                {solution.length === 0 ? (
                  <EmptyZone label="Tarik baris ke sini" />
                ) : (
                  solution.map((item) => (
                    <DraggableCard
                      key={item.id}
                      item={item}
                      disabled={submitted}
                      correctness={submitted ? (correctnessMap.get(item.id) ?? false) : null}
                    />
                  ))
                )}
              </div>
            </SortableContext>
          </div>
        </div>
      </DndContext>

      <div className={styles.footer}>
        <span className={styles.eventBadge}>{eventCount} aksi tercatat</span>
        {submitted && score !== null && (
          <span className={styles.scoreBadge}>Skor: {Math.round(score * 100)}%</span>
        )}
        {submitError && <span className={styles.error}>{submitError}</span>}
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || submitted || solution.length === 0}
        >
          {submitting ? 'Mengirim...' : submitted ? 'Tersimpan' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
