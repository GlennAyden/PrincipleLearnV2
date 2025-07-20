// Path: src/app/request-course/step3/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestCourse } from '../../../context/RequestCourseContext';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import styles from './page.module.scss';
import { Level } from '@/context/RequestCourseContext';

interface ModuleOutline {
  module: string;
  subtopics: string[];
}
interface Course {
  id: string;
  title: string;
  level: Level;
  outline: ModuleOutline[];
}

const LOADING_PHRASES = [
  'Thinking through the perfect plan...',
  'Crunching the learning modules...',
  'Tailoring to your needs...',
  'Polishing the details...',
  'Almost there...',
];

export default function RequestCourseStep3() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();
  const [courses, setCourses] = useLocalStorage<Course[]>('pl_courses', []);
  const [user] = useLocalStorage<{ email: string } | null>('pl_user', null);

  const [problem, setProblem] = useState(answers.problem);
  const [assumption, setAssumption] = useState(answers.assumption);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [percent, setPercent] = useState(0);
  const [phraseIdx, setPhraseIdx] = useState(0);

  const percentRef = useRef(0);
  const phraseRef = useRef(0);

  useEffect(() => {
    let progInterval: number;
    let phraseInterval: number;

    if (loading && typeof window !== 'undefined') {
      progInterval = window.setInterval(() => {
        percentRef.current = Math.min(99, percentRef.current + Math.random() * 10);
        setPercent(Math.floor(percentRef.current));
      }, 500);

      phraseInterval = window.setInterval(() => {
        phraseRef.current = (phraseRef.current + 1) % LOADING_PHRASES.length;
        setPhraseIdx(phraseRef.current);
      }, 3000);
    }

    return () => {
      clearInterval(progInterval);
      clearInterval(phraseInterval);
    };
  }, [loading]);

  const handleGenerate = async () => {
    if (!problem.trim() || !assumption.trim()) {
      setError('Please fill both fields');
      return;
    }
    
    if (!user || !user.email) {
      setError('You must be logged in to generate a course');
      return;
    }
    
    setError('');
    setPartial({ problem, assumption });
    setLoading(true);
    setPercent(0);
    percentRef.current = 0;
    phraseRef.current = 0;
    setPhraseIdx(0);

    try {
      console.log('Generating course with user:', user.email);
      
      const res = await fetch('/api/generate-course', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ 
          ...answers, 
          problem, 
          assumption,
          userId: user.email // Add the user's email as userId
        }),
      });
      
      console.log('API Response Status:', res.status);
      console.log('API Response Headers:', res.headers.get('content-type'));
      
      // Check if response is actually JSON
      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await res.text();
        console.error('Non-JSON response received:', textResponse);
        
        // Handle specific error cases
        if (res.status === 504) {
          throw new Error('Course generation timed out. Please try again with a simpler topic or goal.');
        } else if (res.status === 500) {
          throw new Error('Server error occurred. Please try again in a moment.');
        } else {
          throw new Error(`Server returned non-JSON response. Status: ${res.status}. Please try again.`);
        }
      }
      
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);

      const outline = data.outline as ModuleOutline[];
      const newCourse: Course = {
        id: Date.now().toString(),
        title: answers.topic,
        level: answers.level as Level,
        outline,
      };
      setCourses([...courses, newCourse]);

      // Log the successful course generation
      try {
        const logRes = await fetch('/api/generate-course/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user.email,
            courseName: answers.topic,
            parameter: JSON.stringify({
              topic: answers.topic,
              goal: answers.goal,
              level: answers.level,
              extraTopics: answers.extraTopics,
              problem,
              assumption
            })
          })
        });
        
        if (!logRes.ok) {
          console.error('Failed to log course generation:', await logRes.json());
        } else {
          console.log('Course generation logged successfully');
        }
      } catch (logErr) {
        console.error('Error logging course generation:', logErr);
      }

      setPercent(100);
      setTimeout(() => router.push('/dashboard'), 300);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.wrapper}>
        <div className={styles.loadingCard}>
          <div className={styles.progressBar}>
            <div className={styles.progressFill} style={{ width: `${percent}%` }} />
          </div>
          <p className={styles.percentText}>{percent}%</p>
          <p className={styles.phrase}>{LOADING_PHRASES[phraseIdx]}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Request a course</h1>

        <label className={styles.textareaLabel}>
          Name one real-world problem you want to solve by studying this.
          <textarea
            placeholder="..."
            value={problem}
            onChange={(e) => setProblem(e.currentTarget.value)}
          />
        </label>

        <label className={styles.textareaLabel}>
          What was your initial assumption about this material before you started learning?
          <textarea
            placeholder="..."
            value={assumption}
            onChange={(e) => setAssumption(e.currentTarget.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button onClick={handleGenerate}>Generate</button>
      </div>
    </div>
  );
}
