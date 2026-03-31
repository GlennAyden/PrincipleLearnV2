import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { testAdminUserApi } from '../test-admin-user-api';
import type { DiscussionSessionListItemWithHealth, DiscussionAnalytics } from '../../../src/types/discussion';
import { supabase } from '../../../src/lib/database';

describe('Admin Discussions API', () => {
  let adminHeaders: HeadersInit;

  beforeAll(async () => {
    const auth = await testAdminUserApi.getAdminAuth();
    adminHeaders = { Cookie: `access_token=${auth.token}` };
  });

  afterAll(async () => {
    // Cleanup test data if needed
  });

  it('should list discussions with health scores', async () => {
    const response = await fetch('http://localhost:3000/api/admin/discussions?limit=5', {
      headers: adminHeaders as HeadersInit,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.sessions)).toBe(true);
    expect(data.sessions[0]).toHaveProperty('healthScore');
    expect(typeof data.sessions[0].healthScore.score).toBe('number');
  });

  it('should get analytics', async () => {
    const response = await fetch('http://localhost:3000/api/admin/discussions/analytics', {
      headers: adminHeaders as HeadersInit,
    });
    expect(response.status).toBe(200);
    const data = await response.json() as { analytics: DiscussionAnalytics };
    expect(data.analytics).toHaveProperty('totalSessions');
    expect(data.analytics.totalSessions).toBeGreaterThanOrEqual(0);
  });

  it('should handle bulk update', async () => {
    // First get a session ID
    const listRes = await fetch('http://localhost:3000/api/admin/discussions?limit=1', {
      headers: adminHeaders as HeadersInit,
    });
    const listData = await listRes.json();
    if (!listData.sessions?.[0]?.id) {
      console.warn('No sessions for bulk test');
      return;
    }

    const response = await fetch('http://localhost:3000/api/admin/discussions/bulk', {
      method: 'POST',
      headers: {
        ...adminHeaders as HeadersInit,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sessionIds: [listData.sessions[0].id],
        action: 'mark_completed',
      }),
    });
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.results.success).toBeGreaterThanOrEqual(0);
  });
});

