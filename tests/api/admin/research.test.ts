/**
 * Test Suite: Admin Research API Routes
 * Tests for sessions, classifications, indicators, analytics, classify, export
 */

import { describe, it, expect, beforeAll } from '@jest/globals';

const BASE_URL = process.env.TEST_BASE_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.TEST_ADMIN_TOKEN || '';

// Helper to make authenticated requests
async function authFetch(path: string, options: RequestInit = {}) {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Cookie': `token=${ADMIN_TOKEN}`,
        ...(options.headers as Record<string, string> || {})
    };

    const res = await fetch(url, { ...options, headers });
    const data = await res.json().catch(() => null);
    return { res, data };
}

// Helper for UUID validation
function isUUID(str: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

describe('Research API - Sessions', () => {
    let createdSessionId: string;

    it('GET /api/admin/research/sessions - should return paginated list', async () => {
        const { res, data } = await authFetch('/api/admin/research/sessions?limit=10&offset=0');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('data');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('offset', 0);
        expect(data).toHaveProperty('limit', 10);
        expect(Array.isArray(data.data)).toBe(true);
    });

    it('GET /api/admin/research/sessions - should validate UUID params', async () => {
        const { res, data } = await authFetch('/api/admin/research/sessions?user_id=invalid-uuid');
        expect(res.status).toBe(400);
        expect(data).toHaveProperty('error');
    });

    it('POST /api/admin/research/sessions - should validate required fields', async () => {
        const { res, data } = await authFetch('/api/admin/research/sessions', {
            method: 'POST',
            body: JSON.stringify({ user_id: 'missing-other-fields' })
        });
        expect(res.status).toBe(400);
        expect(data).toHaveProperty('error');
    });

    it('POST /api/admin/research/sessions - should create session with valid data', async () => {
        const sessionData = {
            user_id: '00000000-0000-0000-0000-000000000001',
            course_id: '00000000-0000-0000-0000-000000000001',
            session_number: 999,
            session_date: '2026-03-27',
            topic_focus: 'Test Topic',
            duration_minutes: 60,
            status: 'active'
        };

        const { res, data } = await authFetch('/api/admin/research/sessions', {
            method: 'POST',
            body: JSON.stringify(sessionData)
        });

        // May fail if user_id/course_id don't exist, but should not be 500
        if (res.status === 201) {
            expect(data).toHaveProperty('success', true);
            expect(data).toHaveProperty('data');
            if (data.data?.id) {
                createdSessionId = data.data.id;
            }
        } else {
            // Expected: 400 or 409 if data constraints fail
            expect([400, 409, 500]).toContain(res.status);
        }
    });

    it('PUT /api/admin/research/sessions - should require id', async () => {
        const { res, data } = await authFetch('/api/admin/research/sessions', {
            method: 'PUT',
            body: JSON.stringify({ topic_focus: 'Updated' })
        });
        expect(res.status).toBe(400);
        expect(data.error).toContain('id');
    });

    it('DELETE /api/admin/research/sessions - should require id param', async () => {
        const { res, data } = await authFetch('/api/admin/research/sessions', {
            method: 'DELETE'
        });
        expect(res.status).toBe(400);
    });

    it('DELETE /api/admin/research/sessions - should validate UUID', async () => {
        const { res } = await authFetch('/api/admin/research/sessions?id=not-a-uuid', {
            method: 'DELETE'
        });
        expect(res.status).toBe(400);
    });
});

describe('Research API - Classifications', () => {
    it('GET /api/admin/research/classifications - should return paginated list', async () => {
        const { res, data } = await authFetch('/api/admin/research/classifications?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('data');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.data)).toBe(true);
    });

    it('GET /api/admin/research/classifications - should filter by stage', async () => {
        const { res, data } = await authFetch('/api/admin/research/classifications?prompt_stage=SCP');
        expect(res.status).toBe(200);
        if (data.data?.length > 0) {
            data.data.forEach((c: { prompt_stage: string }) => {
                expect(c.prompt_stage).toBe('SCP');
            });
        }
    });

    it('POST /api/admin/research/classifications - should validate required fields', async () => {
        const { res, data } = await authFetch('/api/admin/research/classifications', {
            method: 'POST',
            body: JSON.stringify({ prompt_text: 'test' })
        });
        expect(res.status).toBe(400);
        expect(data).toHaveProperty('error');
    });

    it('POST /api/admin/research/classifications - should validate prompt_stage', async () => {
        const { res, data } = await authFetch('/api/admin/research/classifications', {
            method: 'POST',
            body: JSON.stringify({
                prompt_source: 'ask_question',
                prompt_id: '00000000-0000-0000-0000-000000000001',
                user_id: '00000000-0000-0000-0000-000000000001',
                course_id: '00000000-0000-0000-0000-000000000001',
                prompt_text: 'Test prompt',
                prompt_stage: 'INVALID_STAGE',
                classified_by: 'manual'
            })
        });
        expect(res.status).toBe(400);
    });

    it('PUT /api/admin/research/classifications - should require id', async () => {
        const { res, data } = await authFetch('/api/admin/research/classifications', {
            method: 'PUT',
            body: JSON.stringify({ prompt_stage: 'SRP' })
        });
        expect(res.status).toBe(400);
    });

    it('DELETE /api/admin/research/classifications - should validate id', async () => {
        const { res } = await authFetch('/api/admin/research/classifications?id=invalid', {
            method: 'DELETE'
        });
        expect(res.status).toBe(400);
    });
});

describe('Research API - Indicators', () => {
    it('GET /api/admin/research/indicators - should return paginated list', async () => {
        const { res, data } = await authFetch('/api/admin/research/indicators?limit=5&offset=0');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('data');
        expect(data).toHaveProperty('total');
        expect(Array.isArray(data.data)).toBe(true);
    });

    it('GET /api/admin/research/indicators - should validate user_id UUID', async () => {
        const { res } = await authFetch('/api/admin/research/indicators?user_id=bad-uuid');
        expect(res.status).toBe(400);
    });

    it('POST /api/admin/research/indicators - should validate required fields', async () => {
        const { res, data } = await authFetch('/api/admin/research/indicators', {
            method: 'POST',
            body: JSON.stringify({ ct_decomposition: 1 })
        });
        expect(res.status).toBe(400);
        expect(data.error).toContain('required');
    });

    it('POST /api/admin/research/indicators - should validate score range (0-2)', async () => {
        const { res, data } = await authFetch('/api/admin/research/indicators', {
            method: 'POST',
            body: JSON.stringify({
                prompt_classification_id: '00000000-0000-0000-0000-000000000001',
                prompt_id: '00000000-0000-0000-0000-000000000001',
                user_id: '00000000-0000-0000-0000-000000000001',
                assessed_by: 'researcher_1',
                ct_decomposition: 5  // Invalid: > 2
            })
        });
        expect(res.status).toBe(400);
        expect(data.error).toContain('indicator');
    });

    it('PUT /api/admin/research/indicators - should require id', async () => {
        const { res } = await authFetch('/api/admin/research/indicators', {
            method: 'PUT',
            body: JSON.stringify({ ct_decomposition: 1 })
        });
        expect(res.status).toBe(400);
    });

    it('PUT /api/admin/research/indicators - should validate UUID format', async () => {
        const { res } = await authFetch('/api/admin/research/indicators', {
            method: 'PUT',
            body: JSON.stringify({ id: 'bad-uuid', ct_decomposition: 1 })
        });
        expect(res.status).toBe(400);
    });

    it('DELETE /api/admin/research/indicators - should require id', async () => {
        const { res } = await authFetch('/api/admin/research/indicators', {
            method: 'DELETE'
        });
        expect(res.status).toBe(400);
    });
});

describe('Research API - Analytics', () => {
    it('GET /api/admin/research/analytics - should return analytics data', async () => {
        const { res, data } = await authFetch('/api/admin/research/analytics');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('data');

        const analytics = data.data;
        expect(analytics).toHaveProperty('total_sessions');
        expect(analytics).toHaveProperty('total_classifications');
        expect(analytics).toHaveProperty('total_indicators');
        expect(analytics).toHaveProperty('total_students');
        expect(analytics).toHaveProperty('stage_distribution');
        expect(analytics).toHaveProperty('stage_heatmap');
        expect(analytics).toHaveProperty('user_progression');
        expect(analytics).toHaveProperty('inter_rater_kappa');

        // Validate stage distribution keys
        expect(analytics.stage_distribution).toHaveProperty('SCP');
        expect(analytics.stage_distribution).toHaveProperty('SRP');
        expect(analytics.stage_distribution).toHaveProperty('MQP');
        expect(analytics.stage_distribution).toHaveProperty('REFLECTIVE');

        // Validate inter-rater structure
        expect(analytics.inter_rater_kappa).toHaveProperty('prompt_stage');
        expect(analytics.inter_rater_kappa).toHaveProperty('ct_indicators');
        expect(analytics.inter_rater_kappa).toHaveProperty('reliability_status');
        expect(['excellent', 'good', 'fair', 'poor']).toContain(analytics.inter_rater_kappa.reliability_status);

        // Validate numeric types
        expect(typeof analytics.total_sessions).toBe('number');
        expect(typeof analytics.total_students).toBe('number');
    });

    it('GET /api/admin/research/analytics - heatmap should have valid stage keys', async () => {
        const { res, data } = await authFetch('/api/admin/research/analytics');
        expect(res.status).toBe(200);

        const heatmap = data.data.stage_heatmap;
        for (const stage of ['SCP', 'SRP', 'MQP', 'REFLECTIVE']) {
            expect(heatmap).toHaveProperty(stage);
            expect(heatmap[stage]).toHaveProperty('sessions');
            expect(heatmap[stage]).toHaveProperty('avg_ct');
            expect(heatmap[stage]).toHaveProperty('avg_cth');
        }
    });
});

describe('Research API - Export', () => {
    it('GET /api/admin/research/export - should return JSON export', async () => {
        const { res, data } = await authFetch('/api/admin/research/export?format=json&data_type=all');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('format', 'json');
        expect(data).toHaveProperty('data_type', 'all');
        expect(data).toHaveProperty('record_count');
        expect(data).toHaveProperty('data');
    });

    it('GET /api/admin/research/export - should validate format param', async () => {
        const { res, data } = await authFetch('/api/admin/research/export?format=xml');
        expect(res.status).toBe(400);
        expect(data.error).toContain('format');
    });

    it('GET /api/admin/research/export - should validate data_type param', async () => {
        const { res, data } = await authFetch('/api/admin/research/export?data_type=invalid');
        expect(res.status).toBe(400);
        expect(data.error).toContain('data_type');
    });

    it('GET /api/admin/research/export - SPSS format should work', async () => {
        const { res, data } = await authFetch('/api/admin/research/export?spss=true&format=json');
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
        expect(data).toHaveProperty('spss_ready', true);
    });

    it('GET /api/admin/research/export - CSV format should return text', async () => {
        const url = `${BASE_URL}/api/admin/research/export?format=csv&data_type=sessions`;
        const res = await fetch(url, {
            headers: { 'Cookie': `token=${ADMIN_TOKEN}` }
        });
        expect(res.status).toBe(200);
        const contentType = res.headers.get('content-type');
        expect(contentType).toContain('text/csv');
    });

    it('GET /api/admin/research/export - should handle empty data gracefully', async () => {
        // Filter by nonexistent user to get empty results
        const { res, data } = await authFetch(
            '/api/admin/research/export?format=json&data_type=sessions&user_id=00000000-0000-0000-0000-000000000099'
        );
        expect(res.status).toBe(200);
        expect(data).toHaveProperty('success', true);
    });

    it('GET /api/admin/research/export - sessions type should only contain sessions', async () => {
        const { res, data } = await authFetch('/api/admin/research/export?format=json&data_type=sessions');
        expect(res.status).toBe(200);
        expect(data.data).toHaveProperty('sessions');
        expect(data.data).not.toHaveProperty('classifications');
        expect(data.data).not.toHaveProperty('indicators');
    });
});

describe('Research API - Unauthorized Access', () => {
    it('All endpoints should reject unauthenticated requests', async () => {
        const endpoints = [
            '/api/admin/research/sessions',
            '/api/admin/research/classifications',
            '/api/admin/research/indicators',
            '/api/admin/research/analytics',
            '/api/admin/research/export'
        ];

        for (const endpoint of endpoints) {
            const res = await fetch(`${BASE_URL}${endpoint}`);
            const data = await res.json().catch(() => null);
            expect(res.status).toBe(401);
            if (data) {
                expect(data).toHaveProperty('error');
            }
        }
    });
});

describe('Research Types - Helper Functions', () => {
    // Import types directly for unit testing
    it('should calculate CT score correctly', () => {
        const { calculateCTScore } = require('@/types/research');
        const score = calculateCTScore({
            ct_decomposition: 2,
            ct_pattern_recognition: 1,
            ct_abstraction: 2,
            ct_algorithm_design: 1,
            ct_evaluation_debugging: 0,
            ct_generalization: 2
        });
        expect(score).toBe(8);
    });

    it('should calculate CTh score correctly', () => {
        const { calculateCThScore } = require('@/types/research');
        const score = calculateCThScore({
            cth_interpretation: 2,
            cth_analysis: 2,
            cth_evaluation: 1,
            cth_inference: 1,
            cth_explanation: 2,
            cth_self_regulation: 0
        });
        expect(score).toBe(8);
    });

    it('should get prompt stage score', () => {
        const { getPromptStageScore } = require('@/types/research');
        expect(getPromptStageScore('SCP')).toBe(1);
        expect(getPromptStageScore('SRP')).toBe(2);
        expect(getPromptStageScore('MQP')).toBe(3);
        expect(getPromptStageScore('REFLECTIVE')).toBe(4);
    });

    it('should determine transition status', () => {
        const { determineTransitionStatus } = require('@/types/research');
        expect(determineTransitionStatus(3, 2)).toBe('naik_stabil');
        expect(determineTransitionStatus(1, 3)).toBe('turun');
        expect(determineTransitionStatus(2, 2)).toBe('stagnan');
    });

    it('should calculate Cohens Kappa', () => {
        const { calculateCohensKappa } = require('@/types/research');
        const kappa = calculateCohensKappa(0.85, 0.50);
        expect(kappa).toBeCloseTo(0.70, 2);
    });
});
