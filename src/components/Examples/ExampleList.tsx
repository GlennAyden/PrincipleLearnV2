// src/components/Examples/ExampleList.tsx
import React from 'react';
import styles from './ExampleList.module.scss';

interface ExampleListProps {
  examples: string[];
  onRegenerate?: () => void;
  isLoading?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  exampleNumber?: number;
  totalExamples?: number;
}

export default function ExampleList({ 
  examples, 
  onRegenerate, 
  isLoading = false,
  onPrev,
  onNext,
  exampleNumber = 1,
  totalExamples = 1
}: ExampleListProps) {
  if (!examples || examples.length === 0) {
    return null;
  }

  // Get the first example since we're only showing one at a time
  const example = examples[0];

  return (
    <div className={styles.examplesListContainer}>
      <div className={styles.exampleItem}>
        <div className={styles.exampleHeader}>
          <span className={styles.exampleNumber}>
            Contoh:
          </span>
          {totalExamples > 1 && (
            <span className={styles.exampleCounter}>
              {exampleNumber} dari {totalExamples}
            </span>
          )}
        </div>
        <div className={styles.exampleContent}>
          {example}
        </div>
      </div>
      
      <div className={styles.navigationContainer}>
        {onPrev && (
          <button 
            onClick={onPrev} 
            className={styles.navButton}
            title="Contoh sebelumnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 18l-6-6 6-6"/>
            </svg>
          </button>
        )}
        
        {onRegenerate && (
          <button 
            onClick={onRegenerate} 
            className={styles.regenerateButton}
            disabled={isLoading}
            title="Dapatkan contoh baru"
          >
            {isLoading ? (
              <span className={styles.loadingIcon}></span>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2"/>
              </svg>
            )}
          </button>
        )}
        
        {onNext && (
          <button 
            onClick={onNext} 
            className={styles.navButton}
            title="Contoh selanjutnya"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}
