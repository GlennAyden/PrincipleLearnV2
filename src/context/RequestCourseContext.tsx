// src/context/RequestCourseContext.tsx
'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from 'react';

// 1. Perlu include '' di union agar default state valid
export type Level = '' | 'Beginner' | 'Intermediate' | 'Advanced';

export interface RequestCourseAnswers {
  topic:       string;
  goal:        string;
  level:       Level;
  extraTopics: string;
  problem:     string;
  assumption:  string;
}

interface ContextValue {
  answers:    RequestCourseAnswers;
  setPartial: (p: Partial<RequestCourseAnswers>) => void;
  reset:      () => void;
}

const defaultVals: RequestCourseAnswers = {
  topic:       '',
  goal:        '',
  level:       '',    // sekarang valid karena Level includes ''
  extraTopics: '',
  problem:     '',
  assumption:  '',
};

const STORAGE_KEY = 'requestCourseAnswers';

/**
 * Load answers from sessionStorage if available
 */
function loadFromStorage(): RequestCourseAnswers {
  if (typeof window === 'undefined') return defaultVals;
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...defaultVals, ...parsed };
    }
  } catch {
    // Ignore parse errors
  }
  return defaultVals;
}

/**
 * Save answers to sessionStorage
 */
function saveToStorage(answers: RequestCourseAnswers) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(answers));
  } catch {
    // Ignore storage errors (e.g., quota exceeded)
  }
}

const RequestCourseContext = createContext<ContextValue | null>(null);

export function RequestCourseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [answers, set] = useState<RequestCourseAnswers>(defaultVals);
  const [hydrated, setHydrated] = useState(false);

  // Hydrate from sessionStorage on mount (client-side only)
  useEffect(() => {
    const stored = loadFromStorage();
    set(stored);
    setHydrated(true);
  }, []);

  // Persist to sessionStorage whenever answers change (after hydration)
  useEffect(() => {
    if (hydrated) {
      saveToStorage(answers);
    }
  }, [answers, hydrated]);

  const setPartial = (p: Partial<RequestCourseAnswers>) =>
    set((prev) => ({ ...prev, ...p }));

  const reset = () => {
    set(defaultVals);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <RequestCourseContext.Provider
      value={{ answers, setPartial, reset }}
    >
      {children}
    </RequestCourseContext.Provider>
  );
}

export function useRequestCourse() {
  const ctx = useContext(RequestCourseContext);
  if (!ctx) throw new Error('useRequestCourse must be inside Provider');
  return ctx;
}
