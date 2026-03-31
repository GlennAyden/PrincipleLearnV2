import type { TestUser } from '../setup/test-utils';

/**
 * Default test student credentials
 * Used for user journey tests
 */
export const TEST_STUDENT: TestUser = {
    id: 'test-student-id-001',
    email: 'test-student@example.com',
    password: 'TestPassword123!',
    role: 'user',
    name: 'Test Student',
};

/**
 * Default test admin credentials
 * Used for admin journey tests
 */
export const TEST_ADMIN: TestUser = {
    id: 'test-admin-id-001',
    email: 'test-admin@example.com',
    password: 'AdminPassword123!',
    role: 'ADMIN',
    name: 'Test Admin',
};

/**
 * Secondary test student for multi-user scenarios
 */
export const TEST_STUDENT_2: TestUser = {
    id: 'test-student-id-002',
    email: 'test-student-2@example.com',
    password: 'TestPassword123!',
    role: 'user',
    name: 'Test Student 2',
};

/**
 * Generate unique student fixture
 * Creates a new student with unique identifiers
 */
export function createStudentFixture(suffix?: string): TestUser {
    const uniqueId = suffix || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
        id: `student-${uniqueId}`,
        email: `student-${uniqueId}@example.com`,
        password: 'TestPassword123!',
        role: 'user',
        name: `Student ${uniqueId}`,
    };
}

/**
 * Generate unique admin fixture
 * Creates a new admin with unique identifiers
 */
export function createAdminFixture(suffix?: string): TestUser {
    const uniqueId = suffix || `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    return {
        id: `admin-${uniqueId}`,
        email: `admin-${uniqueId}@example.com`,
        password: 'AdminPassword123!',
        role: 'ADMIN',
        name: `Admin ${uniqueId}`,
    };
}

/**
 * Invalid user data for validation testing
 */
export const INVALID_USERS = {
    // Missing email
    missingEmail: {
        password: 'TestPassword123!',
        name: 'Test User',
    },

    // Missing password
    missingPassword: {
        email: 'test@example.com',
        name: 'Test User',
    },

    // Invalid email format
    invalidEmail: {
        email: 'not-an-email',
        password: 'TestPassword123!',
        name: 'Test User',
    },

    // Weak password (too short)
    weakPassword: {
        email: 'test@example.com',
        password: '123',
        name: 'Test User',
    },

    // Empty values
    emptyEmail: {
        email: '',
        password: 'TestPassword123!',
        name: 'Test User',
    },

    emptyPassword: {
        email: 'test@example.com',
        password: '',
        name: 'Test User',
    },
};

/**
 * User registration data
 */
export const REGISTRATION_DATA = {
    valid: {
        email: 'newuser@example.com',
        password: 'NewUserPassword123!',
        name: 'New User',
    },

    duplicate: {
        email: TEST_STUDENT.email,
        password: 'TestPassword123!',
        name: 'Duplicate User',
    },
};

/**
 * Login credentials for testing
 */
export const LOGIN_CREDENTIALS = {
    validStudent: {
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
    },

    validAdmin: {
        email: TEST_ADMIN.email,
        password: TEST_ADMIN.password,
    },

    invalidEmail: {
        email: 'nonexistent@example.com',
        password: 'SomePassword123!',
    },

    invalidPassword: {
        email: TEST_STUDENT.email,
        password: 'WrongPassword123!',
    },

    withRememberMe: {
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
        rememberMe: true,
    },

    withoutRememberMe: {
        email: TEST_STUDENT.email,
        password: TEST_STUDENT.password,
        rememberMe: false,
    },
};
