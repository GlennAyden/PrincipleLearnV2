import {
  classifyPromptComponents,
  countPromptComponents,
  deriveAdminPromptStage,
} from '@/lib/admin-prompt-stage'

describe('admin prompt stage helpers', () => {
  it('parses prompt components safely and classifies by completeness', () => {
    expect(countPromptComponents('{bad json')).toBe(0)
    expect(classifyPromptComponents({ tujuan: 'jelaskan' })).toBe('SRP')
    expect(classifyPromptComponents({ tujuan: 'jelaskan', konteks: 'loop' })).toBe('MQP')
    expect(classifyPromptComponents({ tujuan: 'jelaskan', konteks: 'loop', batasan: 'pakai contoh' })).toBe('REFLECTIVE')
  })

  it('prefers the latest research classification over prompt history and count fallback', () => {
    expect(deriveAdminPromptStage({
      classifications: [
        { prompt_stage: 'SCP', created_at: '2026-04-10T00:00:00.000Z' },
        { prompt_stage: 'reflective', created_at: '2026-04-12T00:00:00.000Z' },
      ],
      prompts: [
        { prompt_stage: 'SRP', created_at: '2026-04-13T00:00:00.000Z' },
      ],
      interactionCount: 1,
    })).toBe('REFLECTIVE')
  })

  it('falls back from prompt stage to components, then interaction count', () => {
    expect(deriveAdminPromptStage({
      prompts: [
        {
          prompt_components: JSON.stringify({ tujuan: 'bandingkan', konteks: 'sorting' }),
          created_at: '2026-04-12T00:00:00.000Z',
        },
      ],
    })).toBe('MQP')

    expect(deriveAdminPromptStage({ interactionCount: 9 })).toBe('MQP')
    expect(deriveAdminPromptStage({ interactionCount: 0 })).toBe('N/A')
  })
})
