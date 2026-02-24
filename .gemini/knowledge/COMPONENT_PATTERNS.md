# Component Patterns

Panduan untuk React component patterns di PrincipleLearn V3.

---

## 📁 File Structure

```
src/components/
├── admin/                    # Admin-specific components
│   ├── ActivityModal/
│   ├── JurnalModal/
│   └── TranscriptModal/
├── Quiz/                     # Quiz feature
│   ├── Quiz.tsx
│   └── Quiz.module.scss
├── ChallengeThinking/        # Challenge feature
│   ├── ChallengeThinking.tsx
│   └── ChallengeThinking.module.scss
├── AskQuestion/              # Q&A feature
├── Examples/                 # Examples display
├── FeedbackForm/             # Feedback feature
├── KeyTakeaways/             # Summary display
└── NextSubtopics/            # Navigation
```

---

## 🧱 Component Template

### Basic Client Component
```tsx
'use client';

import React, { useState, useEffect } from 'react';
import styles from './ComponentName.module.scss';

interface ComponentNameProps {
  // Required props
  courseId: string;
  subtopicId: string;
  
  // Optional props with defaults
  showTitle?: boolean;
  
  // Callbacks
  onComplete?: () => void;
  onError?: (error: string) => void;
}

export function ComponentName({
  courseId,
  subtopicId,
  showTitle = true,
  onComplete,
  onError,
}: ComponentNameProps) {
  // State
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<DataType | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Effects
  useEffect(() => {
    fetchData();
  }, [courseId, subtopicId]);

  // Handlers
  async function fetchData() {
    setLoading(true);
    try {
      const response = await fetch(`/api/endpoint?id=${courseId}`);
      const result = await response.json();
      
      if (result.success) {
        setData(result.data);
      } else {
        throw new Error(result.error);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      setError(message);
      onError?.(message);
    } finally {
      setLoading(false);
    }
  }

  // Render helpers
  if (loading) {
    return <div className={styles.loading}>Loading...</div>;
  }

  if (error) {
    return <div className={styles.error}>{error}</div>;
  }

  return (
    <div className={styles.container}>
      {showTitle && <h2 className={styles.title}>Title</h2>}
      {/* Component content */}
    </div>
  );
}
```

### Server Component (for static content)
```tsx
// No 'use client' directive
import styles from './ServerComponent.module.scss';

interface Props {
  title: string;
  content: string;
}

export async function ServerComponent({ title, content }: Props) {
  return (
    <div className={styles.container}>
      <h1>{title}</h1>
      <div dangerouslySetInnerHTML={{ __html: content }} />
    </div>
  );
}
```

---

## 🎨 Styling (Sass Modules)

### Basic Structure
```scss
// ComponentName.module.scss

.container {
  padding: 1.5rem;
  background: var(--bg-primary);
  border-radius: 8px;
}

.title {
  font-size: 1.25rem;
  font-weight: 600;
  margin-bottom: 1rem;
  color: var(--text-primary);
}

.loading {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  color: var(--text-secondary);
}

.error {
  padding: 1rem;
  background: var(--error-bg);
  color: var(--error-text);
  border-radius: 4px;
}

// States
.active {
  border-color: var(--accent);
}

.disabled {
  opacity: 0.5;
  pointer-events: none;
}

// Responsive
@media (max-width: 768px) {
  .container {
    padding: 1rem;
  }
}
```

### Conditional Classes
```tsx
import styles from './Component.module.scss';

function Component({ isActive, isDisabled }) {
  return (
    <div 
      className={`
        ${styles.container}
        ${isActive ? styles.active : ''}
        ${isDisabled ? styles.disabled : ''}
      `.trim()}
    >
      Content
    </div>
  );
}
```

---

## 🔄 Common Patterns

### Loading State
```tsx
const [loading, setLoading] = useState(false);

if (loading) {
  return (
    <div className={styles.loadingContainer}>
      <div className={styles.spinner} />
      <span>Memuat...</span>
    </div>
  );
}
```

### Error Handling
```tsx
const [error, setError] = useState<string | null>(null);

if (error) {
  return (
    <div className={styles.errorContainer}>
      <p className={styles.errorMessage}>{error}</p>
      <button onClick={() => setError(null)}>Coba Lagi</button>
    </div>
  );
}
```

### Form Submission
```tsx
async function handleSubmit(e: React.FormEvent) {
  e.preventDefault();
  setLoading(true);
  setError(null);

  try {
    const response = await fetch('/api/endpoint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error);
    }

    // Handle success
    onSuccess?.(result.data);
  } catch (err) {
    setError(err instanceof Error ? err.message : 'Terjadi kesalahan');
  } finally {
    setLoading(false);
  }
}
```

### Optimistic Updates
```tsx
async function handleToggle() {
  // Optimistic update
  const previousValue = isCompleted;
  setIsCompleted(!isCompleted);

  try {
    await fetch('/api/progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtopicId, completed: !previousValue }),
    });
  } catch (error) {
    // Revert on error
    setIsCompleted(previousValue);
  }
}
```

---

## 🎛️ Feature Components

### Quiz Component Pattern
```tsx
// components/Quiz/Quiz.tsx
'use client';

import { useState } from 'react';
import styles from './Quiz.module.scss';

interface QuizProps {
  quizId: string;
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  onSubmit?: (isCorrect: boolean) => void;
}

export function Quiz({
  quizId,
  question,
  options,
  correctAnswer,
  explanation,
  onSubmit,
}: QuizProps) {
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const isCorrect = selectedAnswer === correctAnswer;

  async function handleSubmit() {
    if (!selectedAnswer) return;
    
    setLoading(true);
    try {
      await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quizId, answer: selectedAnswer }),
      });
      
      setSubmitted(true);
      onSubmit?.(isCorrect);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.quiz}>
      <h3 className={styles.question}>{question}</h3>
      
      <div className={styles.options}>
        {options.map((option, index) => (
          <button
            key={index}
            className={`
              ${styles.option}
              ${selectedAnswer === option ? styles.selected : ''}
              ${submitted && option === correctAnswer ? styles.correct : ''}
              ${submitted && selectedAnswer === option && !isCorrect ? styles.incorrect : ''}
            `}
            onClick={() => !submitted && setSelectedAnswer(option)}
            disabled={submitted}
          >
            {option}
          </button>
        ))}
      </div>

      {!submitted ? (
        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!selectedAnswer || loading}
        >
          {loading ? 'Mengirim...' : 'Submit Jawaban'}
        </button>
      ) : (
        <div className={styles.explanation}>
          <p className={isCorrect ? styles.correctText : styles.incorrectText}>
            {isCorrect ? '✓ Benar!' : '✗ Salah'}
          </p>
          <p>{explanation}</p>
        </div>
      )}
    </div>
  );
}
```

### Modal Component Pattern
```tsx
// components/admin/ActivityModal/ActivityModal.tsx
'use client';

import { useEffect } from 'react';
import styles from './ActivityModal.module.scss';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export function Modal({ isOpen, onClose, title, children }: ModalProps) {
  // Close on Escape
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={e => e.stopPropagation()}>
        <div className={styles.header}>
          <h2>{title}</h2>
          <button className={styles.closeBtn} onClick={onClose}>×</button>
        </div>
        <div className={styles.content}>
          {children}
        </div>
      </div>
    </div>
  );
}
```

---

## 🪝 Custom Hooks Usage

### useAuth
```tsx
import { useAuth } from '@/hooks/useAuth';

function ProtectedComponent() {
  const { user, isLoading, isAuthenticated, logout } = useAuth();

  if (isLoading) return <LoadingSpinner />;
  if (!isAuthenticated) return <LoginPrompt />;

  return (
    <div>
      <p>Welcome, {user.name}!</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
```

### Custom Data Fetching Hook
```tsx
// hooks/useCourse.ts
import { useState, useEffect } from 'react';

export function useCourse(courseId: string) {
  const [course, setCourse] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchCourse() {
      try {
        const res = await fetch(`/api/courses/${courseId}`);
        const data = await res.json();
        if (data.success) {
          setCourse(data.data);
        } else {
          throw new Error(data.error);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchCourse();
  }, [courseId]);

  return { course, loading, error };
}
```

---

## ✅ Best Practices

1. **Gunakan 'use client' hanya jika diperlukan**
   - Interactivity (useState, useEffect)
   - Browser APIs
   - Event handlers

2. **Props Interface selalu di atas component**

3. **Destructure props di function signature**

4. **Handle loading, error, dan empty states**

5. **Gunakan semantic HTML**

6. **Accessibility considerations**
   - aria-labels
   - keyboard navigation
   - focus management

---

*Last updated: February 2026*
