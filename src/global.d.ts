// src/global.d.ts

declare module '*.scss';

// Tambahkan interface untuk response generate-subtopic API
declare global {
  /**
   * Representasi halaman subtopik
   */
  export interface SubtopicPage {
    title: string;
    paragraphs: string[];
  }

  /**
   * Representasi item kuis (quiz)
   */
  export interface QuizItem {
    question: string;
    options: string[];
    correctIndex: number;
  }

  /**
   * Representasi bagian What Next
   */
  export interface WhatNext {
    summary: string;
    encouragement: string;
  }

  /**
   * Schema response dari /api/generate-subtopic
   */
  export interface GenerateSubtopicResponse {
    objectives: string[];
    pages: SubtopicPage[];
    keyTakeaways: string[];
    quiz: QuizItem[];
    whatNext: WhatNext;
  }
}

export {};
