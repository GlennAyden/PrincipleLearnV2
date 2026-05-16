'use client';

import { TraceTable } from './TraceTable';
import { OutputPredictor } from './OutputPredictor';
import { ParsonsProblem } from './ParsonsProblem';
import { BugHunt } from './BugHunt';
import { FlowchartBuilder } from './FlowchartBuilder';
import { PseudocodeBlockBuilder } from './PseudocodeBlockBuilder';
import type { InteractiveBlock } from '@/types/interactive-blocks';

interface InteractiveBlockRendererProps {
  block: InteractiveBlock;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

/**
 * MVR Item 9.1 — central switcher for all 6 interactive block types.
 * Implemented (6): TraceTable, OutputPredictor, ParsonsProblem,
 *                  BugHunt, FlowchartBuilder, PseudocodeBlockBuilder.
 */
export function InteractiveBlockRenderer({
  block,
  courseId,
  subtopicId,
  leafSubtopicId,
  onSubmitted,
}: InteractiveBlockRendererProps) {
  switch (block.type) {
    case 'trace_table':
      return (
        <TraceTable
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    case 'output_predictor':
      return (
        <OutputPredictor
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    case 'parsons':
      return (
        <ParsonsProblem
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    case 'bug_hunt':
      return (
        <BugHunt
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    case 'flowchart_builder':
      return (
        <FlowchartBuilder
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    case 'block_builder':
      return (
        <PseudocodeBlockBuilder
          config={block.config}
          courseId={courseId}
          subtopicId={subtopicId}
          leafSubtopicId={leafSubtopicId}
          onSubmitted={onSubmitted}
        />
      );
    default:
      return null;
  }
}
