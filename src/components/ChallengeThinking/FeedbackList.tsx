// src/components/ChallengeThinking/FeedbackList.tsx
import React from 'react';
import styles from './FeedbackList.module.scss';

interface FeedbackListProps {
  feedback: string;
}

export default function FeedbackList({ feedback }: FeedbackListProps) {
  if (!feedback) return null;

  // Function to format feedback text with proper styling
  const formatFeedback = (text: string) => {
    // Check if the feedback appears to contain HTML tags
    if (/<\/?[a-z][\s\S]*>/i.test(text)) {
      // Render as HTML if it contains HTML tags
      return <div dangerouslySetInnerHTML={{ __html: text }} />;
    }

    // Split the text into paragraphs
    const paragraphs = text.split('\n');
    let result: React.ReactNode[] = [];

    paragraphs.forEach((paragraph, index) => {
      // Skip empty paragraphs
      if (!paragraph.trim()) return;

      // Check if it's a feedback section header
      if (/^(Feedback|Kekuatan Jawaban|Poin untuk Peningkatan|Konsep Inti|Strengths|Positif|Areas for Improvement|Clarity|Depth|Correctness|Improvements|Kelemahan)/i.test(paragraph)) {
        result.push(
          <h3 key={`header-${index}`} className={styles.feedbackHeader}>
            {paragraph.trim()}
          </h3>
        );
        return;
      }

      // Check for bold text with ** markers
      if (paragraph.includes('**')) {
        const parts = paragraph.split(/(\*\*.*?\*\*)/g);
        const formattedParts = parts.map((part, i) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={`bold-${i}`}>{part.slice(2, -2)}</strong>;
          }
          return part;
        });
        
        result.push(
          <p key={`formatted-${index}`} className={styles.feedbackParagraph}>
            {formattedParts}
          </p>
        );
        return;
      }

      // Check if it's a numbered item
      const numberedMatch = paragraph.match(/^(\d+)[\.\:\)]\s(.+)$/);
      if (numberedMatch) {
        const [, number, content] = numberedMatch;
        result.push(
          <div key={`num-${index}`} className={styles.numberedItem}>
            <span className={styles.itemNumber}>{number}.</span>
            <span className={styles.itemContent}>{content}</span>
          </div>
        );
        return;
      }

      // Check if it's a bullet point
      if (/^[\*\-\•]\s/.test(paragraph)) {
        const content = paragraph.replace(/^[\*\-\•]\s/, '');
        result.push(
          <div key={`bullet-${index}`} className={styles.bulletItem}>
            <span className={styles.bulletPoint}>•</span>
            <span className={styles.itemContent}>{content}</span>
          </div>
        );
        return;
      }

      // Regular paragraph
      result.push(<p key={`p-${index}`} className={styles.feedbackParagraph}>{paragraph}</p>);
    });

    return result;
  };

  // Determine feedback type for styling (positive/neutral/negative)
  const getFeedbackType = (text: string) => {
    const lowerText = text.toLowerCase();
    if (/good|excellent|great|well done|bagus|sangat baik|hebat|terima kasih/i.test(lowerText)) {
      return 'positive';
    }
    if (/incorrect|wrong|poor|needs improvement|salah|kurang/i.test(lowerText)) {
      return 'negative';
    }
    return 'neutral';
  };

  const feedbackType = getFeedbackType(feedback);

  return (
    <div className={`${styles.feedbackList} ${styles[feedbackType]}`}>
      <div className={styles.feedbackLabel}>
        <div className={styles.feedbackIcon}>
          {feedbackType === 'positive' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ) : feedbackType === 'negative' ? (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
        </div>
        <span>Feedback:</span>
      </div>
      <div className={styles.feedbackContent}>
        {formatFeedback(feedback)}
      </div>
    </div>
  );
}