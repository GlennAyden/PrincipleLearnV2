'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import styles from './page.module.scss';

type Stage = 'SCP' | 'SRP' | 'MQP' | 'REFLECTIVE';

const STAGES: Array<{ value: Stage; label: string; tooltip: string }> = [
  { value: 'SCP', label: 'SCP', tooltip: 'Simple Clarification Prompt — pertanyaan tunggal, minim konteks' },
  { value: 'SRP', label: 'SRP', tooltip: 'Structured Reformulation Prompt — satu fokus dengan konteks' },
  { value: 'MQP', label: 'MQP', tooltip: 'Multi-Question Prompt — berlapis, beberapa sub-pertanyaan' },
  { value: 'REFLECTIVE', label: 'Reflektif', tooltip: 'Evaluatif, membandingkan alternatif, justifikasi' },
];

const CT_DIMS = [
  { key: 'ct_decomposition',          label: 'CT — Decomposition' },
  { key: 'ct_pattern_recognition',    label: 'CT — Pattern Recognition' },
  { key: 'ct_abstraction',            label: 'CT — Abstraction' },
  { key: 'ct_algorithm_design',       label: 'CT — Algorithm Design' },
  { key: 'ct_evaluation_debugging',   label: 'CT — Evaluation & Debugging' },
  { key: 'ct_generalization',         label: 'CT — Generalization' },
] as const;

const CTH_DIMS = [
  { key: 'cth_interpretation',  label: 'CrT — Interpretation' },
  { key: 'cth_analysis',        label: 'CrT — Analysis' },
  { key: 'cth_evaluation',      label: 'CrT — Evaluation' },
  { key: 'cth_inference',       label: 'CrT — Inference' },
  { key: 'cth_explanation',     label: 'CrT — Explanation' },
  { key: 'cth_self_regulation', label: 'CrT — Self-Regulation' },
] as const;

const ALL_DIMS = [...CT_DIMS, ...CTH_DIMS];
type DimKey = (typeof ALL_DIMS)[number]['key'];

interface SampleItem {
  promptClassificationId: string;
  promptId: string;
  promptSource: string;
  promptText: string;
  aiResponse: string | null;
  currentStage: Stage;
  currentScores: Partial<Record<DimKey, number>>;
  courseId: string;
  userId: string;
  classifiedBy: string;
  createdAt: string;
}

interface SamplePayload {
  generatedAt: string;
  seed?: number;
  totalUniverse: number;
  totalSample: number;
  perStage: Record<string, number>;
  items: SampleItem[];
}

function makeEmptyScores(): Record<DimKey, 0 | 1 | 2> {
  const o = {} as Record<DimKey, 0 | 1 | 2>;
  for (const d of ALL_DIMS) o[d.key] = 0;
  return o;
}

export default function AdminIrrPage() {
  const [payload, setPayload] = useState<SamplePayload | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [stage, setStage] = useState<Stage | ''>('');
  const [scores, setScores] = useState<Record<DimKey, 0 | 1 | 2>>(makeEmptyScores);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submittedIds, setSubmittedIds] = useState<Set<string>>(new Set());

  const items = payload?.items ?? [];
  const selected = useMemo(
    () => items.find((i) => i.promptClassificationId === selectedId) ?? null,
    [items, selectedId],
  );

  const fetchSample = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch('/api/admin/research/irr/sample');
      const json = (await res.json()) as { payload?: SamplePayload; file?: string; error?: string };
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setPayload(json.payload ?? null);
      setFileName(json.file ?? null);
      if (json.payload && json.payload.items.length > 0 && !selectedId) {
        setSelectedId(json.payload.items[0].promptClassificationId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat sampel IRR.');
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    fetchSample();
  }, [fetchSample]);

  // Reset form when selection changes.
  useEffect(() => {
    setStage('');
    setScores(makeEmptyScores());
    setNotes('');
  }, [selectedId]);

  const handleSubmit = async () => {
    if (!selected || !stage) {
      alert('Pilih stage terlebih dahulu.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiFetch('/api/admin/research/irr/submit', {
        method: 'POST',
        body: JSON.stringify({
          promptClassificationId: selected.promptClassificationId,
          stage,
          scores,
          notes: notes.trim() || undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      const newSet = new Set(submittedIds);
      newSet.add(selected.promptClassificationId);
      setSubmittedIds(newSet);
      // Move to next unsubmitted item if available.
      const idx = items.findIndex((i) => i.promptClassificationId === selected.promptClassificationId);
      const next = items.slice(idx + 1).find((i) => !newSet.has(i.promptClassificationId));
      if (next) setSelectedId(next.promptClassificationId);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Submit gagal.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>IRR Rater — Coding Sampel 25%</h1>
          <p className={styles.subtitle}>
            Rater kedua mengklasifikasikan ulang sampel acak Mode Penelitian untuk inter-rater reliability (MVR Item 8d).
            Codebook: <code>docs/thesis/CODEBOOK_RM2_RM3.md</code>.
          </p>
        </div>
        {fileName && (
          <div className={styles.fileBadge}>
            <span>Sampel:</span> <code>{fileName}</code>
          </div>
        )}
      </header>

      {error && <div className={styles.error}>{error}</div>}

      {payload && (
        <div className={styles.summary}>
          <span>Total sampel: <strong>{payload.totalSample}</strong> dari {payload.totalUniverse}</span>
          {Object.entries(payload.perStage).map(([s, n]) => (
            <span key={s} className={styles.summaryPill}>{s}: {n}</span>
          ))}
          <span className={styles.summaryProgress}>
            Tersubmit: <strong>{submittedIds.size}</strong> / {payload.totalSample}
          </span>
        </div>
      )}

      <div className={styles.layout}>
        <aside className={styles.queue}>
          <div className={styles.queueHeader}>
            {loading ? 'Memuat...' : `${items.length} item`}
          </div>
          {items.length === 0 && !loading && (
            <div className={styles.empty}>Belum ada sampel. Jalankan <code>node scripts/irr-sample.mjs</code> dulu.</div>
          )}
          <ul>
            {items.map((it, idx) => {
              const isActive = it.promptClassificationId === selectedId;
              const done = submittedIds.has(it.promptClassificationId);
              const label = `S${String(idx + 1).padStart(3, '0')}`;
              const preview = (it.promptText || '').slice(0, 60).replace(/\s+/g, ' ');
              return (
                <li
                  key={it.promptClassificationId}
                  className={isActive ? styles.queueItemActive : styles.queueItem}
                  onClick={() => setSelectedId(it.promptClassificationId)}
                >
                  <div className={styles.queueLeaf}>
                    {done && <span className={styles.doneCheck}>✓</span>}
                    <span>{label} {it.currentStage}</span>
                  </div>
                  <div className={styles.queuePreview}>{preview || '(prompt kosong)'}</div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detail}>
          {!selected ? (
            <div className={styles.empty}>Pilih satu item dari daftar di kiri.</div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>
                  Sumber: {selected.promptSource} · Stage primer: <span className={styles.primaryStage}>{selected.currentStage}</span>
                </h2>
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Prompt siswa</span>
                <div className={styles.readonly}>{selected.promptText || '(kosong)'}</div>
              </div>

              {selected.aiResponse && (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>Respons AI / siswa</span>
                  <div className={styles.readonly}>{selected.aiResponse}</div>
                </div>
              )}

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Stage (pilih satu)</span>
                <div className={styles.radioRow}>
                  {STAGES.map((s) => (
                    <label key={s.value} className={styles.radioLabel} title={s.tooltip}>
                      <input
                        type="radio"
                        name="stage"
                        value={s.value}
                        checked={stage === s.value}
                        onChange={() => setStage(s.value)}
                      />
                      <span>{s.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.scoresGrid}>
                {ALL_DIMS.map((d) => (
                  <label key={d.key} className={styles.scoreField} title="0 = tidak ada; 1 = lemah/sebagian; 2 = jelas/eksplisit">
                    <span>{d.label}</span>
                    <input
                      type="number"
                      min={0}
                      max={2}
                      step={1}
                      value={scores[d.key]}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        const clamped = Math.max(0, Math.min(2, Math.round(raw)));
                        setScores({ ...scores, [d.key]: clamped as 0 | 1 | 2 });
                      }}
                    />
                  </label>
                ))}
              </div>

              <div className={styles.field}>
                <span className={styles.fieldLabel}>Catatan rater (opsional)</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Mis. 'Ragu antara MQP dan Reflektif karena ada perbandingan tapi tidak ada justifikasi eksplisit.'"
                />
              </div>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnSubmit}
                  disabled={submitting || !stage || submittedIds.has(selected.promptClassificationId)}
                  onClick={handleSubmit}
                >
                  {submittedIds.has(selected.promptClassificationId)
                    ? '✓ Sudah Disubmit'
                    : submitting
                      ? 'Mengirim...'
                      : 'Submit Skor'}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
