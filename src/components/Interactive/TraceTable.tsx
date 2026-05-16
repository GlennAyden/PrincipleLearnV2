'use client';

import { useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useInteractionTracking } from '@/hooks/useInteractionTracking';
import type { TraceTableConfig } from '@/types/interactive-blocks';
import styles from './TraceTable.module.scss';

interface TraceTableProps {
  config: TraceTableConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

/**
 * MVR Item 9.2 — TraceTable.
 *
 * Render the pseudocode + an editable table where the student fills in each
 * column at every step. Cells are validated against config.expectedRows on
 * submit; score is the fraction of cells correct on first try.
 */
export function TraceTable({ config, courseId, subtopicId, leafSubtopicId, onSubmitted }: TraceTableProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();
  const [values, setValues] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const totalCells = config.expectedRows.length * config.columns.length;

  const handleCellChange = (rowIdx: number, colKey: string, value: string) => {
    const key = `${rowIdx}::${colKey}`;
    setValues((prev) => ({ ...prev, [key]: value }));
    track('cell_changed', { row: rowIdx, column: colKey, value });
  };

  const evaluate = (): { correctCount: number; rowCellResults: Array<Record<string, boolean>> } => {
    let correctCount = 0;
    const rowCellResults = config.expectedRows.map((row, rIdx) => {
      const res: Record<string, boolean> = {};
      for (const col of config.columns) {
        const expected = (row.values[col.key] ?? '').trim();
        const actual = (values[`${rIdx}::${col.key}`] ?? '').trim();
        const ok = actual.length > 0 && actual === expected;
        res[col.key] = ok;
        if (ok) correctCount += 1;
      }
      return res;
    });
    return { correctCount, rowCellResults };
  };

  const cellResults = useMemo(() => evaluate().rowCellResults, [values, config]);

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const { correctCount } = evaluate();
    const finalScore = totalCells > 0 ? correctCount / totalCells : 0;
    track('submitted', { correct_count: correctCount, total_cells: totalCells, score: finalScore });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'trace_table',
          artifactTitle: 'TraceTable submission',
          artifactContent: JSON.stringify({ values, score: finalScore }),
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

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      {config.pseudocode && (
        <pre className={styles.code}>{config.pseudocode}</pre>
      )}

      <table className={styles.table}>
        <thead>
          <tr>
            <th>{config.rowLabelPrefix ?? 'Langkah'}</th>
            {config.columns.map((col) => (
              <th key={col.key}>{col.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {config.expectedRows.map((_, rIdx) => (
            <tr key={rIdx}>
              <td className={styles.rowLabel}>{rIdx + 1}</td>
              {config.columns.map((col) => {
                const cellKey = `${rIdx}::${col.key}`;
                const isOk = submitted && cellResults[rIdx]?.[col.key];
                const isErr = submitted && cellResults[rIdx]?.[col.key] === false;
                return (
                  <td key={col.key} className={isOk ? styles.cellOk : isErr ? styles.cellErr : ''}>
                    <input
                      type="text"
                      className={styles.cellInput}
                      disabled={submitted}
                      value={values[cellKey] ?? ''}
                      onChange={(e) => handleCellChange(rIdx, col.key, e.target.value)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

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
          disabled={submitting || submitted}
        >
          {submitting ? 'Mengirim...' : submitted ? 'Tersimpan' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
