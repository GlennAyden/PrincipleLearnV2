// src/components/AskQuestion/AnswerList.tsx
import React from 'react';
import styles from './AnswerList.module.scss';

interface QAItem {
  question: string;
  answer: string;
}

interface AnswerListProps {
  qaList: QAItem[];
}

export default function AnswerList({ qaList }: AnswerListProps) {
  if (!qaList.length) return null;

  // Function to safely render HTML content
  const createMarkup = (html: string) => {
    return { __html: html };
  };

  // Function to format the answer with proper structure
  const formatAnswer = (text: string) => {
    if (!text) return null;

    // Check if the answer appears to contain HTML tags
    if (/<\/?[a-z][\s\S]*>/i.test(text)) {
      // Render as HTML if it contains HTML tags
      return <div dangerouslySetInnerHTML={createMarkup(text)} />;
    }

    // Split the text into paragraphs
    const paragraphs = text.split('\n');
    let inList = false;
    let listItems: React.ReactNode[] = [];
    const result: React.ReactNode[] = [];

    paragraphs.forEach((paragraph, index) => {
      // Skip empty paragraphs
      if (!paragraph.trim()) {
        if (inList) {
          // End the current list if we encounter an empty line
          result.push(
            <ul key={`list-${index}`} className={styles.formattedList}>
              {listItems}
            </ul>
          );
          listItems = [];
          inList = false;
        }
        return;
      }

      // Check if it's a numbered item (like "1. Something")
      const numberedMatch = paragraph.match(/^(\d+)\.\s(.+)$/);
      if (numberedMatch) {
        const [, number, content] = numberedMatch;
        
        // Check if this is a framework item like 5W+1H
        if (content.includes('**What') || 
            content.includes('**Why') || 
            content.includes('**Who') || 
            content.includes('**When') || 
            content.includes('**Where') || 
            content.includes('**How')) {
          // Format as a framework item
          const parts = content.split('**');
          
          result.push(
            <div key={index} className={styles.frameworkItem}>
              <span className={styles.frameworkNumber}>{number}.</span>
              <span className={styles.frameworkType}>{parts[1]}</span>
              <span className={styles.frameworkContent}>{parts.slice(2).join('')}</span>
            </div>
          );
        } else {
          // Regular numbered item
          result.push(
            <div key={index} className={styles.numberedItem}>
              <span className={styles.itemNumber}>{number}.</span>
              <span className={styles.itemContent}>{content}</span>
            </div>
          );
        }
        return;
      }
      
      // Check if it's a bullet point
      if (/^[\*\-\•]\s/.test(paragraph)) {
        if (!inList) {
          inList = true;
          listItems = [];
        }
        
        const content = paragraph.replace(/^[\*\-\•]\s/, '');
        listItems.push(
          <li key={`item-${index}`} className={styles.bulletItem}>
            {content}
          </li>
        );
        return;
      }
      
      // If we were in a list but this isn't a list item, end the list
      if (inList) {
        result.push(
          <ul key={`list-${index}`} className={styles.formattedList}>
            {listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
      
      // Check if it looks like a heading or section title
      if (/^\*\*.+\*\*:?$/.test(paragraph) || /^##.+##$/.test(paragraph)) {
        const heading = paragraph
          .replace(/^\*\*|\*\*:?$/g, '')
          .replace(/^##|##$/g, '')
          .trim();
          
        result.push(
          <div key={index} className={styles.headingItem}>
            {heading}
          </div>
        );
        return;
      }
      
      // Regular paragraph
      result.push(<p key={index} className={styles.paragraphItem}>{paragraph}</p>);
    });

    // If we ended with an open list, close it
    if (inList && listItems.length > 0) {
      result.push(
        <ul key="final-list" className={styles.formattedList}>
          {listItems}
        </ul>
      );
    }

    return result;
  };

  return (
    <div className={styles.answerList}>
      {qaList.map((qa, idx) => (
        <div key={idx} className={styles.answerItem}>
          <div className={styles.questionSection}>
            <span className={styles.bullet}>●</span>
            <p className={styles.questionLabel}>Pertanyaan :</p>
            <p className={styles.questionText}>{qa.question}</p>
          </div>
          <div className={styles.answerSection}>
            <span className={styles.bullet}>●</span>
            <p className={styles.answerLabel}>Jawaban :</p>
            <div className={styles.answerText}>
              {formatAnswer(qa.answer)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
