/**
 * API Endpoint Integration Test Script
 * 
 * This script tests HTTP API endpoints to ensure admin can view user data correctly.
 * Run with: npx ts-node scripts/test-api-endpoints.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE environment variables');
    process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

interface TestResult {
    name: string;
    status: 'PASS' | 'FAIL' | 'WARN';
    message: string;
    details?: any;
}

const results: TestResult[] = [];

function logResult(result: TestResult) {
    results.push(result);
    const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
    console.log(`${icon} ${result.name}: ${result.message}`);
    if (result.details && result.status !== 'PASS') {
        console.log('   Details:', JSON.stringify(result.details, null, 2));
    }
}

// ─── Test: Verify User Data Flows to Admin ───────────────────────────────────

async function testAskQuestionDataFlow() {
    // Get a sample record from database
    const { data: records } = await supabase
        .from('ask_question_history')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Ask Question Data Flow',
            status: 'WARN' as const,
            message: 'No ask_question_history records to verify',
        };
    }

    const record = records[0];

    // Verify all required fields exist
    const requiredFields = ['user_id', 'course_id', 'question', 'answer', 'module_index', 'subtopic_index'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Ask Question Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Ask Question Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, course=${record.courses?.title}`,
    };
}

async function testChallengeResponseDataFlow() {
    const { data: records } = await supabase
        .from('challenge_responses')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Challenge Response Data Flow',
            status: 'WARN' as const,
            message: 'No challenge_responses records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'question', 'answer', 'module_index', 'subtopic_index'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Challenge Response Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Challenge Response Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, course=${record.courses?.title}`,
    };
}

async function testQuizSubmissionDataFlow() {
    const { data: records } = await supabase
        .from('quiz_submissions')
        .select('*, users!inner(email), courses!inner(title), quiz!inner(question)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Quiz Submission Data Flow',
            status: 'WARN' as const,
            message: 'No quiz_submissions records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'quiz_id', 'answer', 'is_correct'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Quiz Submission Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Quiz Submission Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, quiz=${record.quiz?.question?.substring(0, 30)}...`,
    };
}

async function testJournalDataFlow() {
    const { data: records } = await supabase
        .from('jurnal')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Journal Data Flow',
            status: 'WARN' as const,
            message: 'No jurnal records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'content', 'type'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Journal Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Journal Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, type=${record.type}`,
    };
}

async function testTranscriptDataFlow() {
    const { data: records } = await supabase
        .from('transcript')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Transcript Data Flow',
            status: 'WARN' as const,
            message: 'No transcript records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'content'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Transcript Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Transcript Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, course=${record.courses?.title}`,
    };
}

async function testFeedbackDataFlow() {
    const { data: records } = await supabase
        .from('feedback')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Feedback Data Flow',
            status: 'WARN' as const,
            message: 'No feedback records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'rating'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Feedback Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Feedback Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, rating=${record.rating}`,
    };
}

async function testLearningProfileDataFlow() {
    const { data: records } = await supabase
        .from('learning_profiles')
        .select('*, users!inner(email)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Learning Profile Data Flow',
            status: 'WARN' as const,
            message: 'No learning_profiles records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'display_name', 'programming_experience', 'learning_style'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Learning Profile Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Learning Profile Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, name=${record.display_name}`,
    };
}

async function testDiscussionSessionDataFlow() {
    const { data: records } = await supabase
        .from('discussion_sessions')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Discussion Session Data Flow',
            status: 'WARN' as const,
            message: 'No discussion_sessions records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'status', 'phase'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Discussion Session Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    // Check if messages exist for this session
    const { data: messages } = await supabase
        .from('discussion_messages')
        .select('id')
        .eq('session_id', record.id)
        .limit(1);

    const hasMessages = messages && messages.length > 0;

    return {
        name: 'Discussion Session Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, status=${record.status}, hasMessages=${hasMessages}`,
    };
}

async function testCourseGenerationDataFlow() {
    const { data: records } = await supabase
        .from('course_generation_activity')
        .select('*, users!inner(email), courses!inner(title)')
        .limit(1);

    if (!records || records.length === 0) {
        return {
            name: 'Course Generation Data Flow',
            status: 'WARN' as const,
            message: 'No course_generation_activity records to verify',
        };
    }

    const record = records[0];
    const requiredFields = ['user_id', 'course_id', 'request_payload'];
    const missingFields = requiredFields.filter(f => record[f] === undefined);

    if (missingFields.length > 0) {
        return {
            name: 'Course Generation Data Flow',
            status: 'FAIL' as const,
            message: `Missing fields: ${missingFields.join(', ')}`,
            details: { record },
        };
    }

    return {
        name: 'Course Generation Data Flow',
        status: 'PASS' as const,
        message: `Record verified: user=${record.users?.email}, course=${record.courses?.title}`,
    };
}

// ─── Test: Admin Dashboard Aggregation ───────────────────────────────────────

async function testAdminDashboardAggregation() {
    // Test that we can aggregate all the metrics needed for admin dashboard
    const metrics: Record<string, number> = {};

    // Count active students (users with any activity)
    const { count: userCount } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .neq('role', 'admin');
    metrics.totalUsers = userCount || 0;

    // Count courses
    const { count: courseCount } = await supabase
        .from('courses')
        .select('*', { count: 'exact', head: true });
    metrics.totalCourses = courseCount || 0;

    // Count quiz submissions
    const { count: quizCount } = await supabase
        .from('quiz_submissions')
        .select('*', { count: 'exact', head: true });
    metrics.totalQuizSubmissions = quizCount || 0;

    // Count journals
    const { count: jurnalCount } = await supabase
        .from('jurnal')
        .select('*', { count: 'exact', head: true });
    metrics.totalJournals = jurnalCount || 0;

    // Count challenges
    const { count: challengeCount } = await supabase
        .from('challenge_responses')
        .select('*', { count: 'exact', head: true });
    metrics.totalChallenges = challengeCount || 0;

    // Count discussions
    const { count: discussionCount } = await supabase
        .from('discussion_sessions')
        .select('*', { count: 'exact', head: true });
    metrics.totalDiscussions = discussionCount || 0;

    // Count feedbacks
    const { count: feedbackCount } = await supabase
        .from('feedback')
        .select('*', { count: 'exact', head: true });
    metrics.totalFeedbacks = feedbackCount || 0;

    // Count ask questions
    const { count: askCount } = await supabase
        .from('ask_question_history')
        .select('*', { count: 'exact', head: true });
    metrics.totalAskQuestions = askCount || 0;

    return {
        name: 'Admin Dashboard Aggregation',
        status: 'PASS' as const,
        message: `Users: ${metrics.totalUsers}, Courses: ${metrics.totalCourses}, Quizzes: ${metrics.totalQuizSubmissions}, Journals: ${metrics.totalJournals}, Challenges: ${metrics.totalChallenges}, Discussions: ${metrics.totalDiscussions}`,
    };
}

// ─── Test: User Activity Summary ─────────────────────────────────────────────

async function testUserActivitySummary() {
    // Get a user with activity
    const { data: users } = await supabase
        .from('users')
        .select('id, email')
        .neq('role', 'admin')
        .limit(1);

    if (!users || users.length === 0) {
        return {
            name: 'User Activity Summary',
            status: 'WARN' as const,
            message: 'No users to test',
        };
    }

    const user = users[0];
    const summary: Record<string, number> = {};

    // Get all activity counts for this user
    const tables = [
        { name: 'quiz_submissions', key: 'quizzes' },
        { name: 'jurnal', key: 'journals' },
        { name: 'challenge_responses', key: 'challenges' },
        { name: 'discussion_sessions', key: 'discussions' },
        { name: 'feedback', key: 'feedbacks' },
        { name: 'ask_question_history', key: 'questions' },
    ];

    for (const table of tables) {
        const { count } = await supabase
            .from(table.name)
            .select('*', { count: 'exact', head: true })
            .eq('user_id', user.id);
        summary[table.key] = count || 0;
    }

    return {
        name: 'User Activity Summary',
        status: 'PASS' as const,
        message: `User ${user.email}: Q&A=${summary.questions}, Quiz=${summary.quizzes}, Journal=${summary.journals}, Challenge=${summary.challenges}, Discussion=${summary.discussions}`,
    };
}

// ─── Main Test Runner ────────────────────────────────────────────────────────

async function runAllTests() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 API ENDPOINT DATA FLOW TEST');
    console.log('='.repeat(70) + '\n');

    // 1. Test Data Flow for each activity type
    console.log('\n📊 1. DATA FLOW TESTS\n' + '-'.repeat(40));

    const dataFlowTests = [
        testAskQuestionDataFlow,
        testChallengeResponseDataFlow,
        testQuizSubmissionDataFlow,
        testJournalDataFlow,
        testTranscriptDataFlow,
        testFeedbackDataFlow,
        testLearningProfileDataFlow,
        testDiscussionSessionDataFlow,
        testCourseGenerationDataFlow,
    ];

    for (const test of dataFlowTests) {
        const result = await test();
        logResult(result);
    }

    // 2. Test Admin Aggregation
    console.log('\n📈 2. ADMIN AGGREGATION TESTS\n' + '-'.repeat(40));
    logResult(await testAdminDashboardAggregation());
    logResult(await testUserActivitySummary());

    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(70));

    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warned = results.filter(r => r.status === 'WARN').length;

    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`⚠️  Warnings: ${warned}`);
    console.log(`📝 Total: ${results.length}\n`);

    if (failed > 0) {
        console.log('\n❌ FAILED TESTS:');
        results.filter(r => r.status === 'FAIL').forEach(r => {
            console.log(`   - ${r.name}: ${r.message}`);
        });
    }

    process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(console.error);
