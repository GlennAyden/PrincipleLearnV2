// Path: src/app/request-course/step1/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestCourse } from '@/context/RequestCourseContext';
import styles from './page.module.scss';

export default function Step1() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();

  const [topic, setTopic] = useState(answers.topic);
  const [goal, setGoal]   = useState(answers.goal);
  const [err, setErr]     = useState('');

  const continueToStep2 = () => {
    if (!topic.trim() || !goal.trim()) {
      setErr('Please fill both fields');
      return;
    }
    setPartial({ topic, goal });
    router.push('/request-course/step2');
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Request a course</h1>
        <label>
          What I want to learn?
          <input
            type="text"
            placeholder="..."
            value={topic}
            onChange={e => setTopic(e.target.value)}
          />
        </label>
        <label>
          What do you want to achieve by learning this?
          <textarea
            placeholder="..."
            value={goal}
            onChange={e => setGoal(e.target.value)}
          />
        </label>
        {err && <p className={styles.error}>{err}</p>}
        <button onClick={continueToStep2}>Continue</button>
      </div>
    </div>
  );
}
