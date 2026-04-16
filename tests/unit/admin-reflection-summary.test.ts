import {
  buildRecentReflection,
  countUnifiedReflections,
} from '@/lib/admin-reflection-summary'

describe('admin reflection summary helpers', () => {
  it('counts reflections as a unified activity domain', () => {
    expect(countUnifiedReflections(4, 4)).toBe(4)
    expect(countUnifiedReflections(2, 5)).toBe(5)
    expect(countUnifiedReflections(0, 3)).toBe(3)
  })

  it('prefers jurnal content when a reflection journal exists', () => {
    const summary = buildRecentReflection(
      {
        id: 'journal-1',
        content: JSON.stringify({
          understood: 'Saya paham inti materi.',
          contentRating: 4,
        }),
        reflection: JSON.stringify({
          subtopic: 'Bab 2',
        }),
        created_at: '2026-04-16T05:00:00.000Z',
      },
      {
        id: 'feedback-1',
        rating: 5,
        comment: 'Komentar rating.',
        created_at: '2026-04-16T05:01:00.000Z',
      }
    )

    expect(summary).toMatchObject({
      id: 'journal-1',
      title: 'Bab 2',
      snippet: 'Saya paham inti materi.',
      rating: 4,
      source: 'jurnal',
    })
  })

  it('falls back to feedback when no journal exists', () => {
    const summary = buildRecentReflection(null, {
      id: 'feedback-1',
      rating: 5,
      comment: 'Komentar feedback.',
      created_at: '2026-04-16T05:01:00.000Z',
    })

    expect(summary).toMatchObject({
      id: 'feedback-1',
      title: 'Refleksi terbaru',
      snippet: 'Komentar feedback.',
      rating: 5,
      source: 'feedback',
    })
  })
})
