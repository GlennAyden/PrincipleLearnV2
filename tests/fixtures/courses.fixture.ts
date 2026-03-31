import type { TestCourse } from '../setup/test-utils';
import { TEST_STUDENT, TEST_ADMIN } from './users.fixture';

/**
 * Test course for student learning
 */
export const TEST_COURSE: TestCourse = {
    id: 'test-course-id-001',
    title: 'Introduction to Software Testing',
    description: 'A comprehensive course covering fundamental concepts of software testing',
    subject: 'Computer Science',
    difficulty_level: 'beginner',
    created_by: TEST_STUDENT.id,
};

/**
 * Advanced test course
 */
export const TEST_COURSE_ADVANCED: TestCourse = {
    id: 'test-course-id-002',
    title: 'Advanced Testing Patterns',
    description: 'Learn advanced testing patterns and best practices',
    subject: 'Computer Science',
    difficulty_level: 'advanced',
    created_by: TEST_STUDENT.id,
};

/**
 * Admin-created course
 */
export const ADMIN_COURSE: TestCourse = {
    id: 'admin-course-id-001',
    title: 'Test-Driven Development',
    description: 'Master TDD principles and practices',
    subject: 'Software Engineering',
    difficulty_level: 'intermediate',
    created_by: TEST_ADMIN.id,
};

/**
 * Generate unique course fixture
 */
export function createCourseFixture(
    userId: string,
    overrides: Partial<TestCourse> = {}
): TestCourse {
    const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
        id: `course-${uniqueId}`,
        title: `Test Course ${uniqueId}`,
        description: 'A dynamically generated test course',
        subject: 'Testing',
        difficulty_level: 'beginner',
        created_by: userId,
        ...overrides,
    };
}

/**
 * Course generation request data
 */
export const COURSE_GENERATION_REQUEST = {
    valid: {
        topic: 'Introduction to Machine Learning',
        learningObjectives: [
            'Understand basic ML concepts',
            'Implement simple algorithms',
            'Evaluate model performance',
        ],
        difficultyLevel: 'beginner',
        targetAudience: 'Computer science students',
        language: 'English',
    },

    minimal: {
        topic: 'Quick Testing Guide',
    },

    invalid: {
        // Missing required topic
        learningObjectives: ['Learn something'],
    },
};

/**
 * Subtopic fixture for learning tests
 */
export const TEST_SUBTOPIC = {
    id: 'test-subtopic-001',
    course_id: TEST_COURSE.id,
    title: 'What is Software Testing?',
    content: {
        explanation: 'Software testing is the process of evaluating and verifying that a software application does what it is supposed to do.',
        key_concepts: [
            'Verification vs Validation',
            'Test cases',
            'Bug detection',
            'Quality assurance',
        ],
        examples: [
            {
                title: 'Unit Test Example',
                code: 'expect(add(2, 2)).toBe(4);',
                description: 'A simple unit test checking addition',
            },
        ],
    },
    order_index: 0,
};

/**
 * Second subtopic for pagination/navigation tests
 */
export const TEST_SUBTOPIC_2 = {
    id: 'test-subtopic-002',
    course_id: TEST_COURSE.id,
    title: 'Types of Testing',
    content: {
        explanation: 'There are various types of testing, each serving different purposes.',
        key_concepts: [
            'Unit testing',
            'Integration testing',
            'System testing',
            'Acceptance testing',
        ],
        examples: [
            {
                title: 'Integration Test',
                code: 'await request(app).get("/api/users").expect(200);',
                description: 'Testing API endpoints',
            },
        ],
    },
    order_index: 1,
};

/**
 * Quiz data for testing
 */
export const TEST_QUIZ = {
    questions: [
        {
            id: 'quiz-q1',
            question: 'What is the primary purpose of unit testing?',
            options: [
                'To test the entire system',
                'To test individual components in isolation',
                'To test user interface',
                'To test performance',
            ],
            correctAnswer: 1,
        },
        {
            id: 'quiz-q2',
            question: 'Which framework is commonly used for JavaScript testing?',
            options: ['JUnit', 'Jest', 'PyTest', 'NUnit'],
            correctAnswer: 1,
        },
    ],
};

/**
 * Quiz submission data
 */
export const QUIZ_SUBMISSION = {
    valid: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        answers: [
            { questionId: 'quiz-q1', selectedAnswer: 1 },
            { questionId: 'quiz-q2', selectedAnswer: 1 },
        ],
    },

    partial: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        answers: [
            { questionId: 'quiz-q1', selectedAnswer: 0 }, // Wrong answer
            { questionId: 'quiz-q2', selectedAnswer: 1 }, // Correct
        ],
    },

    invalid: {
        // Missing courseId
        subtopicId: TEST_SUBTOPIC.id,
        answers: [],
    },
};

/**
 * Ask question request data
 */
export const ASK_QUESTION_REQUEST = {
    valid: {
        question: 'What is the difference between unit testing and integration testing?',
        context: TEST_SUBTOPIC.content.explanation,
        userId: TEST_STUDENT.id,
        courseId: TEST_COURSE.id,
        subtopic: TEST_SUBTOPIC.title,
    },

    minimal: {
        question: 'Explain testing',
        context: 'Software testing basics',
        userId: TEST_STUDENT.id,
        courseId: TEST_COURSE.id,
    },

    withMetadata: {
        question: 'How do I write a good test?',
        context: TEST_SUBTOPIC.content.explanation,
        userId: TEST_STUDENT.id,
        courseId: TEST_COURSE.id,
        subtopic: TEST_SUBTOPIC.title,
        moduleIndex: 0,
        subtopicIndex: 0,
        pageNumber: 1,
        sessionNumber: 1,
    },

    invalid: {
        // Missing required question
        context: 'Some context',
        userId: TEST_STUDENT.id,
    },
};

/**
 * Feedback submission data
 */
export const FEEDBACK_DATA = {
    valid: {
        courseId: TEST_COURSE.id,
        rating: 5,
        comment: 'Great course! Very helpful for understanding testing concepts.',
        type: 'course',
    },

    subtopicFeedback: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        rating: 4,
        comment: 'The examples were very clear.',
        type: 'subtopic',
    },

    negative: {
        courseId: TEST_COURSE.id,
        rating: 2,
        comment: 'Could use more practical examples.',
        type: 'course',
    },

    invalid: {
        // Missing rating
        courseId: TEST_COURSE.id,
        comment: 'Some feedback',
    },
};

/**
 * Journal entry data
 */
export const JOURNAL_DATA = {
    valid: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        content: 'Today I learned about software testing fundamentals. Key insight: testing is not just about finding bugs, but ensuring quality.',
        reflection: 'I need to practice writing more test cases.',
    },

    minimal: {
        courseId: TEST_COURSE.id,
        content: 'Learning notes',
    },

    invalid: {
        // Missing courseId
        content: 'Some content',
    },
};

/**
 * Discussion data
 */
export const DISCUSSION_DATA = {
    valid: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        topic: 'Best practices for unit testing',
        content: 'What are your thoughts on test coverage? How much is enough?',
    },

    reply: {
        parentId: 'discussion-001',
        content: 'I think 80% coverage is a good target for most projects.',
    },

    invalid: {
        // Missing topic
        courseId: TEST_COURSE.id,
        content: 'Some discussion',
    },
};
