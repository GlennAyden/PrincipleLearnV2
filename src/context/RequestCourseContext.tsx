// src/context/RequestCourseContext.tsx
'use client';

import React, {
  createContext,
  useContext,
  useState,
  ReactNode,
} from 'react';

// 1. Perlu include '' di union agar default state valid
export type Level = '' | 'Beginner' | 'Intermediate' | 'Advance';

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

const RequestCourseContext = createContext<ContextValue | null>(null);

export function RequestCourseProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [answers, set] = useState<RequestCourseAnswers>(defaultVals);

  const setPartial = (p: Partial<RequestCourseAnswers>) =>
    set((prev) => ({ ...prev, ...p }));

  const reset = () => set(defaultVals);

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
