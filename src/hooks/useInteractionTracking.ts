'use client';

import { useCallback, useRef, useState } from 'react';
import type { InteractionEvent } from '@/types/interactive-blocks';

/**
 * MVR Item 9.1 — capture an interaction event stream for any of the 6
 * components (TraceTable, OutputPredictor, ParsonsProblem, BugHunt,
 * FlowchartBuilder, PseudocodeBlockBuilder).
 *
 * Component code calls `track(type, payload?)` on every user action; we
 * append `{ type, at, payload }` to an in-memory array. On submit the
 * component reads `getEvents()` and POSTs the array to
 * /api/research-artifacts/submit as `interactionEvents`.
 *
 * No auto-flush, no debouncing — components decide when to submit. This
 * keeps the hook's contract simple and predictable for unit tests.
 */
export function useInteractionTracking() {
  const [count, setCount] = useState(0);
  const eventsRef = useRef<InteractionEvent[]>([]);

  const track = useCallback((type: string, payload?: Record<string, unknown> | null) => {
    eventsRef.current.push({
      type,
      at: new Date().toISOString(),
      payload: payload ?? null,
    });
    // Trigger a re-render so consumers wanting to display "X actions taken"
    // can read `count`. We use a counter (not the array directly) to avoid
    // forcing a new array reference allocation per event.
    setCount((n) => n + 1);
  }, []);

  const getEvents = useCallback(() => eventsRef.current.slice(), []);

  const reset = useCallback(() => {
    eventsRef.current = [];
    setCount(0);
  }, []);

  return { track, getEvents, reset, eventCount: count };
}
