'use client'

import React, { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api-client'
import styles from './CognitiveHeatmap.module.scss'

// ─── Types ────────────────────────────────────────────────────────────────────

export type GroupBy = 'sequence' | 'week' | 'session'

export interface HeatmapEntry {
  groupKey: string
  label: string
  ct_decomposition: number | null
  ct_pattern_recognition: number | null
  ct_abstraction: number | null
  ct_algorithm_design: number | null
  ct_evaluation_debugging: number | null
  ct_generalization: number | null
  cth_interpretation: number | null
  cth_analysis: number | null
  cth_evaluation: number | null
  cth_inference: number | null
  cth_explanation: number | null
  cth_self_regulation: number | null
  evidenceSummary: string | null
  confidence: number | null
  source: string | null
  createdAt: string | null
  cognitiveDepthLevel: number | null
}

interface HeatmapData {
  entries: HeatmapEntry[]
  aggregateRowTotals: Record<string, number>
  aggregateColTotals: Record<string, number>
  groupBy: GroupBy
  totalEntries: number
}

export interface CognitiveHeatmapProps {
  userId: string
  courseId?: string
  initialGroupBy?: GroupBy
}

// ─── Dimension config (12 rows) ────────────────────────────────────────────────

const CT_DIMS: { key: keyof HeatmapEntry; label: string }[] = [
  { key: 'ct_decomposition', label: 'Dekomposisi' },
  { key: 'ct_pattern_recognition', label: 'Pengenalan Pola' },
  { key: 'ct_abstraction', label: 'Abstraksi' },
  { key: 'ct_algorithm_design', label: 'Desain Algoritma' },
  { key: 'ct_evaluation_debugging', label: 'Evaluasi & Debug' },
  { key: 'ct_generalization', label: 'Generalisasi' },
]

const CTH_DIMS: { key: keyof HeatmapEntry; label: string }[] = [
  { key: 'cth_interpretation', label: 'Interpretasi' },
  { key: 'cth_analysis', label: 'Analisis' },
  { key: 'cth_evaluation', label: 'Evaluasi' },
  { key: 'cth_inference', label: 'Inferensi' },
  { key: 'cth_explanation', label: 'Eksplanasi' },
  { key: 'cth_self_regulation', label: 'Regulasi Diri' },
]

const ALL_DIMS = [...CT_DIMS, ...CTH_DIMS]

const SOURCE_LABELS: Record<string, string> = {
  ask_question: 'Tanya Jawab',
  challenge_response: 'Tantangan',
  quiz_submission: 'Kuis',
  journal: 'Refleksi',
  discussion: 'Diskusi',
}

// ─── Color helpers ─────────────────────────────────────────────────────────────

/**
 * Maps score 0–2 to a CSS class.
 * null → empty cell (white, dashed border)
 * 0   → abu (#f1f5f9)
 * 1   → kuning (#fde68a)
 * 2   → hijau (#34d399)
 * Fractional avg values get interpolated bucket.
 */
function scoreClass(value: number | null | undefined, hideEmpty: boolean): string {
  if (value === null || value === undefined) {
    return hideEmpty ? styles.cellHidden : styles.cellEmpty
  }
  if (value === 0) return styles.cellScore0
  if (value <= 0.5) return styles.cellScore0half
  if (value < 1.5) return styles.cellScore1
  return styles.cellScore2
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

interface TooltipState {
  visible: boolean
  x: number
  y: number
  value: number | null
  dimLabel: string
  entry: HeatmapEntry | null
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function CognitiveHeatmap({ userId, courseId, initialGroupBy = 'sequence' }: CognitiveHeatmapProps) {
  const [groupBy, setGroupBy] = useState<GroupBy>(initialGroupBy)
  const [data, setData] = useState<HeatmapData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hideEmpty, setHideEmpty] = useState(false)
  const [tooltip, setTooltip] = useState<TooltipState>({
    visible: false, x: 0, y: 0, value: null, dimLabel: '', entry: null,
  })

  // Fetch on mount + when groupBy changes
  const fetchData = useCallback(async (gb: GroupBy) => {
    setLoading(true)
    setError(null)
    try {
      let url = `/api/admin/research/cognitive-scores?userId=${userId}&groupBy=${gb}`
      if (courseId) url += `&courseId=${courseId}`
      const res = await apiFetch(url, { cache: 'no-store' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Gagal memuat data heatmap')
      setData(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data heatmap')
    } finally {
      setLoading(false)
    }
  }, [userId, courseId])

  // Initial fetch
  React.useEffect(() => {
    fetchData(groupBy)
  }, [fetchData, groupBy])

  const handleGroupByChange = (gb: GroupBy) => {
    setGroupBy(gb)
    // fetchData will fire via useEffect dependency on groupBy
  }

  const handleCellEnter = (e: React.MouseEvent, value: number | null, dimLabel: string, entry: HeatmapEntry) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
      value,
      dimLabel,
      entry,
    })
  }

  const handleCellLeave = () => {
    setTooltip(prev => ({ ...prev, visible: false }))
  }

  const handlePrint = () => {
    window.print()
  }

  const entries = data?.entries ?? []
  const rowTotals = data?.aggregateRowTotals ?? {}
  const colTotals = data?.aggregateColTotals ?? {}

  return (
    <div className={styles.wrapper} id="cognitive-heatmap-print">
      {/* ─── Toolbar ─────────────────────────────────────────────── */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <span className={styles.toolbarLabel}>Kelompokkan per:</span>
          <div className={styles.segmentedControl}>
            {([['sequence', 'Urutan Prompt'], ['week', 'Minggu'], ['session', 'Sesi']] as [GroupBy, string][]).map(([gb, label]) => (
              <button
                key={gb}
                className={`${styles.segmentBtn} ${groupBy === gb ? styles.segmentActive : ''}`}
                onClick={() => handleGroupByChange(gb)}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            className={`${styles.toggleBtn} ${hideEmpty ? styles.toggleActive : ''}`}
            onClick={() => setHideEmpty(h => !h)}
            title={hideEmpty ? 'Tampilkan cell kosong' : 'Sembunyikan cell kosong'}
          >
            {hideEmpty ? 'Tampilkan Semua' : 'Sembunyikan Kosong'}
          </button>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.legend}>
            <span className={styles.legendTitle}>Skor:</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.cellScore0}`} />0</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.cellScore1}`} />1</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.cellScore2}`} />2</span>
            <span className={styles.legendItem}><span className={`${styles.legendDot} ${styles.cellEmpty}`} />Kosong</span>
          </div>
          <button className={styles.printBtn} onClick={handlePrint} title="Cetak Heatmap">
            Cetak
          </button>
        </div>
      </div>

      {/* ─── States ──────────────────────────────────────────────── */}
      {loading && (
        <div className={styles.loadingState}>Memuat heatmap kognitif...</div>
      )}

      {error && !loading && (
        <div className={styles.errorState}>{error}</div>
      )}

      {!loading && !error && entries.length === 0 && (
        <div className={styles.emptyState}>
          Belum ada data skor kognitif untuk siswa ini.
        </div>
      )}

      {/* ─── Heatmap Matrix ──────────────────────────────────────── */}
      {!loading && !error && entries.length > 0 && (
        <div className={styles.matrixOuter}>
          <div className={styles.matrixScroll}>
            <table className={styles.matrix} role="grid" aria-label="Heatmap Kognitif">
              <thead>
                <tr>
                  {/* Y-axis header spacer */}
                  <th className={styles.rowGroupLabel} scope="col">Dimensi</th>
                  {/* X-axis: column headers */}
                  {entries.map((entry, colIdx) => (
                    <th
                      key={entry.groupKey}
                      scope="col"
                      className={styles.colHeader}
                      style={{ animationDelay: `${colIdx * 30}ms` }}
                    >
                      {entry.label}
                    </th>
                  ))}
                  <th className={styles.rowTotalHeader} scope="col">Rata-rata</th>
                </tr>
              </thead>
              <tbody>
                {/* CT group label row */}
                <tr className={styles.groupLabelRow}>
                  <td colSpan={entries.length + 2} className={styles.groupLabelCell}>
                    Computational Thinking (CT)
                  </td>
                </tr>

                {CT_DIMS.map((dim, rowIdx) => (
                  <tr key={dim.key} className={styles.dataRow}>
                    <th scope="row" className={styles.dimLabel}>
                      {dim.label}
                    </th>
                    {entries.map((entry, colIdx) => {
                      const val = entry[dim.key] as number | null
                      const cls = scoreClass(val, hideEmpty)
                      return (
                        <td
                          key={entry.groupKey}
                          className={`${styles.cell} ${cls}`}
                          style={{ animationDelay: `${(rowIdx * entries.length + colIdx) * 18}ms` }}
                          onMouseEnter={(e) => handleCellEnter(e, val, dim.label, entry)}
                          onMouseLeave={handleCellLeave}
                          aria-label={`${dim.label} ${entry.label}: ${val ?? 'tidak ada data'}`}
                        >
                          {val !== null ? (
                            <span className={styles.cellValue}>
                              {Number.isInteger(val) ? val : val.toFixed(1)}
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                    <td className={styles.rowTotal}>
                      {rowTotals[dim.key as string] !== undefined
                        ? rowTotals[dim.key as string].toFixed(1)
                        : '-'}
                    </td>
                  </tr>
                ))}

                {/* CTH group label row */}
                <tr className={styles.groupLabelRow}>
                  <td colSpan={entries.length + 2} className={styles.groupLabelCell}>
                    Critical Thinking & Reflection (CTH)
                  </td>
                </tr>

                {CTH_DIMS.map((dim, rowIdx) => (
                  <tr key={dim.key} className={styles.dataRow}>
                    <th scope="row" className={styles.dimLabel}>
                      {dim.label}
                    </th>
                    {entries.map((entry, colIdx) => {
                      const val = entry[dim.key] as number | null
                      const cls = scoreClass(val, hideEmpty)
                      return (
                        <td
                          key={entry.groupKey}
                          className={`${styles.cell} ${cls}`}
                          style={{ animationDelay: `${((rowIdx + 6) * entries.length + colIdx) * 18}ms` }}
                          onMouseEnter={(e) => handleCellEnter(e, val, dim.label, entry)}
                          onMouseLeave={handleCellLeave}
                          aria-label={`${dim.label} ${entry.label}: ${val ?? 'tidak ada data'}`}
                        >
                          {val !== null ? (
                            <span className={styles.cellValue}>
                              {Number.isInteger(val) ? val : val.toFixed(1)}
                            </span>
                          ) : null}
                        </td>
                      )
                    })}
                    <td className={styles.rowTotal}>
                      {rowTotals[dim.key as string] !== undefined
                        ? rowTotals[dim.key as string].toFixed(1)
                        : '-'}
                    </td>
                  </tr>
                ))}

                {/* Column totals row */}
                <tr className={styles.colTotalRow}>
                  <th scope="row" className={styles.colTotalLabel}>Total Kolom</th>
                  {entries.map((entry) => (
                    <td key={entry.groupKey} className={styles.colTotal}>
                      {colTotals[entry.groupKey] !== undefined
                        ? colTotals[entry.groupKey].toFixed(1)
                        : '-'}
                    </td>
                  ))}
                  <td className={styles.cornerCell}>
                    {/* Grand total: avg of all rowTotals */}
                    {Object.values(rowTotals).length > 0
                      ? (Object.values(rowTotals).reduce((a, b) => a + b, 0) / ALL_DIMS.length).toFixed(1)
                      : '-'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Meta info */}
          <div className={styles.matrixMeta}>
            <span>{entries.length} kolom &times; 12 dimensi</span>
            <span>Total interaksi: {data?.totalEntries ?? 0}</span>
          </div>
        </div>
      )}

      {/* ─── Tooltip (portal-like, fixed) ────────────────────────── */}
      {tooltip.visible && tooltip.entry && (
        <div
          className={styles.tooltip}
          style={{ left: tooltip.x, top: tooltip.y }}
          role="tooltip"
        >
          <div className={styles.tooltipHeader}>
            <strong>{tooltip.dimLabel}</strong>
            <span className={styles.tooltipCol}>{tooltip.entry.label}</span>
          </div>
          <div className={styles.tooltipScore}>
            Skor: <strong>{tooltip.value !== null ? tooltip.value : 'N/A'}</strong>
          </div>
          {tooltip.entry.createdAt && (
            <div className={styles.tooltipDate}>
              {new Date(tooltip.entry.createdAt).toLocaleDateString('id-ID', {
                day: 'numeric', month: 'short', year: 'numeric'
              })}
            </div>
          )}
          {tooltip.entry.source && (
            <div className={styles.tooltipSource}>
              {SOURCE_LABELS[tooltip.entry.source] ?? tooltip.entry.source}
            </div>
          )}
          {tooltip.entry.confidence !== null && (
            <div className={styles.tooltipConfidence}>
              Confidence: {((tooltip.entry.confidence ?? 0) * 100).toFixed(0)}%
            </div>
          )}
          {tooltip.entry.evidenceSummary && (
            <div className={styles.tooltipEvidence}>
              {tooltip.entry.evidenceSummary.slice(0, 120)}
              {tooltip.entry.evidenceSummary.length > 120 ? '...' : ''}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
