'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useInteractionTracking } from '@/hooks/useInteractionTracking';
import type { FlowchartBuilderConfig, FlowchartNodeSpec } from '@/types/interactive-blocks';
import styles from './FlowchartBuilder.module.scss';

interface FlowchartBuilderProps {
  config: FlowchartBuilderConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

// ─── Internal node state ──────────────────────────────────────────────────────

interface CanvasNode {
  id: string;
  type: FlowchartNodeSpec['type'];
  label: string;
  x: number;
  y: number;
}

interface CanvasEdge {
  id: string;
  from: string;
  to: string;
  label: string;
}

// ─── Node shape geometry ──────────────────────────────────────────────────────

const NODE_W = 100;
const NODE_H = 40;
const DIAMOND_HW = 55; // half-width for decision diamond
const DIAMOND_HH = 28; // half-height for decision diamond

type NodeType = FlowchartNodeSpec['type'];

const NODE_LABELS: Record<NodeType, string> = {
  terminator: 'Terminator',
  process: 'Proses',
  decision: 'Keputusan',
  io: 'I/O',
};

/** Returns SVG element string for a node shape (used inline). */
function NodeShape({
  type,
  label,
  selected,
  connecting,
}: {
  type: NodeType;
  label: string;
  selected: boolean;
  connecting: boolean;
}) {
  const stroke = connecting ? '#22c55e' : selected ? '#8b5cf6' : '#334155';
  const strokeWidth = selected || connecting ? 2 : 1.5;
  const fill = '#1e293b';
  const textFill = '#f1f5f9';

  const textEl = (
    <text
      x="50%"
      y="50%"
      dominantBaseline="middle"
      textAnchor="middle"
      fill={textFill}
      fontSize="9"
      fontFamily="'SF Mono', Menlo, Monaco, Consolas, monospace"
      style={{ pointerEvents: 'none', userSelect: 'none' }}
    >
      {label.length > 12 ? label.slice(0, 11) + '…' : label}
    </text>
  );

  if (type === 'terminator') {
    const rx = NODE_H / 2;
    return (
      <svg width={NODE_W} height={NODE_H} overflow="visible">
        <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={rx} ry={rx} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {textEl}
      </svg>
    );
  }

  if (type === 'decision') {
    const cx = DIAMOND_HW;
    const cy = DIAMOND_HH;
    const pts = `${cx},0 ${cx * 2},${cy} ${cx},${cy * 2} 0,${cy}`;
    return (
      <svg width={cx * 2} height={cy * 2} overflow="visible">
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {textEl}
      </svg>
    );
  }

  if (type === 'io') {
    const skew = 10;
    const pts = `${skew},0 ${NODE_W},0 ${NODE_W - skew},${NODE_H} 0,${NODE_H}`;
    return (
      <svg width={NODE_W} height={NODE_H} overflow="visible">
        <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
        {textEl}
      </svg>
    );
  }

  // process (default rectangle)
  return (
    <svg width={NODE_W} height={NODE_H} overflow="visible">
      <rect x={0} y={0} width={NODE_W} height={NODE_H} rx={4} ry={4} fill={fill} stroke={stroke} strokeWidth={strokeWidth} />
      {textEl}
    </svg>
  );
}

/** Centre point of a node for edge anchoring. */
function nodeCenter(n: CanvasNode): [number, number] {
  if (n.type === 'decision') return [n.x + DIAMOND_HW, n.y + DIAMOND_HH];
  return [n.x + NODE_W / 2, n.y + NODE_H / 2];
}

/** Simple curved path between two centre points. */
function edgePath(x1: number, y1: number, x2: number, y2: number): string {
  const my = (y1 + y2) / 2;
  // Slight cubic curve for readability
  const dx = (x2 - x1) * 0.25;
  return `M ${x1} ${y1} C ${x1 + dx} ${my}, ${x2 - dx} ${my}, ${x2} ${y2}`;
}

// ─── Score computation ────────────────────────────────────────────────────────

function computeScore(
  nodes: CanvasNode[],
  edges: CanvasEdge[],
  config: FlowchartBuilderConfig,
): number {
  const totalExpectedNodes = config.expectedNodes.length;
  const totalExpectedEdges = config.expectedEdges.length;

  // Node-type count match
  const expectedTypeCounts: Record<string, number> = {};
  for (const n of config.expectedNodes) {
    expectedTypeCounts[n.type] = (expectedTypeCounts[n.type] ?? 0) + 1;
  }
  const studentTypeCounts: Record<string, number> = {};
  for (const n of nodes) {
    studentTypeCounts[n.type] = (studentTypeCounts[n.type] ?? 0) + 1;
  }

  let matchedNodeTypes = 0;
  for (const [type, count] of Object.entries(expectedTypeCounts)) {
    matchedNodeTypes += Math.min(count, studentTypeCounts[type] ?? 0);
  }

  if (totalExpectedNodes === 0 && totalExpectedEdges === 0) return 0;

  const nodeScore =
    totalExpectedNodes > 0 ? matchedNodeTypes / totalExpectedNodes : 1;

  // Edge connectivity match: for each expected edge, check if student has
  // an edge connecting two nodes with the same types as the expected endpoints.
  let matchedEdges = 0;
  const nodeById = new Map<string, CanvasNode>(nodes.map((n) => [n.id, n]));

  // Build a multiset of (fromType, toType) student edges
  const studentEdgeTypes: Array<[string, string]> = [];
  for (const e of edges) {
    const fromNode = nodeById.get(e.from);
    const toNode = nodeById.get(e.to);
    if (fromNode && toNode) {
      studentEdgeTypes.push([fromNode.type, toNode.type]);
    }
  }

  // Build expected edge type pairs from config
  const expectedNodeById = new Map<string, FlowchartNodeSpec>(
    config.expectedNodes.map((n) => [n.id, n]),
  );

  const studentEdgeUsed = studentEdgeTypes.map(() => false);

  for (const ee of config.expectedEdges) {
    const fromSpec = expectedNodeById.get(ee.from);
    const toSpec = expectedNodeById.get(ee.to);
    if (!fromSpec || !toSpec) continue;
    const targetPair: [string, string] = [fromSpec.type, toSpec.type];
    const idx = studentEdgeUsed.findIndex(
      (used, i) =>
        !used &&
        studentEdgeTypes[i][0] === targetPair[0] &&
        studentEdgeTypes[i][1] === targetPair[1],
    );
    if (idx !== -1) {
      studentEdgeUsed[idx] = true;
      matchedEdges++;
    }
  }

  const edgeScore =
    totalExpectedEdges > 0 ? matchedEdges / totalExpectedEdges : 1;

  return Number((edgeScore * 0.7 + nodeScore * 0.3).toFixed(2));
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * MVR Item 9.3 — FlowchartBuilder.
 *
 * Pure SVG flowchart canvas. Students drag nodes from a palette onto a 480×360
 * workspace, connect them, and label them. Scored by comparing student graph
 * topology (node-type counts + typed edge connectivity) against expectedNodes /
 * expectedEdges from config. No graph-isomorphism library required.
 */
export function FlowchartBuilder({
  config,
  courseId,
  subtopicId,
  leafSubtopicId,
  onSubmitted,
}: FlowchartBuilderProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();

  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Connect mode: first click selects source; second click adds edge
  const [connectingFrom, setConnectingFrom] = useState<string | null>(null);
  // Inline label editing
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  // Dragging state
  const draggingRef = useRef<{ nodeId: string; startX: number; startY: number; origX: number; origY: number } | null>(null);
  const moveThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const nodeCounter = useRef(0);
  const edgeCounter = useRef(0);

  const allowedTypes: NodeType[] = config.paletteAllowed ?? ['terminator', 'process', 'decision', 'io'];

  // ── Add node from palette ──────────────────────────────────────────────────

  const addNode = (type: NodeType) => {
    if (submitted) return;
    nodeCounter.current += 1;
    const id = `n${nodeCounter.current}`;
    const newNode: CanvasNode = {
      id,
      type,
      label: NODE_LABELS[type],
      x: 190 - (type === 'decision' ? DIAMOND_HW : NODE_W / 2),
      y: 150 - (type === 'decision' ? DIAMOND_HH : NODE_H / 2),
    };
    setNodes((prev) => [...prev, newNode]);
    track('node_added', { type, id });
  };

  // ── Mouse drag on node ────────────────────────────────────────────────────

  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    if (submitted || editingNodeId === nodeId) return;
    e.preventDefault();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return;
    draggingRef.current = {
      nodeId,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!draggingRef.current) return;
      const { nodeId, startX, startY, origX, origY } = draggingRef.current;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      setNodes((prev) =>
        prev.map((n) =>
          n.id === nodeId
            ? { ...n, x: Math.max(0, origX + dx), y: Math.max(0, origY + dy) }
            : n,
        ),
      );
      if (!moveThrottleRef.current) {
        moveThrottleRef.current = setTimeout(() => {
          const node = nodes.find((n) => n.id === nodeId);
          if (node) track('node_moved', { id: nodeId, x: node.x + dx, y: node.y + dy });
          moveThrottleRef.current = null;
        }, 200);
      }
    },
    [nodes, track],
  );

  const handleMouseUp = () => {
    draggingRef.current = null;
  };

  // ── Connect mode ──────────────────────────────────────────────────────────

  const handleNodeClick = (nodeId: string) => {
    if (submitted || editingNodeId !== null) return;
    if (connectingFrom === null) return; // no-op; connect button activates mode

    if (connectingFrom === nodeId) {
      setConnectingFrom(null);
      return;
    }
    // Add edge
    edgeCounter.current += 1;
    const edge: CanvasEdge = {
      id: `e${edgeCounter.current}`,
      from: connectingFrom,
      to: nodeId,
      label: '',
    };
    setEdges((prev) => [...prev, edge]);
    track('edge_added', { from: connectingFrom, to: nodeId });
    setConnectingFrom(null);
  };

  const toggleConnectMode = (nodeId: string) => {
    if (submitted) return;
    setConnectingFrom((prev) => (prev === nodeId ? null : nodeId));
  };

  // ── Inline node label editing ──────────────────────────────────────────────

  const startEditNode = (nodeId: string, currentLabel: string) => {
    if (submitted) return;
    setEditingNodeId(nodeId);
    setEditLabel(currentLabel);
    setEditingEdgeId(null);
  };

  const commitNodeLabel = (nodeId: string) => {
    const trimmed = editLabel.trim();
    if (trimmed) {
      setNodes((prev) =>
        prev.map((n) => (n.id === nodeId ? { ...n, label: trimmed } : n)),
      );
      track('node_labeled', { id: nodeId, label: trimmed });
    }
    setEditingNodeId(null);
  };

  // ── Inline edge label editing ──────────────────────────────────────────────

  const startEditEdge = (edgeId: string, currentLabel: string) => {
    if (submitted) return;
    setEditingEdgeId(edgeId);
    setEditLabel(currentLabel);
    setEditingNodeId(null);
  };

  const commitEdgeLabel = (edgeId: string) => {
    setEdges((prev) =>
      prev.map((e) => (e.id === edgeId ? { ...e, label: editLabel.trim() } : e)),
    );
    setEditingEdgeId(null);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const deleteNode = (nodeId: string) => {
    setNodes((prev) => prev.filter((n) => n.id !== nodeId));
    setEdges((prev) => prev.filter((e) => e.from !== nodeId && e.to !== nodeId));
    if (connectingFrom === nodeId) setConnectingFrom(null);
  };

  const deleteEdge = (edgeId: string) => {
    setEdges((prev) => prev.filter((e) => e.id !== edgeId));
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError('');
    const finalScore = computeScore(nodes, edges, config);
    track('submitted', { finalScore, nodeCount: nodes.length, edgeCount: edges.length });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'flowchart_builder',
          artifactTitle: 'FlowchartBuilder submission',
          artifactContent: JSON.stringify({ nodes, edges, score: finalScore }),
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

  // ── Render helpers ─────────────────────────────────────────────────────────

  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      <div className={styles.layout}>
        {/* Palette */}
        <div className={styles.palette} role="toolbar" aria-label="Palette node flowchart">
          <div className={styles.paletteHeader}>Tambah Node</div>
          {allowedTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.paletteBtn}
              onClick={() => addNode(type)}
              disabled={submitted}
              aria-label={`Tambah node ${NODE_LABELS[type]}`}
            >
              <span className={styles.paletteBtnIcon} data-type={type} aria-hidden />
              {NODE_LABELS[type]}
            </button>
          ))}

          <div className={styles.paletteDivider} />
          <div className={styles.paletteHint}>
            {connectingFrom
              ? 'Klik node tujuan untuk buat panah'
              : 'Klik "Sambung" pada node lalu klik tujuan'}
          </div>
        </div>

        {/* Canvas */}
        <div
          className={styles.canvasWrap}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          aria-label="Area kerja flowchart"
        >
          {/* Dot-grid background via CSS */}
          <div className={styles.canvasGrid} aria-hidden />

          {/* SVG layer for edges */}
          <svg className={styles.edgeSvg} aria-hidden>
            <defs>
              <marker
                id="arrowhead"
                markerWidth="8"
                markerHeight="6"
                refX="8"
                refY="3"
                orient="auto"
              >
                <polygon points="0 0, 8 3, 0 6" fill="#64748b" />
              </marker>
            </defs>
            {edges.map((edge) => {
              const fromNode = nodeById.get(edge.from);
              const toNode = nodeById.get(edge.to);
              if (!fromNode || !toNode) return null;
              const [x1, y1] = nodeCenter(fromNode);
              const [x2, y2] = nodeCenter(toNode);
              const midX = (x1 + x2) / 2;
              const midY = (y1 + y2) / 2;
              return (
                <g key={edge.id}>
                  <path
                    d={edgePath(x1, y1, x2, y2)}
                    stroke="#64748b"
                    strokeWidth={1.5}
                    fill="none"
                    markerEnd="url(#arrowhead)"
                    className={styles.edgePath}
                    onClick={() => startEditEdge(edge.id, edge.label)}
                    style={{ cursor: submitted ? 'default' : 'pointer' }}
                  />
                  {/* Edge label clickable area */}
                  {edge.label && (
                    <text
                      x={midX}
                      y={midY - 6}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#94a3b8"
                      fontFamily="'SF Mono', Menlo, Monaco, Consolas, monospace"
                      style={{ cursor: 'pointer', pointerEvents: submitted ? 'none' : 'auto' }}
                      onClick={() => startEditEdge(edge.id, edge.label)}
                    >
                      {edge.label}
                    </text>
                  )}
                  {/* Delete edge button */}
                  {!submitted && (
                    <circle
                      cx={midX}
                      cy={midY}
                      r={7}
                      fill="#ef4444"
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                    />
                  )}
                  {!submitted && (
                    <text
                      x={midX}
                      y={midY + 3.5}
                      textAnchor="middle"
                      fontSize="10"
                      fill="white"
                      style={{ pointerEvents: 'none', userSelect: 'none' }}
                    >
                      ×
                    </text>
                  )}
                </g>
              );
            })}
          </svg>

          {/* DOM layer for nodes (positioned absolute) */}
          {nodes.map((node) => {
            const isConnectSource = connectingFrom === node.id;
            const isEditing = editingNodeId === node.id;
            const w = node.type === 'decision' ? DIAMOND_HW * 2 : NODE_W;
            const h = node.type === 'decision' ? DIAMOND_HH * 2 : NODE_H;

            return (
              <div
                key={node.id}
                className={styles.nodeWrap}
                style={{ left: node.x, top: node.y, width: w, height: h }}
                onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
                onClick={() => handleNodeClick(node.id)}
                onDoubleClick={() => startEditNode(node.id, node.label)}
                role="button"
                tabIndex={submitted ? -1 : 0}
                aria-label={`Node ${node.type}: ${node.label}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleNodeClick(node.id);
                  }
                  if (e.key === 'F2') {
                    e.preventDefault();
                    startEditNode(node.id, node.label);
                  }
                  if (e.key === 'Delete') deleteNode(node.id);
                }}
              >
                <NodeShape
                  type={node.type}
                  label={node.label}
                  selected={connectingFrom !== null && !isConnectSource}
                  connecting={isConnectSource}
                />

                {isEditing && (
                  <input
                    className={styles.labelInput}
                    value={editLabel}
                    autoFocus
                    onChange={(e) => setEditLabel(e.target.value)}
                    onBlur={() => commitNodeLabel(node.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitNodeLabel(node.id);
                      if (e.key === 'Escape') setEditingNodeId(null);
                      e.stopPropagation();
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label="Edit label node"
                    style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
                  />
                )}

                {!submitted && !isEditing && (
                  <div className={styles.nodeActions}>
                    <button
                      type="button"
                      className={[styles.nodeActionBtn, isConnectSource ? styles.nodeActionBtnActive : ''].join(' ')}
                      onClick={(e) => { e.stopPropagation(); toggleConnectMode(node.id); }}
                      title="Sambungkan ke node lain"
                      aria-label={`Sambungkan node ${node.label}`}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className={[styles.nodeActionBtn, styles.nodeActionBtnDanger].join(' ')}
                      onClick={(e) => { e.stopPropagation(); deleteNode(node.id); }}
                      title="Hapus node"
                      aria-label={`Hapus node ${node.label}`}
                    >
                      ×
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {/* Edge label inline editor */}
          {editingEdgeId && (() => {
            const edge = edges.find((e) => e.id === editingEdgeId);
            const fromNode = edge ? nodeById.get(edge.from) : null;
            const toNode = edge ? nodeById.get(edge.to) : null;
            if (!edge || !fromNode || !toNode) return null;
            const [x1, y1] = nodeCenter(fromNode);
            const [x2, y2] = nodeCenter(toNode);
            const midX = (x1 + x2) / 2;
            const midY = (y1 + y2) / 2;
            return (
              <input
                className={styles.edgeLabelInput}
                style={{ left: midX - 40, top: midY - 12 }}
                value={editLabel}
                autoFocus
                placeholder="Label panah"
                onChange={(e) => setEditLabel(e.target.value)}
                onBlur={() => commitEdgeLabel(editingEdgeId)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitEdgeLabel(editingEdgeId);
                  if (e.key === 'Escape') setEditingEdgeId(null);
                }}
                aria-label="Edit label panah"
              />
            );
          })()}

          {nodes.length === 0 && (
            <div className={styles.emptyHint} aria-live="polite">
              Tambah node dari palette kiri, lalu sambungkan antar node
            </div>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        <span className={styles.eventBadge}>{eventCount} aksi tercatat</span>
        <span className={styles.countBadge}>{nodes.length} node · {edges.length} panah</span>
        {submitted && score !== null && (
          <span className={styles.scoreBadge}>Skor: {Math.round(score * 100)}%</span>
        )}
        {submitError && <span className={styles.error}>{submitError}</span>}
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || submitted || nodes.length === 0}
          aria-label="Submit flowchart"
        >
          {submitting ? 'Mengirim...' : submitted ? 'Tersimpan' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
