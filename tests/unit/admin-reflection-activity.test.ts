import {
  buildReflectionActivities,
  filterReflectionActivities,
} from '@/lib/admin-reflection-activity'

describe('admin reflection activity merge', () => {
  it('merges jurnal and feedback rows for the same reflection submission', () => {
    const activities = buildReflectionActivities({
      journals: [
        {
          id: 'journal-1',
          user_id: 'user-1',
          course_id: 'course-1',
          content: JSON.stringify({
            understood: 'Saya memahami konsep inti.',
            confused: 'Bagian contoh masih membingungkan.',
            strategy: 'Saya akan mengulang dan mencoba lagi.',
            promptEvolution: 'Prompt saya jadi lebih spesifik.',
            contentRating: 4,
            contentFeedback: 'Materinya membantu.',
          }),
          reflection: JSON.stringify({
            subtopic: 'Bab 1',
            moduleIndex: 0,
            subtopicIndex: 1,
            subtopicId: 'subtopic-1',
          }),
          type: 'structured_reflection',
          subtopic_id: 'subtopic-1',
          subtopic_label: 'Bab 1',
          module_index: 0,
          subtopic_index: 1,
          created_at: '2026-04-16T03:00:00.000Z',
          updated_at: '2026-04-16T03:00:00.000Z',
        },
      ],
      feedbacks: [
        {
          id: 'feedback-1',
          user_id: 'user-1',
          course_id: 'course-1',
          subtopic_id: 'subtopic-1',
          subtopic_label: 'Bab 1',
          module_index: 0,
          subtopic_index: 1,
          rating: 4,
          comment: 'Materinya membantu.',
          created_at: '2026-04-16T03:00:30.000Z',
        },
      ],
      users: [{ id: 'user-1', email: 'student@example.com' }],
      courses: [{ id: 'course-1', title: 'Critical Thinking 101' }],
      subtopics: [{ id: 'subtopic-1', title: 'Bab 1' }],
    })

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      journalId: 'journal-1',
      feedbackId: 'feedback-1',
      hasJournal: true,
      hasFeedback: true,
      rating: 4,
      comment: 'Materinya membantu.',
      understood: 'Saya memahami konsep inti.',
      topic: 'Bab 1',
      userEmail: 'student@example.com',
    })
  })

  it('keeps unmatched feedback as its own reflection activity', () => {
    const activities = buildReflectionActivities({
      journals: [],
      feedbacks: [
        {
          id: 'feedback-orphan',
          user_id: 'user-1',
          course_id: 'course-1',
          subtopic_id: null,
          subtopic_label: 'Umum',
          module_index: null,
          subtopic_index: null,
          rating: 5,
          comment: 'Feedback mandiri.',
          created_at: '2026-04-16T04:00:00.000Z',
        },
      ],
      users: [{ id: 'user-1', email: 'student@example.com' }],
      courses: [{ id: 'course-1', title: 'Critical Thinking 101' }],
      subtopics: [],
    })

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      journalId: null,
      feedbackId: 'feedback-orphan',
      hasJournal: false,
      hasFeedback: true,
      rating: 5,
      comment: 'Feedback mandiri.',
      topic: 'Umum',
    })
  })

  it('filters the merged reflection activities by user, course, topic, and date range', () => {
    const activities = buildReflectionActivities({
      journals: [
        {
          id: 'journal-filter',
          user_id: 'user-2',
          course_id: 'course-2',
          content: 'Catatan refleksi',
          reflection: JSON.stringify({
            subtopic: 'Filter Topic',
            moduleIndex: 1,
            subtopicIndex: 0,
          }),
          type: 'free_text',
          subtopic_id: null,
          subtopic_label: 'Filter Topic',
          module_index: 1,
          subtopic_index: 0,
          created_at: '2026-04-15T10:00:00.000Z',
          updated_at: '2026-04-15T10:00:00.000Z',
        },
      ],
      feedbacks: [],
      users: [{ id: 'user-2', email: 'filtered@example.com' }],
      courses: [{ id: 'course-2', title: 'Filtered Course' }],
      subtopics: [],
    })

    const filtered = filterReflectionActivities(activities, {
      userId: 'user-2',
      courseId: 'course-2',
      topic: 'filter',
      dateFrom: '2026-04-15',
      dateTo: '2026-04-15',
    })

    expect(filtered).toHaveLength(1)
    expect(filtered[0]).toMatchObject({
      userId: 'user-2',
      courseId: 'course-2',
      topic: 'Filter Topic',
    })
  })

  it('ignores invalid legacy ratings outside the 1..5 range', () => {
    const activities = buildReflectionActivities({
      journals: [],
      feedbacks: [
        {
          id: 'feedback-invalid-rating',
          user_id: 'user-3',
          course_id: 'course-3',
          subtopic_id: 'subtopic-3',
          subtopic_label: 'Topik Lama',
          module_index: 0,
          subtopic_index: 0,
          rating: 9,
          comment: 'Legacy rating yang tidak valid.',
          created_at: '2026-04-16T05:00:00.000Z',
        },
      ],
      users: [{ id: 'user-3', email: 'legacy@example.com' }],
      courses: [{ id: 'course-3', title: 'Legacy Course' }],
      subtopics: [{ id: 'subtopic-3', title: 'Topik Lama' }],
    })

    expect(activities).toHaveLength(1)
    expect(activities[0]).toMatchObject({
      feedbackId: 'feedback-invalid-rating',
      hasFeedback: true,
      comment: 'Legacy rating yang tidak valid.',
      rating: null,
    })
  })
})
