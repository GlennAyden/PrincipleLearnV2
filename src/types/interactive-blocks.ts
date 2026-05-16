/**
 * MVR Item 9 — type definitions for the 6 interactive component configs.
 * Stored in `leaf_subtopics.interactive_blocks` as a JSONB array.
 *
 * Each entry has a discriminated `type` field + a `config` shape specific to
 * that component. The InteractiveBlockRenderer switches on `type`.
 */

export type InteractiveBlockType =
  | 'trace_table'
  | 'output_predictor'
  | 'parsons'
  | 'bug_hunt'
  | 'flowchart_builder'
  | 'block_builder';

export interface TraceTableColumn {
  key: string;        // machine id e.g. 'i', 'sum'
  label: string;      // header label shown to student
}

export interface TraceTableRowExpected {
  /** Maps column.key → expected cell value as a STRING for shallow compare */
  values: Record<string, string>;
  /** Optional explanation revealed after a cell is wrong twice */
  hint?: string;
}

export interface TraceTableConfig {
  prompt: string;     // task description in Markdown
  pseudocode: string; // multi-line code, rendered in <pre>
  columns: TraceTableColumn[];
  expectedRows: TraceTableRowExpected[];
  rowLabelPrefix?: string; // default 'Langkah'
}

export interface OutputPredictorConfig {
  prompt: string;
  pseudocode: string;
  inputs?: Record<string, string>;       // optional input values shown to student
  expectedOutput: string;                // canonical answer (trimmed string compare)
  acceptableVariants?: string[];         // alternate acceptable answers
  hintAfterFail?: string;
}

export interface ParsonsConfig {
  prompt: string;
  /** Lines of pseudocode in CORRECT order; UI will shuffle on render. */
  orderedLines: string[];
  /** Optional distractor lines that should NOT be in the final solution. */
  distractors?: string[];
}

export interface BugHuntConfig {
  prompt: string;
  /** Lines as displayed to student (1-indexed line numbers). */
  buggyLines: string[];
  /** 1-indexed line number containing the bug. */
  bugLineIndex: number;
  /** Acceptable fixed-line text (exact string compare, trimmed). */
  expectedFix: string;
  fixAlternatives?: string[];
  hint?: string;
}

export interface FlowchartNodeSpec {
  id: string;
  type: 'terminator' | 'process' | 'decision' | 'io';
  label?: string;
}

export interface FlowchartBuilderConfig {
  prompt: string;
  /** Expected topology — student must construct an isomorphic graph. */
  expectedNodes: FlowchartNodeSpec[];
  expectedEdges: Array<{ from: string; to: string; label?: string }>;
  paletteAllowed?: FlowchartNodeSpec['type'][];
}

export interface BlockBuilderConfig {
  prompt: string;
  /** Acceptable block tokens the student can drag in. */
  palette: string[];
  /** Canonical ordered tokens forming the correct solution. */
  expectedTokens: string[];
}

export type InteractiveBlock =
  | { type: 'trace_table';       config: TraceTableConfig }
  | { type: 'output_predictor';  config: OutputPredictorConfig }
  | { type: 'parsons';           config: ParsonsConfig }
  | { type: 'bug_hunt';          config: BugHuntConfig }
  | { type: 'flowchart_builder'; config: FlowchartBuilderConfig }
  | { type: 'block_builder';     config: BlockBuilderConfig };

export interface InteractionEvent {
  type: string;
  at: string;                              // ISO timestamp
  payload?: Record<string, unknown> | null;
}
