import { describe, it, expect, beforeAll } from '@jest/globals';
import { testAdminUserApi } from '../test-admin-user-api';
import type {
  DiscussionAnalytics,
  DiscussionSessionListItemWithHealth,
} from '../../../src/types/discussion';

describe('Admin Discussions API', () => {
  let adminHeaders: HeadersInit;

  beforeAll(async () => {
    const auth = await testAdminUserApi.getAdminAuth();
    adminHeaders = { Cookie: `access_token=${auth.token}` };
  });

  async function fetchFirstDiscussionSession() {
    const response = await fetch('http://localhost:3000/api/admin/discussions?limit=1', {
      headers: adminHeaders as HeadersInit,
    });

    expect(response.status).toBe(200);

    const data = (await response.json()) as { sessions?: DiscussionSessionListItemWithHealth[] };
    return data.sessions?.[0] ?? null;
  }

  it('should list discussions with health scores', async () => {
    const response = await fetch('http://localhost:3000/api/admin/discussions?limit=5', {
      headers: adminHeaders as HeadersInit,
    });
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(Array.isArray(data.sessions)).toBe(true);
    if (!data.sessions.length) {
      console.warn('No discussion sessions returned for list test');
      return;
    }

    expect(data.sessions[0]).toHaveProperty('healthScore');
    expect(typeof data.sessions[0].healthScore.score).toBe('number');
    expect(['in_progress', 'completed', 'failed']).toContain(data.sessions[0].status);
    expect(data.sessions[0]).toHaveProperty('course');
    expect(data.sessions[0]).toHaveProperty('subtopic');
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

  it('should expose a read-only discussion transcript for monitoring', async () => {
    const session = await fetchFirstDiscussionSession();

    if (!session?.id) {
      console.warn('No sessions available for detail test');
      return;
    }

    const response = await fetch(`http://localhost:3000/api/admin/discussions/${session.id}`, {
      headers: adminHeaders as HeadersInit,
    });

    expect(response.status).toBe(200);

    const data = await response.json() as {
      session: {
        id: string;
        status: string;
        phase: string;
        learningGoals: unknown[];
        createdAt: string;
        updatedAt: string;
        user: { id: string; email: string | null };
        course: { id: string; title: string | null };
        subtopic: { id: string; title: string | null };
      };
      messages: Array<{
        id: string;
        role: string;
        content: string;
        step_key?: string | null;
        created_at?: string;
      }>;
      adminActions: unknown[];
    };

    expect(data.session.id).toBe(session.id);
    expect(['in_progress', 'completed', 'failed']).toContain(data.session.status);
    expect(Array.isArray(data.session.learningGoals)).toBe(true);
    expect(Array.isArray(data.messages)).toBe(true);
    expect(Array.isArray(data.adminActions)).toBe(true);
    expect(data.messages.length).toBeGreaterThan(0);
    expect(data.messages[0]).toHaveProperty('step_key');
  });
});

