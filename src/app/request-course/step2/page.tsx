// Path: src/app/request-course/step2/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestCourse } from '@/context/RequestCourseContext';
import styles from './page.module.scss';

export default function RequestCourseStep2() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();

  const [level, setLevel]             = useState(answers.level);
  const [extraTopics, setExtraTopics] = useState(answers.extraTopics);
  const [error, setError]             = useState('');

  const handleContinue = () => {
    if (!level) {
      setError('Please select your current knowledge level.');
      return;
    }
    setPartial({ level, extraTopics });
    router.push('/request-course/step3');
  };

  return (
    <div className={styles.wrapper}>
      <div className={styles.card}>
        <h1>Request a course</h1>

        <fieldset className={styles.group}>
          <legend>How would you rate your knowledge level in the topic?</legend>
          <label>
            <input
              type="radio"
              name="level"
              value="Beginner"
              checked={level === 'Beginner'}
              onChange={() => setLevel('Beginner')}
            />
            Beginner
          </label>
          <label>
            <input
              type="radio"
              name="level"
              value="Intermediate"
              checked={level === 'Intermediate'}
              onChange={() => setLevel('Intermediate')}
            />
            Intermediate
          </label>
          <label>
            <input
              type="radio"
              name="level"
              value="Advance"
              checked={level === 'Advance'}
              onChange={() => setLevel('Advance')}
            />
            Advance
          </label>
        </fieldset>

        <label className={styles.textareaLabel}>
          Specify topics you’d like the learning plan to cover (optional)
          <textarea
            placeholder="..."
            value={extraTopics}
            onChange={e => setExtraTopics(e.currentTarget.value)}
          />
        </label>

        {error && <p className={styles.error}>{error}</p>}

        <button onClick={handleContinue}>Continue</button>
      </div>
    </div>
  );
}
