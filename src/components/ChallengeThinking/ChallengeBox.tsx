// src/components/ChallengeThinking/ChallengeBox.tsx
import React from 'react';
import styles from './ChallengeBox.module.scss';

interface ChallengeBoxProps {
  question: string;
}

export default function ChallengeBox({ question }: ChallengeBoxProps) {
  if (!question) return null;
  
  return (
    <div className={styles.challengeBoxContainer}>
      <div className={styles.questionIcon}>
        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </div>
      <div className={styles.questionContent}>
        <h3 className={styles.title}>Pertanyaan:</h3>
        <p className={styles.challengeQuestion}>{question}</p>
      </div>
    </div>
  );
}
