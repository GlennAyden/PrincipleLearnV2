# PrincipleLearn V3 Test Suite

## Overview

This test suite provides comprehensive testing coverage for the PrincipleLearn V3 application, including:

- **API Tests (Jest)**: Unit tests for API endpoints with mocked dependencies
- **E2E Tests (Playwright)**: End-to-end browser tests for user and admin journeys

## Quick Start

### Running Tests

```bash
# Run all unit tests (Jest)
npm test

# Run unit tests in watch mode
npm run test:watch

# Run unit tests with coverage
npm run test:coverage

# Run E2E tests (Playwright)
npm run test:e2e

# Run E2E tests with UI
npm run test:e2e:ui

# Run E2E tests in headed mode (visible browser)
npm run test:e2e:headed

# Run all tests (unit + E2E)
npm run test:all
```

### First Time Setup

```bash
# Install Playwright browsers (required for E2E tests)
npm run playwright:install
```

## Test Structure

```
tests/
├── api/                    # API endpoint tests (Jest)
│   ├── auth/              # Authentication tests
│   │   ├── login.test.ts
│   │   ├── register.test.ts
│   │   ├── me.test.ts
│   │   └── logout.test.ts
│   ├── learning/          # Learning endpoint tests
│   │   └── ask-question.test.ts
│   └── admin/             # Admin endpoint tests
│       └── dashboard.test.ts
├── e2e/                   # E2E browser tests (Playwright)
│   ├── user/              # User journey tests
│   │   └── signup-login.spec.ts
│   └── admin/             # Admin journey tests
│       └── admin-dashboard.spec.ts
├── fixtures/              # Test data fixtures
│   ├── users.fixture.ts
│   └── courses.fixture.ts
├── setup/                 # Test setup & utilities
│   ├── jest.setup.ts
│   ├── test-utils.ts
│   └── mocks/
│       ├── server.ts
│       ├── handlers.ts
│       └── openai.mock.ts
└── types/                 # Type definitions
    └── test.types.ts
```

## Configuration Files

- `jest.config.ts` - Jest configuration for API tests
- `playwright.config.ts` - Playwright configuration for E2E tests

## Test Coverage

### API Tests Cover:

1. **Authentication (`/api/auth/*`)**
   - Login with valid/invalid credentials
   - User registration with validation
   - Session management (me endpoint)
   - Logout and cookie clearing

2. **Learning (`/api/ask-question`, etc.)**
   - Question answering with AI (OpenAI mocked)
   - Request validation
   - Authentication requirements
   - Error handling

3. **Admin (`/api/admin/*`)**
   - Dashboard statistics
   - Admin authorization
   - User management

### E2E Tests Cover:

1. **User Journey**
   - Signup flow with validation
   - Login flow with error handling
   - Session persistence
   - Logout functionality

2. **Admin Journey**
   - Admin login
   - Dashboard access
   - User management
   - Activity monitoring
   - Authorization checks

## Mocking Strategy

### OpenAI Mocking
OpenAI API calls are mocked using MSW (Mock Service Worker) to:
- Provide consistent test responses
- Avoid API costs during testing
- Enable CI/CD pipeline testing

### Database Mocking
Database operations are mocked using Jest mocks to:
- Isolate tests from real database
- Control test data
- Speed up test execution

## Writing New Tests

### API Test Example

```typescript
import { createMockNextRequest, createAuthContext } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// Mock dependencies
jest.mock('@/lib/database', () => ({
    default: { getRecords: jest.fn() },
}));

describe('POST /api/your-endpoint', () => {
    it('should handle valid request', async () => {
        const auth = createAuthContext(TEST_STUDENT);
        
        const request = createMockNextRequest('POST', '/api/your-endpoint', {
            body: { /* your test data */ },
            cookies: { access_token: auth.token },
        });

        const response = await POST(request);
        expect(response.status).toBe(200);
    });
});
```

### E2E Test Example

```typescript
import { test, expect } from '@playwright/test';

test.describe('Feature Name', () => {
    test('should do something', async ({ page }) => {
        await page.goto('/your-page');
        await page.fill('input[name="field"]', 'value');
        await page.click('button[type="submit"]');
        await expect(page).toHaveURL(/expected-url/);
    });
});
```

## Troubleshooting

### Common Issues

1. **"Response is not defined" error**
   - Ensure `testEnvironment: 'node'` in jest.config.ts
   - MSW v2 requires Node.js 18+ with fetch API

2. **Module not found errors**
   - Check path aliases in jest.config.ts (`moduleNameMapper`)
   - Ensure tsconfig.json paths are correctly mapped

3. **Playwright browser not found**
   - Run `npm run playwright:install`

4. **Tests hanging**
   - Check for unresolved promises
   - Increase `testTimeout` in jest.config.ts

## CI/CD Integration

```bash
# For CI environments
npm run test:ci
```

This command runs both Jest and Playwright tests with CI-specific options:
- Coverage reporting enabled
- Non-interactive mode
- Single worker for stability

## Environment Variables

Tests use mocked environment variables defined in `tests/setup/jest.setup.ts`:

```typescript
process.env.JWT_SECRET = 'test-jwt-secret-key';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-api-key';
```

## Contributing

When adding new tests:
1. Follow existing naming conventions
2. Add fixtures for reusable test data
3. Mock external dependencies
4. Include both success and error cases
5. Update this README if adding new test categories
