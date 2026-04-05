# Testing Guide - PrincipleLearn V3

---

## Test Infrastructure

- **Jest** (v30) for API/unit tests — `tests/api/`, `tests/unit/`
- **Playwright** for E2E tests — `tests/e2e/`
- Coverage thresholds: branches 70%, functions 75%, lines 75%, statements 75%

---

## Commands

```bash
npm test                 # Run all Jest tests
npm run test:watch       # Jest watch mode
npm run test:coverage    # Jest with coverage report
npm run test:unit        # API tests only (tests/api/)
npm run test:e2e         # Playwright E2E tests
npm run test:all         # Jest + Playwright
npm run test:ci          # CI: Jest coverage + Playwright
```

Run a single test: `npx jest tests/api/auth/login.test.ts`

---

## Test Utilities

### `tests/setup/test-utils.ts`
- `createMockNextRequest()` — create mock NextRequest with body, cookies, headers
- `generateJWT()` — generate test JWT tokens
- `assertResponse()` — assert response status and body

### `tests/fixtures/`
- `users.fixture.ts` — `TEST_STUDENT`, `TEST_ADMIN`, `INVALID_USERS`
- `courses.fixture.ts` — `TEST_COURSE`, `ASK_QUESTION_REQUEST`

### `tests/setup/mocks/`
- `server.ts` — MSW server setup
- `handlers.ts` — Supabase + OpenAI mock handlers
- `openai.mock.ts` — Mock AI responses

---

## Debug Endpoints

```bash
# Test database connection
curl http://localhost:3000/api/test-db

# Debug users
curl http://localhost:3000/api/debug/users
```

---

## Testing Checklist

- [ ] `npm run build` succeeds
- [ ] `npm run lint` clean (0 errors)
- [ ] `npm test` passes
- [ ] New endpoints have tests

---

*Last updated: April 2026*
