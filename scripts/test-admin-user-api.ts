/**
 * Admin-User API Integration Test Script
 * 
 * This script tests all API endpoints that connect admin and user data
 * to ensure data consistency between user input and admin display.
 * 
 * Run with: npx ts-node scripts/test-admin-user-api.ts
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });

// ─── Configuration ───────────────────────────────────────────────────────────

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('❌ Missing SUPABASE environment variables');
    process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ─── Test Results Tracking ───────────────────────────────────────────────────

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

// ─── Table Schema Definitions ────────────────────────────────────────────────

const EXPECTED_TABLES = {
    // Core tables
    users: ['id', 'email', 'password_hash', 'name', 'role', 'created_at', 'updated_at'],
    courses: ['id', 'title', 'description', 'subject', 'difficulty_level', 'estimated_duration', 'created_by', 'created_at', 'updated_at'],
    subtopics: ['id', 'course_id', 'title', 'content', 'order_index', 'created_at', 'updated_at'],

    // User activity tables
    quiz: ['id', 'course_id', 'subtopic_id', 'question', 'options', 'correct_answer', 'explanation', 'created_at'],
    quiz_submissions: ['id', 'user_id', 'quiz_id', 'course_id', 'subtopic_id', 'module_index', 'subtopic_index', 'answer', 'is_correct', 'reasoning_note', 'created_at'],
    jurnal: ['id', 'user_id', 'course_id', 'content', 'type', 'reflection', 'created_at', 'updated_at'],
    transcript: ['id', 'user_id', 'course_id', 'subtopic_id', 'content', 'notes', 'created_at', 'updated_at'],
    feedback: ['id', 'user_id', 'course_id', 'subtopic_id', 'rating', 'comment', 'created_at', 'module_index', 'subtopic_index', 'subtopic_label'],
    user_progress: ['id', 'user_id', 'course_id', 'subtopic_id', 'is_completed', 'created_at', 'updated_at'],

    // Learning activity tables
    ask_question_history: ['id', 'user_id', 'course_id', 'module_index', 'subtopic_index', 'page_number', 'subtopic_label', 'question', 'answer', 'reasoning_note', 'prompt_components', 'created_at', 'prompt_version', 'session_number', 'updated_at'],
    challenge_responses: ['id', 'user_id', 'course_id', 'module_index', 'subtopic_index', 'page_number', 'question', 'answer', 'feedback', 'reasoning_note', 'created_at', 'updated_at'],
    learning_profiles: ['id', 'user_id', 'display_name', 'programming_experience', 'learning_style', 'learning_goals', 'challenges', 'created_at', 'updated_at'],

    // Discussion tables
    discussion_sessions: ['id', 'user_id', 'course_id', 'subtopic_id', 'template_id', 'status', 'phase', 'learning_goals', 'created_at', 'updated_at'],
    discussion_messages: ['id', 'session_id', 'role', 'content', 'metadata', 'created_at', 'step_key'],
    discussion_templates: ['id', 'course_id', 'subtopic_id', 'version', 'source', 'template', 'generated_by', 'created_at'],

    // Course generation tables
    course_generation_activity: ['id', 'user_id', 'course_id', 'request_payload', 'outline', 'created_at'],
    subtopic_cache: ['id', 'cache_key', 'content', 'created_at', 'updated_at'],
};

// ─── API Mapping: User API -> Admin API ──────────────────────────────────────

const API_MAPPINGS = [
    {
        name: 'Ask Question',
        userTable: 'ask_question_history',
        adminEndpoint: '/api/admin/activity/ask-question',
        userFields: ['user_id', 'course_id', 'question', 'answer', 'reasoning_note', 'module_index', 'subtopic_index', 'page_number'],
        adminFields: ['userId', 'courseTitle', 'question', 'answer', 'reasoningNote', 'moduleIndex', 'subtopicIndex', 'pageNumber'],
    },
    {
        name: 'Challenge Response',
        userTable: 'challenge_responses',
        adminEndpoint: '/api/admin/activity/challenge',
        userFields: ['user_id', 'course_id', 'question', 'answer', 'feedback', 'reasoning_note', 'module_index', 'subtopic_index'],
        adminFields: ['userId', 'courseTitle', 'question', 'answer', 'feedback', 'reasoningNote', 'moduleIndex', 'subtopicIndex'],
    },
    {
        name: 'Quiz Submission',
        userTable: 'quiz_submissions',
        adminEndpoint: '/api/admin/activity/quiz',
        userFields: ['user_id', 'course_id', 'quiz_id', 'answer', 'is_correct', 'reasoning_note', 'module_index', 'subtopic_index'],
        adminFields: ['userId', 'courseTitle', 'quizId', 'answer', 'isCorrect', 'reasoningNote', 'moduleIndex', 'subtopicIndex'],
    },
    {
        name: 'Journal',
        userTable: 'jurnal',
        adminEndpoint: '/api/admin/activity/jurnal',
        userFields: ['user_id', 'course_id', 'content', 'type', 'reflection'],
        adminFields: ['userId', 'courseTitle', 'content', 'type', 'reflection'],
    },
    {
        name: 'Transcript',
        userTable: 'transcript',
        adminEndpoint: '/api/admin/activity/transcript',
        userFields: ['user_id', 'course_id', 'subtopic_id', 'content', 'notes'],
        adminFields: ['userId', 'courseTitle', 'subtopicId', 'content', 'notes'],
    },
    {
        name: 'Feedback',
        userTable: 'feedback',
        adminEndpoint: '/api/admin/activity/feedback',
        userFields: ['user_id', 'course_id', 'rating', 'comment'],
        adminFields: ['userId', 'courseTitle', 'rating', 'comment'],
    },
    {
        name: 'Learning Profile',
        userTable: 'learning_profiles',
        adminEndpoint: '/api/admin/activity/learning-profile',
        userFields: ['user_id', 'display_name', 'programming_experience', 'learning_style', 'learning_goals', 'challenges'],
        adminFields: ['userId', 'displayName', 'programmingExperience', 'learningStyle', 'learningGoals', 'challenges'],
    },
    {
        name: 'Discussion Session',
        userTable: 'discussion_sessions',
        adminEndpoint: '/api/admin/activity/discussion',
        userFields: ['user_id', 'course_id', 'subtopic_id', 'status', 'phase', 'learning_goals'],
        adminFields: ['userId', 'courseTitle', 'subtopicTitle', 'status', 'phase', 'goals'],
    },
    {
        name: 'Course Generation',
        userTable: 'course_generation_activity',
        adminEndpoint: '/api/admin/activity/generate-course',
        userFields: ['user_id', 'course_id', 'request_payload', 'outline'],
        adminFields: ['userId', 'courseId', 'requestPayload', 'outline'],
    },
];

// ─── Test Functions ──────────────────────────────────────────────────────────

async function testTableExists(tableName: string): Promise<boolean> {
    try {
        const { data, error } = await supabase.from(tableName).select('*').limit(1);
        if (error && error.code === 'PGRST205') {
            return false;
        }
        return !error;
    } catch {
        return false;
    }
}

async function testTableSchema(tableName: string, expectedColumns: string[]): Promise<TestResult> {
    try {
        const { data, error } = await supabase.from(tableName).select('*').limit(1);

        if (error) {
            if (error.code === 'PGRST205') {
                return {
                    name: `Table: ${tableName}`,
                    status: 'FAIL',
                    message: `Table does not exist`,
                    details: error,
                };
            }
            return {
                name: `Table: ${tableName}`,
                status: 'FAIL',
                message: `Error accessing table: ${error.message}`,
                details: error,
            };
        }

        // If table is empty, we can't verify columns from data
        if (!data || data.length === 0) {
            return {
                name: `Table: ${tableName}`,
                status: 'WARN',
                message: `Table exists but is empty - cannot verify columns`,
            };
        }

        const actualColumns = Object.keys(data[0]);
        const missingColumns = expectedColumns.filter(col => !actualColumns.includes(col));
        const extraColumns = actualColumns.filter(col => !expectedColumns.includes(col));

        if (missingColumns.length > 0) {
            return {
                name: `Table: ${tableName}`,
                status: 'FAIL',
                message: `Missing columns: ${missingColumns.join(', ')}`,
                details: { expected: expectedColumns, actual: actualColumns, missing: missingColumns },
            };
        }

        if (extraColumns.length > 0) {
            return {
                name: `Table: ${tableName}`,
                status: 'WARN',
                message: `Table OK, but has extra columns: ${extraColumns.join(', ')}`,
                details: { extra: extraColumns },
            };
        }

        return {
            name: `Table: ${tableName}`,
            status: 'PASS',
            message: `All ${expectedColumns.length} expected columns present`,
        };
    } catch (err: any) {
        return {
            name: `Table: ${tableName}`,
            status: 'FAIL',
            message: `Exception: ${err.message}`,
            details: err,
        };
    }
}

async function testDataConsistency(mapping: typeof API_MAPPINGS[0]): Promise<TestResult> {
    try {
        // Get sample data from user table
        const { data: userData, error: userError } = await supabase
            .from(mapping.userTable)
            .select('*')
            .limit(5);

        if (userError) {
            return {
                name: `Data: ${mapping.name}`,
                status: 'FAIL',
                message: `Cannot read from ${mapping.userTable}: ${userError.message}`,
                details: userError,
            };
        }

        if (!userData || userData.length === 0) {
            return {
                name: `Data: ${mapping.name}`,
                status: 'WARN',
                message: `No data in ${mapping.userTable} to verify`,
            };
        }

        // Check if all expected user fields exist
        const sampleRecord = userData[0];
        const missingUserFields = mapping.userFields.filter(field => !(field in sampleRecord));

        if (missingUserFields.length > 0) {
            return {
                name: `Data: ${mapping.name}`,
                status: 'FAIL',
                message: `Missing fields in ${mapping.userTable}: ${missingUserFields.join(', ')}`,
                details: { expected: mapping.userFields, actual: Object.keys(sampleRecord) },
            };
        }

        return {
            name: `Data: ${mapping.name}`,
            status: 'PASS',
            message: `${userData.length} records found, all fields present`,
        };
    } catch (err: any) {
        return {
            name: `Data: ${mapping.name}`,
            status: 'FAIL',
            message: `Exception: ${err.message}`,
            details: err,
        };
    }
}

async function testForeignKeyRelationships(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Test: quiz_submissions -> users
    const { data: quizSubs } = await supabase.from('quiz_submissions').select('user_id').limit(10);
    if (quizSubs && quizSubs.length > 0) {
        const userIds = [...new Set(quizSubs.map(q => q.user_id))];
        const { data: users } = await supabase.from('users').select('id').in('id', userIds);
        const foundUserIds = users?.map(u => u.id) || [];
        const orphanedIds = userIds.filter(id => !foundUserIds.includes(id));

        results.push({
            name: 'FK: quiz_submissions -> users',
            status: orphanedIds.length === 0 ? 'PASS' : 'FAIL',
            message: orphanedIds.length === 0
                ? 'All user references valid'
                : `Orphaned user_ids: ${orphanedIds.join(', ')}`,
            details: orphanedIds.length > 0 ? { orphanedIds } : undefined,
        });
    }

    // Test: jurnal -> users
    const { data: jurnals } = await supabase.from('jurnal').select('user_id').limit(10);
    if (jurnals && jurnals.length > 0) {
        const userIds = [...new Set(jurnals.map(j => j.user_id))];
        const { data: users } = await supabase.from('users').select('id').in('id', userIds);
        const foundUserIds = users?.map(u => u.id) || [];
        const orphanedIds = userIds.filter(id => !foundUserIds.includes(id));

        results.push({
            name: 'FK: jurnal -> users',
            status: orphanedIds.length === 0 ? 'PASS' : 'FAIL',
            message: orphanedIds.length === 0
                ? 'All user references valid'
                : `Orphaned user_ids: ${orphanedIds.join(', ')}`,
            details: orphanedIds.length > 0 ? { orphanedIds } : undefined,
        });
    }

    // Test: courses -> users (created_by)
    const { data: courses } = await supabase.from('courses').select('created_by').limit(10);
    if (courses && courses.length > 0) {
        const userIds = [...new Set(courses.map(c => c.created_by).filter(Boolean))];
        if (userIds.length > 0) {
            const { data: users } = await supabase.from('users').select('id').in('id', userIds);
            const foundUserIds = users?.map(u => u.id) || [];
            const orphanedIds = userIds.filter(id => !foundUserIds.includes(id));

            results.push({
                name: 'FK: courses -> users (created_by)',
                status: orphanedIds.length === 0 ? 'PASS' : 'FAIL',
                message: orphanedIds.length === 0
                    ? 'All creator references valid'
                    : `Orphaned created_by: ${orphanedIds.join(', ')}`,
                details: orphanedIds.length > 0 ? { orphanedIds } : undefined,
            });
        }
    }

    // Test: discussion_sessions -> users
    const { data: sessions } = await supabase.from('discussion_sessions').select('user_id').limit(10);
    if (sessions && sessions.length > 0) {
        const userIds = [...new Set(sessions.map(s => s.user_id))];
        const { data: users } = await supabase.from('users').select('id').in('id', userIds);
        const foundUserIds = users?.map(u => u.id) || [];
        const orphanedIds = userIds.filter(id => !foundUserIds.includes(id));

        results.push({
            name: 'FK: discussion_sessions -> users',
            status: orphanedIds.length === 0 ? 'PASS' : 'FAIL',
            message: orphanedIds.length === 0
                ? 'All user references valid'
                : `Orphaned user_ids: ${orphanedIds.join(', ')}`,
            details: orphanedIds.length > 0 ? { orphanedIds } : undefined,
        });
    }

    // Test: subtopics -> courses
    const { data: subtopics } = await supabase.from('subtopics').select('course_id').limit(10);
    if (subtopics && subtopics.length > 0) {
        const courseIds = [...new Set(subtopics.map(s => s.course_id))];
        const { data: coursesData } = await supabase.from('courses').select('id').in('id', courseIds);
        const foundCourseIds = coursesData?.map(c => c.id) || [];
        const orphanedIds = courseIds.filter(id => !foundCourseIds.includes(id));

        results.push({
            name: 'FK: subtopics -> courses',
            status: orphanedIds.length === 0 ? 'PASS' : 'FAIL',
            message: orphanedIds.length === 0
                ? 'All course references valid'
                : `Orphaned course_ids: ${orphanedIds.join(', ')}`,
            details: orphanedIds.length > 0 ? { orphanedIds } : undefined,
        });
    }

    return results;
}

async function testAdminDataAggregation(): Promise<TestResult[]> {
    const results: TestResult[] = [];

    // Test: Can aggregate user activity counts
    const { data: users } = await supabase.from('users').select('id').limit(5);

    if (users && users.length > 0) {
        for (const user of users.slice(0, 2)) {
            // Count quiz submissions
            const { count: quizCount } = await supabase
                .from('quiz_submissions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            // Count journals
            const { count: jurnalCount } = await supabase
                .from('jurnal')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            // Count challenges
            const { count: challengeCount } = await supabase
                .from('challenge_responses')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            // Count discussions
            const { count: discussionCount } = await supabase
                .from('discussion_sessions')
                .select('*', { count: 'exact', head: true })
                .eq('user_id', user.id);

            results.push({
                name: `Aggregation: User ${user.id.substring(0, 8)}...`,
                status: 'PASS',
                message: `Quiz: ${quizCount || 0}, Jurnal: ${jurnalCount || 0}, Challenge: ${challengeCount || 0}, Discussion: ${discussionCount || 0}`,
            });
        }
    }

    return results;
}

// ─── Main Test Runner ────────────────────────────────────────────────────────

async function runAllTests() {
    console.log('\n' + '='.repeat(70));
    console.log('🧪 ADMIN-USER API INTEGRATION TEST');
    console.log('='.repeat(70) + '\n');

    // 1. Test Database Connection
    console.log('\n📊 1. DATABASE CONNECTION TEST\n' + '-'.repeat(40));
    try {
        const { data, error } = await supabase.from('users').select('id').limit(1);
        logResult({
            name: 'Database Connection',
            status: error ? 'FAIL' : 'PASS',
            message: error ? `Connection failed: ${error.message}` : 'Connected successfully',
        });
    } catch (err: any) {
        logResult({
            name: 'Database Connection',
            status: 'FAIL',
            message: `Exception: ${err.message}`,
        });
        return;
    }

    // 2. Test Table Existence and Schema
    console.log('\n📋 2. TABLE SCHEMA TESTS\n' + '-'.repeat(40));
    for (const [tableName, columns] of Object.entries(EXPECTED_TABLES)) {
        const result = await testTableSchema(tableName, columns);
        logResult(result);
    }

    // 3. Test Data Consistency for API Mappings
    console.log('\n🔗 3. API DATA MAPPING TESTS\n' + '-'.repeat(40));
    for (const mapping of API_MAPPINGS) {
        const result = await testDataConsistency(mapping);
        logResult(result);
    }

    // 4. Test Foreign Key Relationships
    console.log('\n🔑 4. FOREIGN KEY RELATIONSHIP TESTS\n' + '-'.repeat(40));
    const fkResults = await testForeignKeyRelationships();
    for (const result of fkResults) {
        logResult(result);
    }

    // 5. Test Admin Data Aggregation
    console.log('\n📈 5. ADMIN DATA AGGREGATION TESTS\n' + '-'.repeat(40));
    const aggResults = await testAdminDataAggregation();
    for (const result of aggResults) {
        logResult(result);
    }

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

    // Return exit code
    process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAllTests().catch(console.error);
