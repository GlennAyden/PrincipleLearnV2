'use client';

import { useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import styles from './BulkUploadModal.module.scss';

const TOPIC_OPTIONS = [
  { value: 'mengenal-algoritma', label: 'Mengenal Algoritma' },
  { value: 'struktur-kendali',   label: 'Struktur Kendali' },
  { value: 'memilih-algoritma',  label: 'Memilih Algoritma' },
  { value: 'struktur-data',      label: 'Struktur Data' },
] as const;

type TopicValue = (typeof TOPIC_OPTIONS)[number]['value'];

type RowStatus = 'pending' | 'uploading' | 'success' | 'failed';

interface FileRow {
  id: string;
  file: File;
  guessedTopic: TopicValue | '';
  guessedTitle: string;
  topic: TopicValue | '';
  status: RowStatus;
  chunkCount: number | null;
  errorMsg: string | null;
}

interface BulkUploadModalProps {
  onClose: () => void;
  onAllDone: () => void;
}

// ---------------------------------------------------------------------------
// Filename convention: NN-topic-slug-Rest-Of-Title.pdf
// Examples:
//   01-mengenal-algoritma-Informatika-BG-KLS-X-Rev-Mirror.pdf
//   02-struktur-kendali-Modul-Ajar-TIK.pdf
// ---------------------------------------------------------------------------
function parseFilename(filename: string): { topic: TopicValue | ''; title: string } {
  // Strip .pdf extension
  const base = filename.replace(/\.pdf$/i, '');

  // Strip leading NN- prefix
  const withoutNum = base.replace(/^\d{1,3}-/, '');

  const topicSlugs: TopicValue[] = [
    'mengenal-algoritma',
    'struktur-kendali',
    'memilih-algoritma',
    'struktur-data',
  ];

  let matchedTopic: TopicValue | '' = '';
  let titleRaw = withoutNum;

  for (const slug of topicSlugs) {
    if (withoutNum.startsWith(slug)) {
      matchedTopic = slug;
      // Remove the topic prefix + trailing dash
      titleRaw = withoutNum.slice(slug.length).replace(/^[-_]/, '');
      break;
    }
  }

  // Convert remaining dashes/underscores to spaces
  const title = titleRaw.replace(/[-_]/g, ' ').trim() || base.replace(/[-_]/g, ' ').trim();

  return { topic: matchedTopic, title };
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('Hasil baca file tidak berformat string'));
        return;
      }
      resolve(result.replace(/^data:[^;]+;base64,/, ''));
    };
    reader.readAsDataURL(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

let rowCounter = 0;
function makeId(): string {
  return `bul-${++rowCounter}`;
}

export default function BulkUploadModal({ onClose, onAllDone }: BulkUploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<FileRow[]>([]);
  const [uploading, setUploading] = useState(false);

  const allDone = rows.length > 0 && rows.every((r) => r.status === 'success' || r.status === 'failed');

  const handleFilesSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const newRows: FileRow[] = files.map((file) => {
      const { topic, title } = parseFilename(file.name);
      return {
        id: makeId(),
        file,
        guessedTopic: topic,
        guessedTitle: title,
        topic,
        status: 'pending',
        chunkCount: null,
        errorMsg: null,
      };
    });

    setRows((prev) => [...prev, ...newRows]);
    // Reset input so same files can be re-selected if needed
    e.target.value = '';
  };

  const updateRow = (id: string, patch: Partial<FileRow>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleStartUpload = async () => {
    const pending = rows.filter((r) => r.status === 'pending');
    if (pending.length === 0) return;

    setUploading(true);

    for (const row of pending) {
      if (!row.topic) {
        updateRow(row.id, {
          status: 'failed',
          errorMsg: 'Pilih topik terlebih dulu sebelum upload.',
        });
          continue;
      }

      updateRow(row.id, { status: 'uploading' });

      try {
        if (row.file.size > 25 * 1024 * 1024) {
          throw new Error('Ukuran file > 25 MB. Pecah jadi file lebih kecil.');
        }

        const pdfBase64 = await readFileAsBase64(row.file);

        const res = await apiFetch('/api/admin/sumber', {
          method: 'POST',
          body: JSON.stringify({
            title: row.guessedTitle || row.file.name,
            templateTopics: [row.topic],
            pdfBase64,
            fileSizeBytes: row.file.size,
          }),
        });

        const json = (await res.json()) as {
          success?: boolean;
          error?: string;
          summary?: { chunk_count: number };
        };

        if (!res.ok) {
          throw new Error(json.error ?? `HTTP ${res.status}`);
        }

        updateRow(row.id, {
          status: 'success',
          chunkCount: json.summary?.chunk_count ?? null,
        });
      } catch (err) {
        updateRow(row.id, {
          status: 'failed',
          errorMsg: err instanceof Error ? err.message : 'Gagal mengunggah.',
        });
      }
    }

    setUploading(false);
  };

  const handleReset = () => {
    setRows([]);
    onAllDone();
  };

  const pendingCount = rows.filter((r) => r.status === 'pending').length;
  const successCount = rows.filter((r) => r.status === 'success').length;
  const failedCount = rows.filter((r) => r.status === 'failed').length;
  const progressPct = rows.length > 0 ? Math.round(((successCount + failedCount) / rows.length) * 100) : 0;

  return (
    <div className={styles.backdrop} onClick={!uploading ? onClose : undefined}>
      <div className={styles.card} onClick={(e) => e.stopPropagation()}>
        <div className={styles.cardHeader}>
          <h2 className={styles.cardTitle}>Upload Banyak PDF</h2>
          {!uploading && (
            <button className={styles.closeBtn} onClick={onClose} aria-label="Tutup">
              x
            </button>
          )}
        </div>

        <p className={styles.note}>
          Pilih satu atau banyak file PDF. Sistem akan menebak topik dan judul dari nama file
          (<code>NN-topic-slug-Judul.pdf</code>). Koreksi topik di dropdown jika perlu, lalu klik
          &quot;Mulai Upload&quot;. Upload dilakukan satu per satu untuk menghindari rate limit OpenAI.
        </p>

        {/* File picker */}
        {!uploading && !allDone && (
          <>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf"
              multiple
              className={styles.hiddenInput}
              onChange={handleFilesSelected}
            />
            <button
              className={styles.pickBtn}
              onClick={() => fileInputRef.current?.click()}
            >
              Pilih File PDF...
            </button>
          </>
        )}

        {/* Preview table */}
        {rows.length > 0 && (
          <>
            {/* Overall progress bar */}
            {uploading && (
              <div className={styles.progressWrap}>
                <div className={styles.progressBar} style={{ width: `${progressPct}%` }} />
                <span className={styles.progressLabel}>
                  {successCount + failedCount} / {rows.length} selesai
                </span>
              </div>
            )}

            {allDone && (
              <div className={styles.summary}>
                Upload selesai: {successCount} berhasil, {failedCount} gagal dari {rows.length} file.
              </div>
            )}

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Nama File</th>
                    <th>Topik</th>
                    <th>Judul (auto)</th>
                    <th>Ukuran</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className={styles[`row_${row.status}`]}>
                      <td className={styles.cellFilename} title={row.file.name}>
                        {row.file.name}
                      </td>
                      <td>
                        {row.status === 'pending' ? (
                          <select
                            className={styles.topicSelect}
                            value={row.topic}
                            onChange={(e) =>
                              updateRow(row.id, { topic: e.target.value as TopicValue | '' })
                            }
                          >
                            <option value="">— pilih topik —</option>
                            {TOPIC_OPTIONS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className={styles.topicTag}>
                            {TOPIC_OPTIONS.find((t) => t.value === row.topic)?.label ?? row.topic}
                          </span>
                        )}
                      </td>
                      <td className={styles.cellTitle} title={row.guessedTitle}>
                        {row.guessedTitle || <span className={styles.muted}>(nama file)</span>}
                      </td>
                      <td className={styles.cellSize}>{formatBytes(row.file.size)}</td>
                      <td>
                        <StatusBadge row={row} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Footer actions */}
        <div className={styles.footer}>
          {!allDone && (
            <>
              {!uploading && (
                <button className={styles.cancelBtn} onClick={onClose}>
                  Batal
                </button>
              )}
              <button
                className={styles.startBtn}
                onClick={handleStartUpload}
                disabled={uploading || pendingCount === 0}
              >
                {uploading
                  ? `Mengunggah... (${successCount + failedCount}/${rows.length})`
                  : `Mulai Upload (${pendingCount} file)`}
              </button>
            </>
          )}
          {allDone && (
            <button className={styles.doneBtn} onClick={handleReset}>
              Bersihkan & Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-component: status badge per row
// ---------------------------------------------------------------------------
function StatusBadge({ row }: { row: FileRow }) {
  switch (row.status) {
    case 'pending':
      return <span className={`${styles.badge} ${styles.badge_pending}`}>Menunggu</span>;
    case 'uploading':
      return <span className={`${styles.badge} ${styles.badge_uploading}`}>Mengunggah...</span>;
    case 'success':
      return (
        <span className={`${styles.badge} ${styles.badge_success}`}>
          Berhasil {row.chunkCount !== null ? `· ${row.chunkCount} chunks` : ''}
        </span>
      );
    case 'failed':
      return (
        <span className={`${styles.badge} ${styles.badge_failed}`} title={row.errorMsg ?? undefined}>
          Gagal — {row.errorMsg ?? 'unknown error'}
        </span>
      );
  }
}
