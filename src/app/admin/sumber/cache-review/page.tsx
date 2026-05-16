'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import styles from './page.module.scss';

type QaStatus = 'pending' | 'approved' | 'needs_revision' | 'rejected';

interface CacheRow {
  id: string;
  cache_key: string;
  content: { markdown?: string } | null;
  mode: string;
  locked: boolean;
  qa_status: QaStatus;
  qa_notes: string | null;
  source_chunk_ids: string[];
  generation_seed: string | null;
  generated_by: string | null;
  qa_reviewed_by: string | null;
  qa_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

const STATUS_LABELS: Record<QaStatus, string> = {
  pending: 'Menunggu Review',
  approved: 'Disetujui',
  needs_revision: 'Perlu Revisi',
  rejected: 'Ditolak',
};

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '',                label: 'Pending + Needs Revision' },
  { value: 'pending',         label: 'Pending saja' },
  { value: 'approved',        label: 'Sudah disetujui' },
  { value: 'needs_revision',  label: 'Perlu revisi' },
  { value: 'rejected',        label: 'Ditolak' },
];

export default function AdminCacheReviewPage() {
  const [rows, setRows] = useState<CacheRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editedMarkdown, setEditedMarkdown] = useState('');
  const [qaNotes, setQaNotes] = useState('');
  const [actionInFlight, setActionInFlight] = useState(false);

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const fetchRows = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await apiFetch(`/api/admin/sumber/cache-review?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { rows?: CacheRow[] };
      setRows(json.rows ?? []);
      // Auto-select first row when nothing selected.
      if (!selectedId && (json.rows ?? []).length > 0) {
        setSelectedId(json.rows![0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat queue review.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, selectedId]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  useEffect(() => {
    if (selected) {
      setEditedMarkdown(selected.content?.markdown ?? '');
      setQaNotes(selected.qa_notes ?? '');
    } else {
      setEditedMarkdown('');
      setQaNotes('');
    }
  }, [selected]);

  const performAction = async (
    action: 'approve' | 'request_revision' | 'reject' | 'edit',
    payload?: Record<string, unknown>,
  ) => {
    if (!selected) return;
    setActionInFlight(true);
    try {
      const res = await apiFetch(`/api/admin/sumber/cache-review/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      await fetchRows();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aksi gagal');
    } finally {
      setActionInFlight(false);
    }
  };

  const cacheKeyParts = (key: string) => {
    const parts = key.split('::');
    return {
      courseId: parts[0] ?? '',
      moduleTitle: parts[1] ?? '',
      leafTitle: parts[2] ?? '',
    };
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Review Cache Materi Riset</h1>
          <p className={styles.subtitle}>
            Konten subtopik Mode Penelitian yang menunggu validasi peneliti sebelum dirilis ke semua siswa (MVR Item 4b).
          </p>
        </div>
        <select
          className={styles.filter}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
      </header>

      {error && <div className={styles.error}>{error}</div>}

      <div className={styles.layout}>
        <aside className={styles.queue}>
          <div className={styles.queueHeader}>
            {loading ? 'Memuat...' : `${rows.length} antrian`}
          </div>
          {rows.length === 0 && !loading && (
            <div className={styles.empty}>Tidak ada konten yang menunggu review.</div>
          )}
          <ul>
            {rows.map((r) => {
              const parts = cacheKeyParts(r.cache_key);
              const isActive = r.id === selectedId;
              return (
                <li
                  key={r.id}
                  className={isActive ? styles.queueItemActive : styles.queueItem}
                  onClick={() => setSelectedId(r.id)}
                >
                  <div className={styles.queueLeaf}>{parts.leafTitle || r.cache_key}</div>
                  <div className={styles.queueMeta}>
                    <span className={`${styles.statusPill} ${styles[`status_${r.qa_status}`]}`}>
                      {STATUS_LABELS[r.qa_status]}
                    </span>
                    <span className={styles.queueDate}>
                      {new Date(r.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className={styles.detail}>
          {!selected ? (
            <div className={styles.empty}>Pilih satu entri di antrian kiri.</div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <h2 className={styles.detailTitle}>
                  {cacheKeyParts(selected.cache_key).leafTitle || selected.cache_key}
                </h2>
                <span className={`${styles.statusPill} ${styles[`status_${selected.qa_status}`]}`}>
                  {STATUS_LABELS[selected.qa_status]}
                </span>
              </div>

              <div className={styles.meta}>
                <div><strong>Cache key:</strong> <code>{selected.cache_key}</code></div>
                <div><strong>Source chunks:</strong> {selected.source_chunk_ids.length}</div>
                <div><strong>Generation seed:</strong> <code>{selected.generation_seed ?? '—'}</code></div>
                <div><strong>Dibuat:</strong> {new Date(selected.created_at).toLocaleString('id-ID')}</div>
              </div>

              <label className={styles.field}>
                <span>Konten (Markdown — edit untuk override sebelum approve)</span>
                <textarea
                  value={editedMarkdown}
                  onChange={(e) => setEditedMarkdown(e.target.value)}
                  rows={20}
                />
              </label>

              <label className={styles.field}>
                <span>Catatan QA (wajib untuk Request Revisi / Reject)</span>
                <textarea
                  value={qaNotes}
                  onChange={(e) => setQaNotes(e.target.value)}
                  rows={3}
                  placeholder="Misal: 'Pastikan citation untuk klaim pseudokode di paragraf 2'"
                />
              </label>

              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.btnApprove}
                  disabled={actionInFlight}
                  onClick={() => {
                    // If markdown was edited, use edit action (which both saves
                    // body + sets approved). Otherwise plain approve.
                    const dirty = (selected.content?.markdown ?? '') !== editedMarkdown;
                    if (dirty) {
                      performAction('edit', { contentMarkdown: editedMarkdown, qaNotes: qaNotes || undefined });
                    } else {
                      performAction('approve', { qaNotes: qaNotes || undefined });
                    }
                  }}
                >
                  ✓ Approve {`(${(selected.content?.markdown ?? '') !== editedMarkdown ? 'with edit' : 'as-is'})`}
                </button>
                <button
                  type="button"
                  className={styles.btnRevision}
                  disabled={actionInFlight || !qaNotes.trim()}
                  onClick={() => performAction('request_revision', { qaNotes })}
                >
                  ↻ Request Revisi
                </button>
                <button
                  type="button"
                  className={styles.btnReject}
                  disabled={actionInFlight || !qaNotes.trim()}
                  onClick={() => {
                    if (!confirm('Reject konten ini? Siswa tidak akan menerimanya.')) return;
                    performAction('reject', { qaNotes });
                  }}
                >
                  ✕ Reject
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
