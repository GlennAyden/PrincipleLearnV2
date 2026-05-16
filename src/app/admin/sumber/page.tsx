'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import styles from './page.module.scss';

interface MaterialRow {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  template_topics: string[];
  source_url: string | null;
  storage_path: string | null;
  file_size_bytes: number | null;
  page_count: number | null;
  validation_status: 'draft' | 'validated' | 'retired';
  validated_by: string | null;
  validated_at: string | null;
  uploaded_by: string | null;
  created_at: string;
  updated_at: string;
  chunk_count: number;
}

const TOPIC_OPTIONS = [
  { value: 'mengenal-algoritma', label: 'Mengenal Algoritma' },
  { value: 'struktur-kendali',   label: 'Struktur Kendali' },
  { value: 'memilih-algoritma',  label: 'Memilih Algoritma' },
  { value: 'struktur-data',      label: 'Struktur Data' },
] as const;

type TopicValue = (typeof TOPIC_OPTIONS)[number]['value'];

const STATUS_OPTIONS = [
  { value: '',          label: 'Semua status'        },
  { value: 'draft',     label: 'Draft (belum review)' },
  { value: 'validated', label: 'Validated'           },
  { value: 'retired',   label: 'Retired'             },
];

export default function AdminSumberPage() {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filterTopic, setFilterTopic] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const fetchList = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterTopic) params.set('topic', filterTopic);
      const res = await apiFetch(`/api/admin/sumber?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { materials?: MaterialRow[] };
      setMaterials(json.materials ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat daftar materi.');
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterTopic]);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  const handleAction = async (id: string, action: 'validate' | 'retire' | 'retag', extra?: Partial<{ templateTopics: TopicValue[] }>) => {
    try {
      const res = await apiFetch(`/api/admin/sumber/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...(extra ?? {}) }),
      });
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(detail.error || `HTTP ${res.status}`);
      }
      await fetchList();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Aksi gagal');
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Bank Sumber Materi</h1>
          <p className={styles.subtitle}>
            Materi PDF Fase E sebagai sumber RAG untuk AI Sokratik (MVR Item 3).
          </p>
          <nav className={styles.subnav}>
            <a href="/admin/sumber">📚 Materi</a>
            <a href="/admin/sumber/cache-review">📝 Cache Review (4b)</a>
            <a href="/admin/sumber/interactive-blocks">🧩 Komponen Interaktif (9.4)</a>
          </nav>
        </div>
        <button className={styles.uploadBtn} onClick={() => setShowUpload(true)}>
          + Upload Materi Baru
        </button>
      </header>

      <div className={styles.filters}>
        <label className={styles.filterField}>
          <span>Topik</span>
          <select value={filterTopic} onChange={(e) => setFilterTopic(e.target.value)}>
            <option value="">Semua topik</option>
            {TOPIC_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
        <label className={styles.filterField}>
          <span>Status</span>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </label>
      </div>

      {error && <div className={styles.error}>{error}</div>}
      {loading && <p className={styles.muted}>Memuat...</p>}

      {!loading && !error && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Judul</th>
              <th>Topik</th>
              <th>Halaman</th>
              <th>Chunks</th>
              <th>Status</th>
              <th>Diunggah</th>
              <th>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {materials.length === 0 ? (
              <tr><td colSpan={7} className={styles.muted}>Belum ada materi yang diunggah.</td></tr>
            ) : materials.map((m) => (
              <tr key={m.id}>
                <td>
                  <div className={styles.cellTitle}>{m.title}</div>
                  {m.author && <div className={styles.cellSub}>{m.author}{m.edition ? ` · ${m.edition}` : ''}</div>}
                </td>
                <td>
                  <div className={styles.tagRow}>
                    {m.template_topics.map((t) => (
                      <span key={t} className={styles.tag}>{t}</span>
                    ))}
                  </div>
                </td>
                <td>{m.page_count ?? '—'}</td>
                <td>{m.chunk_count}</td>
                <td>
                  <span className={`${styles.statusPill} ${styles[`status_${m.validation_status}`]}`}>
                    {m.validation_status}
                  </span>
                </td>
                <td>{new Date(m.created_at).toLocaleDateString('id-ID')}</td>
                <td>
                  <div className={styles.actions}>
                    {m.validation_status !== 'validated' && (
                      <button onClick={() => handleAction(m.id, 'validate')}>Validasi</button>
                    )}
                    {m.validation_status !== 'retired' && (
                      <button onClick={() => {
                        if (confirm(`Retire materi "${m.title}"? RAG tidak akan memakainya lagi.`)) {
                          handleAction(m.id, 'retire');
                        }
                      }}>Retire</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {showUpload && (
        <UploadModal
          onClose={() => setShowUpload(false)}
          onUploaded={() => { setShowUpload(false); fetchList(); }}
        />
      )}
    </div>
  );
}

interface UploadModalProps {
  onClose: () => void;
  onUploaded: () => void;
}

type UploadMode = 'pdf' | 'text';

function UploadModal({ onClose, onUploaded }: UploadModalProps) {
  const [title, setTitle] = useState('Informatika SMA/MA/SMK/MAK Kelas X Edisi Revisi');
  const [author, setAuthor] = useState('Mushthofa dkk.');
  const [edition, setEdition] = useState('2023');
  const [sourceUrl, setSourceUrl] = useState('');
  const [templateTopics, setTemplateTopics] = useState<TopicValue[]>([]);
  const [uploadMode, setUploadMode] = useState<UploadMode>('pdf');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [rawText, setRawText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [summary, setSummary] = useState<{ chunk_count: number; total_tokens: number; estimated_cost_usd: number } | null>(null);

  const toggleTopic = (topic: TopicValue) => {
    setTemplateTopics((prev) =>
      prev.includes(topic) ? prev.filter((t) => t !== topic) : [...prev, topic],
    );
  };

  const textTokens = useMemo(() => Math.ceil(rawText.length / 4), [rawText]);

  const readFileAsBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
      reader.onload = () => {
        const result = reader.result;
        if (typeof result !== 'string') {
          reject(new Error('Hasil baca file tidak berformat string'));
          return;
        }
        // Strip "data:application/pdf;base64," prefix — backend tolerates both
        // forms but bare base64 keeps the payload smaller.
        resolve(result.replace(/^data:[^;]+;base64,/, ''));
      };
      reader.readAsDataURL(file);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    setSummary(null);
    try {
      const payload: Record<string, unknown> = {
        title: title.trim(),
        author: author.trim() || null,
        edition: edition.trim() || null,
        templateTopics,
        sourceUrl: sourceUrl.trim() || null,
      };

      if (uploadMode === 'pdf') {
        if (!pdfFile) throw new Error('Pilih file PDF terlebih dulu');
        if (pdfFile.size > 25 * 1024 * 1024) {
          throw new Error('Ukuran PDF > 25 MB. Pecah jadi file lebih kecil atau pakai mode Raw Text.');
        }
        const base64 = await readFileAsBase64(pdfFile);
        payload.pdfBase64 = base64;
        payload.fileSizeBytes = pdfFile.size;
      } else {
        payload.rawText = rawText.trim();
      }

      const res = await apiFetch('/api/admin/sumber', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSummary(json.summary);
      // Auto-close after 1.5s so admin can see the summary.
      setTimeout(() => onUploaded(), 1500);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal mengunggah materi.');
    } finally {
      setSubmitting(false);
    }
  };

  const canSubmit =
    !submitting &&
    templateTopics.length > 0 &&
    (uploadMode === 'pdf' ? Boolean(pdfFile) : rawText.trim().length >= 200);

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.modalTitle}>Upload Materi Baru</h2>
        <p className={styles.modalNote}>
          Unggah PDF langsung (parser <code>unpdf</code>) atau tempel teks hasil <code>pdftotext input.pdf</code> di kolom Raw Text. Mode Raw Text mendukung pemetaan halaman via karakter form-feed (<code>\f</code>).
        </p>

        <form className={styles.form} onSubmit={handleSubmit}>
          <div className={styles.row2}>
            <label className={styles.checkboxOption} style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="uploadMode"
                checked={uploadMode === 'pdf'}
                onChange={() => setUploadMode('pdf')}
              />
              <span>📄 Upload PDF (otomatis ekstrak teks per halaman)</span>
            </label>
            <label className={styles.checkboxOption} style={{ cursor: 'pointer' }}>
              <input
                type="radio"
                name="uploadMode"
                checked={uploadMode === 'text'}
                onChange={() => setUploadMode('text')}
              />
              <span>📋 Raw Text (paste manual)</span>
            </label>
          </div>
          <label>
            <span>Judul *</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>

          <div className={styles.row2}>
            <label>
              <span>Penulis</span>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} />
            </label>
            <label>
              <span>Edisi/Tahun</span>
              <input value={edition} onChange={(e) => setEdition(e.target.value)} />
            </label>
          </div>

          <label>
            <span>Source URL (opsional)</span>
            <input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://..." />
          </label>

          <fieldset className={styles.checkboxGroup}>
            <legend>Topik Fase E yang dicakup *</legend>
            {TOPIC_OPTIONS.map((t) => (
              <label key={t.value} className={styles.checkboxOption}>
                <input
                  type="checkbox"
                  checked={templateTopics.includes(t.value)}
                  onChange={() => toggleTopic(t.value)}
                />
                <span>{t.label}</span>
              </label>
            ))}
          </fieldset>

          {uploadMode === 'pdf' ? (
            <label>
              <span>File PDF * (maks 25 MB)</span>
              <input
                type="file"
                accept="application/pdf,.pdf"
                onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
              />
              {pdfFile && (
                <div className={styles.cellSub}>
                  {pdfFile.name} · {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                </div>
              )}
            </label>
          ) : (
            <label>
              <span>Raw Text * (~{textTokens.toLocaleString('id-ID')} token)</span>
              <textarea
                rows={14}
                value={rawText}
                onChange={(e) => setRawText(e.target.value)}
                placeholder="Tempel teks Bab 2 Mushthofa dkk. 2023 di sini..."
              />
            </label>
          )}

          {submitError && <div className={styles.error}>{submitError}</div>}
          {summary && (
            <div className={styles.success}>
              ✓ {summary.chunk_count} chunks · {summary.total_tokens.toLocaleString('id-ID')} token · ~${summary.estimated_cost_usd}
            </div>
          )}

          <div className={styles.modalActions}>
            <button type="button" onClick={onClose} disabled={submitting}>Batal</button>
            <button type="submit" disabled={!canSubmit}>
              {submitting ? 'Mengunggah...' : 'Upload & Embed'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
