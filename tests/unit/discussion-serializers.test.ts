import { describe, expect, it } from '@jest/globals';
import { resolveDiscussionRelatedCount } from '@/lib/discussion/serializers';

describe('discussion serializers', () => {
  it('normalizes Supabase related count shapes', () => {
    expect(resolveDiscussionRelatedCount(7)).toBe(7);
    expect(resolveDiscussionRelatedCount([{ id: 'a' }, { id: 'b' }])).toBe(2);
    expect(resolveDiscussionRelatedCount({ count: 3 })).toBe(3);
    expect(resolveDiscussionRelatedCount({ count: '4' })).toBe(4);
    expect(resolveDiscussionRelatedCount(null)).toBe(0);
    expect(resolveDiscussionRelatedCount(undefined)).toBe(0);
    expect(resolveDiscussionRelatedCount({ count: 'not-a-number' })).toBe(0);
  });
});
