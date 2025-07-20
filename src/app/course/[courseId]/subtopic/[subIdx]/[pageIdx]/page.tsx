// src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { useLocalStorage } from '@/hooks/useLocalStorage';
import QuestionBox from '@/components/AskQuestion/QuestionBox';
import AnswerList from '@/components/AskQuestion/AnswerList';
import ChallengeBox from '@/components/ChallengeThinking/ChallengeBox';
import FeedbackList from '@/components/ChallengeThinking/FeedbackList';
import ExampleList from '@/components/Examples/ExampleList';
import KeyTakeaways from '@/components/KeyTakeaways/KeyTakeaways';
import Quiz from '@/components/Quiz/Quiz';
import WhatNext from '@/components/WhatNext/WhatNext';
import FeedbackForm from '@/components/FeedbackForm/FeedbackForm';
import NextSubtopics from '@/components/NextSubtopics/NextSubtopics';
import styles from './page.module.scss';

interface SubtopicResponse {
  objectives: string[];
  pages: { title: string; paragraphs: string[] }[];
  keyTakeaways: string[];
  quiz: { question: string; options: string[]; correctIndex: number }[];
  whatNext: { summary: string; encouragement: string };
}

// Challenge history item interface
interface ChallengeItem {
  question: string;
  answer: string;
  feedback?: string;
}

// Skeleton loading component for subtopic content
const SkeletonLoading = () => {
  return (
    <div className={styles.skeletonContainer}>
      {/* Progress bar */}
      <div className={styles.progressBar}>
        {Array.from({ length: 7 }).map((_, i) => (
          <span
            key={i}
            className={`${styles.progressStep} ${i === 0 ? styles.activeStep : ''}`}
          />
        ))}
      </div>
      
      {/* Title skeleton */}
      <div className={styles.skeletonTitle}></div>
      
      {/* Content skeletons - updated to 5 paragraphs */}
      <div className={styles.skeletonContent}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={styles.skeletonParagraph}></div>
        ))}
      </div>
      
      {/* Interactive buttons skeleton */}
      <div className={styles.skeletonButtonsContainer}>
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className={styles.skeletonButton}></div>
        ))}
      </div>
      
      {/* Navigation buttons */}
      <div className={styles.navigationButtons}>
        <div className={styles.skeletonNavButton}></div>
      </div>
    </div>
  );
};

export default function SubtopicPage() {
  const router = useRouter();
  // Cast params to ensure courseId, subIdx, pageIdx are strings
  const { courseId, subIdx: pathSubIdx, pageIdx: pathPageIdx } =
    useParams() as { courseId: string; subIdx: string; pageIdx: string };
  const searchParams = useSearchParams();

  // Parse numeric indices
  const moduleIndex = Number(pathSubIdx);
  const pageNumber = Number(pathPageIdx);
  const subtopicIndex = (() => {
    const s = searchParams.get('subIdx');
    return s !== null && !isNaN(Number(s)) ? Number(s) : 0;
  })();

  const keyBase = `pl-${courseId}-${moduleIndex}-${subtopicIndex}-${pageNumber}`;

  const [askData, setAskData] = useLocalStorage<{ question: string; answer: string }[]>(
    `${keyBase}-ask`,
    []
  );
  
  // Replace single question/feedback with an array of challenges
  const [challengeData, setChallengeData] = useLocalStorage<ChallengeItem[]>(
    `${keyBase}-challenge-data`,
    []
  );
  const [challengeQ, setChallengeQ] = useState<string>('');
  const [challengeAnswer, setChallengeAnswer] = useState<string>('');
  const [challengeFeedback, setChallengeFeedback] = useState<string>('');
  const [activeChallengeIndex, setActiveChallengeIndex] = useState<number>(-1);

  const [examplesData, setExamplesData] = useLocalStorage<string[]>(
    `${keyBase}-examples`,
    []
  );
  const [activeExampleIndex, setActiveExampleIndex] = useState<number>(0);

  const [activeTab, setActiveTab] = useState<'ask' | 'challenge' | 'examples' | null>(
    null
  );
  
  const [loadingChallenge, setLoadingChallenge] = useState<boolean>(false);
  const [loadingExamples, setLoadingExamples] = useState(false);

  const [courses, setCourses] = useLocalStorage<any[]>('pl_courses', []);
  const course = courses.find((c) => c.id === courseId) || null;
  const [data, setData] = useState<SubtopicResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (!course?.outline) return;
    const moduleInfo = course.outline[moduleIndex];
    const subInfo = moduleInfo?.subtopics?.[subtopicIndex];
    if (!moduleInfo || !subInfo) {
      setError('Invalid module or subtopic');
      return;
    }
    const moduleTitle = moduleInfo.module;
    const subTitle = typeof subInfo === 'string' ? subInfo : subInfo.title;
    const cached =
      (course as any).subtopicDetails?.[moduleIndex]?.[subtopicIndex] ?? null;
    if (cached) {
      setData(cached);
      return;
    }

    async function loadSubtopic() {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/generate-subtopic', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ module: moduleTitle, subtopic: subTitle }),
        });
        if (!res.ok) throw new Error('Failed to load subtopic');
        const json = (await res.json()) as SubtopicResponse;
        setData(json);

        const updated = [...courses];
        const idx = updated.findIndex((c) => c.id === course.id);
        if (idx !== -1) {
          const prev = updated[idx].subtopicDetails || {};
          const modCache = prev[moduleIndex] || {};
          updated[idx] = {
            ...updated[idx],
            subtopicDetails: {
              ...prev,
              [moduleIndex]: { ...modCache, [subtopicIndex]: json },
            },
          };
          setCourses(updated);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    loadSubtopic();
  }, [course, moduleIndex, subtopicIndex, courses, setCourses]);

  // Initialize challenge question when opening the tab
  useEffect(() => {
    if (activeTab === 'challenge' && challengeData.length === 0 && !challengeQ) {
      fetchChallengeQ();
    }
  }, [activeTab]);

  // Load challenge history from localStorage on initial render
  useEffect(() => {
    const savedChallenges = localStorage.getItem(`challenges-${courseId}-${moduleIndex}-${subtopicIndex}-${pageNumber}`);
    if (savedChallenges) {
      try {
        const parsedData = JSON.parse(savedChallenges);
        setChallengeData(parsedData);
      } catch (e) {
        console.error('Error parsing saved challenges:', e);
      }
    }
  }, [courseId, moduleIndex, subtopicIndex, pageNumber]);

  if (!course) return <div className={styles.loading}>Loading course…</div>;
  if (loading && !data) return <SkeletonLoading />;
  if (error) return <div className={styles.error}>Error: {error}</div>;
  if (!data) return <div className={styles.error}>No content available.</div>;

  const contentCount = data.pages.length;
  const feedbackStep = contentCount + 2;

  const goNext = () => {
    if (pageNumber < feedbackStep) {
      router.push(
        `/course/${courseId}/subtopic/${moduleIndex}/${pageNumber + 1}?module=${moduleIndex}&subIdx=${subtopicIndex}`
      );
    } else {
      router.push(`/course/${courseId}?module=${moduleIndex}`);
    }
  };
  const goBack = () => {
    if (pageNumber > 0) {
      router.push(
        `/course/${courseId}/subtopic/${moduleIndex}/${pageNumber - 1}?module=${moduleIndex}&subIdx=${subtopicIndex}`
      );
    }
  };

  // Function to select a challenge from history
  const selectChallengeItem = (index: number) => {
    setActiveChallengeIndex(index);
    // Clear the current challenge if viewing history
    setChallengeQ('');
    setChallengeAnswer('');
    setChallengeFeedback('');
  };

  // Generate a challenge question
  const fetchChallengeQ = async () => {
    setLoadingChallenge(true);
    setChallengeQ('');
    setChallengeAnswer('');
    setChallengeFeedback('');
    setActiveChallengeIndex(-1);
    
    try {
      const response = await fetch('/api/challenge-thinking', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          context: data.pages[pageNumber].paragraphs.join(' '),
          level: course.level || 'intermediate',
        }),
      });
      
      if (!response.ok) throw new Error('Failed to fetch challenge question');
      
      const responseData = await response.json();
      setChallengeQ(responseData.question);
    } catch (error) {
      console.error('Error fetching challenge question:', error);
    } finally {
      setLoadingChallenge(false);
    }
  };

  // Handle challenge answer submission
  const handleChallengeSubmit = async () => {
    if (!challengeAnswer.trim() || !challengeQ || loadingChallenge) return;
    
    setLoadingChallenge(true);
    
    try {
      const response = await fetch('/api/challenge-feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          question: challengeQ,
          answer: challengeAnswer,
          context: data.pages[pageNumber].paragraphs.join(' '),
          level: course.level || 'intermediate',
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get feedback');
      
      const responseData = await response.json();
      setChallengeFeedback(responseData.feedback);
      
      // Save to challenge history
      const newChallengeData = [
        ...challengeData, 
        {
          question: challengeQ,
          answer: challengeAnswer,
          feedback: responseData.feedback
        }
      ];
      setChallengeData(newChallengeData);
      
      // Save to localStorage
      localStorage.setItem(
        `challenges-${courseId}-${moduleIndex}-${subtopicIndex}-${pageNumber}`, 
        JSON.stringify(newChallengeData)
      );
    } catch (error) {
      console.error('Error submitting challenge:', error);
    } finally {
      setLoadingChallenge(false);
    }
  };

  const fetchExamples = async () => {
    setLoadingExamples(true);
    try {
      const res = await fetch('/api/generate-examples', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          context: data.pages[pageNumber].paragraphs.join(' '),
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text);
      const { examples } = JSON.parse(text) as { examples: string[] };
      
      // Add new example to history and set it as active
      const updatedExamples = [...examplesData, ...examples]; 
      setExamplesData(updatedExamples);
      setActiveExampleIndex(updatedExamples.length - 1); // Select the newest example
    } catch (e: any) {
      console.error(e);
      alert('Gagal generate contoh: ' + e.message);
    } finally {
      setLoadingExamples(false);
    }
  };

  // Function to navigate to the next example in history
  const nextExample = () => {
    if (examplesData.length > 1 && activeExampleIndex < examplesData.length - 1) {
      setActiveExampleIndex(activeExampleIndex + 1);
    }
  };

  // Function to navigate to the previous example in history
  const prevExample = () => {
    if (examplesData.length > 1 && activeExampleIndex > 0) {
      setActiveExampleIndex(activeExampleIndex - 1);
    }
  };

  return (
    <>
      {/* Progress */}
      <div className={styles.progressBar}>
        {Array.from({ length: contentCount + 3 }).map((_, i) => (
          <span
            key={i}
            className={`${styles.progressStep} ${i <= pageNumber ? styles.activeStep : ''}`}
          />
        ))}
      </div>

      {/* Materi */}
      {pageNumber < contentCount && (
        <>
          <h2 className={styles.topicTitle}>{data.pages[pageNumber].title}</h2>
          {data.pages[pageNumber].paragraphs.map((p, idx) => (
            <p key={idx} className={styles.pageParagraph}>
              {p}
            </p>
          ))}

          {/* Interaktif */}
          {activeTab === null ? (
            <div className={styles.initialButtons}>
              <button className={styles.initialBtn} onClick={() => setActiveTab('ask')}>
                Ask Question
              </button>
              <button
                className={styles.initialBtn}
                onClick={() => {
                  setActiveTab('challenge');
                  if (!challengeQ) fetchChallengeQ();
                }}
              >
                Challenge My Thinking
              </button>
              <button
                className={styles.initialBtn}
                onClick={() => {
                  setActiveTab('examples');
                  if (!examplesData.length) fetchExamples();
                }}
              >
                Give Me Examples
              </button>
            </div>
          ) : (
            <div className={styles.cardContainer}>
              <button className={styles.closeBtn} onClick={() => setActiveTab(null)}>
                ×
              </button>
              <div className={styles.tabNav}>
                <button
                  className={`${styles.tab} ${activeTab === 'ask' ? styles.activeTab : ''}`}
                  onClick={() => setActiveTab('ask')}
                >
                  Ask Question
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'challenge' ? styles.activeTab : ''}`}
                  onClick={() => {
                    setActiveTab('challenge');
                    if (!challengeQ) fetchChallengeQ();
                  }}
                >
                  Challenge My Thinking
                </button>
                <button
                  className={`${styles.tab} ${activeTab === 'examples' ? styles.activeTab : ''}`}
                  onClick={() => {
                    setActiveTab('examples');
                    if (!examplesData.length) fetchExamples();
                  }}
                >
                  Give Me Examples
                </button>
              </div>
              <div className={styles.tabContent}>
                {activeTab === 'ask' && (
                  <>
                    {askData.length > 0 && <AnswerList qaList={askData} />}
                    <QuestionBox
                      context={data.pages[pageNumber].paragraphs.join(' ')}
                      onAnswer={(q, a) => setAskData([...askData, { question: q, answer: a }])}
                      courseId={courseId}
                      subtopic={`Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`}
                    />
                  </>
                )}
                {activeTab === 'challenge' && (
                  <>
                    {/* Show challenge history if available */}
                    {challengeData.length > 0 && (
                      <div className={styles.challengeHistory}>
                        <h3 className={styles.historyTitle}>Previous Challenges:</h3>
                        <div className={styles.historyList}>
                          {challengeData.map((item, idx) => (
                            <div 
                              key={idx}
                              onClick={() => selectChallengeItem(idx)}
                              className={`${styles.historyItem} ${activeChallengeIndex === idx ? styles.activeHistoryItem : ''}`}
                            >
                              <div className={styles.historyQuestion}>
                                <span className={styles.historyNumber}>{idx + 1}</span>
                                <span className={styles.historyText}>{item.question}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {/* If a history item is selected, show its details */}
                    {activeChallengeIndex >= 0 && challengeData[activeChallengeIndex] && (
                      <div className={styles.challengeReview}>
                        <ChallengeBox question={challengeData[activeChallengeIndex].question} />
                        <div className={styles.challengeAnswer}>
                          <div className={styles.answerLabel}>Your Answer:</div>
                          <div className={styles.answerContent}>{challengeData[activeChallengeIndex].answer}</div>
                        </div>
                        {challengeData[activeChallengeIndex].feedback && (
                          <FeedbackList feedback={challengeData[activeChallengeIndex].feedback!} />
                        )}
                        <button 
                          onClick={() => setActiveChallengeIndex(-1)} 
                          className={styles.newChallengeBtn}
                        >
                          Try a New Challenge
                        </button>
                      </div>
                    )}
                    
                    {/* Show current challenge question if not viewing history */}
                    {activeChallengeIndex < 0 && (
                      <>
                        {challengeQ ? (
                          <>
                            <ChallengeBox question={challengeQ} />
                            <div className={styles.challengeActions}>
                              <button 
                                className={styles.regenerateBtn} 
                                onClick={fetchChallengeQ} 
                                disabled={loadingChallenge}
                                title="Generate a new challenge question"
                              >
                                {loadingChallenge ? (
                                  <span className={styles.loadingSpinner}></span>
                                ) : (
                                  <>
                                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                    </svg>
                                    <span>Regenerate</span>
                                  </>
                                )}
                              </button>
                              <div className={styles.answerInputContainer}>
                                <input
                                  type="text"
                                  value={challengeAnswer}
                                  onChange={(e) => setChallengeAnswer(e.target.value)}
                                  placeholder="Type your answer here..."
                                  className={styles.answerInput}
                                  disabled={loadingChallenge}
                                />
                                <button 
                                  onClick={handleChallengeSubmit} 
                                  disabled={loadingChallenge || !challengeAnswer.trim()}
                                  className={styles.submitButton}
                                >
                                  Submit
                                </button>
                              </div>
                            </div>
                          </>
                        ) : (
                          <div className={styles.loadingContainer}>
                            {loadingChallenge ? (
                              <span className={styles.loadingMessage}>Sedang menyiapkan pertanyaan...</span>
                            ) : (
                              <>
                                {challengeData.length > 0 ? (
                                  <button onClick={fetchChallengeQ} className={styles.startChallengeBtn}>
                                    Buat Pertanyaan Baru
                                  </button>
                                ) : (
                                  <button onClick={fetchChallengeQ} className={styles.startChallengeBtn}>
                                    Generate Pertanyaan
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
                {activeTab === 'examples' && (
                  <>
                    <ExampleList 
                      examples={examplesData.length > 0 ? [examplesData[activeExampleIndex]] : []} 
                      onRegenerate={fetchExamples}
                      isLoading={loadingExamples}
                      onPrev={examplesData.length > 1 && activeExampleIndex > 0 ? prevExample : undefined}
                      onNext={examplesData.length > 1 && activeExampleIndex < examplesData.length - 1 ? nextExample : undefined}
                      exampleNumber={activeExampleIndex + 1}
                      totalExamples={examplesData.length}
                    />
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Key Takeaways */}
      {pageNumber === contentCount && <KeyTakeaways items={data.keyTakeaways} />}

      {/* Quiz */}
      {pageNumber === contentCount + 1 && (
        <Quiz 
          questions={data.quiz} 
          courseId={courseId}
          subtopic={`Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`}
        />
      )}

      {/* WhatNext + FeedbackForm + NextSubtopics */}
      {pageNumber === contentCount + 2 && (
        <>
          <WhatNext
            summary={data.whatNext.summary}
            encouragement={data.whatNext.encouragement}
          />
          <FeedbackForm
            subtopicId={courseId}
            moduleIndex={moduleIndex}
            subtopicIndex={subtopicIndex}
            courseId={courseId}
          />
          <NextSubtopics
            items={course.outline[moduleIndex].subtopics}
            moduleIndex={moduleIndex}
          />
        </>
      )}

      {/* Navigation */}
      <div className={styles.navigationButtons}>
        {pageNumber > 0 && (
          <button className={styles.backBtn} onClick={goBack}>
            Back
          </button>
        )}
        <button className={styles.nextBtn} onClick={goNext}>
          {pageNumber === feedbackStep ? 'Finish' : 'Next'}
        </button>
      </div>
    </>
  );
}
