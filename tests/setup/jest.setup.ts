import '@testing-library/jest-dom';

// Polyfill fetch API for Node.js environment (required for MSW v2)
import { TextEncoder, TextDecoder } from 'util';

Object.assign(globalThis, {
    TextEncoder,
    TextDecoder,
});

// Only import and use MSW server if available
let server: { listen: (opts?: object) => void; resetHandlers: () => void; close: () => void } | null = null;

try {
    // Dynamic import to avoid issues if MSW setup fails
    const mswServer = require('./mocks/server');
    server = mswServer.server;
} catch {
    console.warn('MSW server not available, skipping mock setup');
}

// Establish API mocking before all tests
beforeAll(() => {
    server?.listen({ onUnhandledRequest: 'warn' });
});

// Reset any request handlers that are declared during tests
afterEach(() => {
    server?.resetHandlers();
});

// Clean up after tests are finished
afterAll(() => {
    server?.close();
});

// Mock environment variables for testing
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-purposes-only';
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
process.env.OPENAI_API_KEY = 'test-openai-api-key';

// Suppress console errors during tests (optional - comment out if you need to debug)
const originalConsoleError = console.error;
beforeAll(() => {
    console.error = (...args: unknown[]) => {
        // Filter out specific expected errors
        const message = args[0];
        if (
            typeof message === 'string' &&
            (message.includes('Warning: ReactDOM.render is no longer supported') ||
                message.includes('Not implemented: navigation'))
        ) {
            return;
        }
        originalConsoleError.call(console, ...args);
    };
});

afterAll(() => {
    console.error = originalConsoleError;
});

// Global test timeout
jest.setTimeout(30000);

// Mock crypto for UUID generation in tests
Object.defineProperty(globalThis, 'crypto', {
    value: {
        randomUUID: () => 'test-uuid-' + Math.random().toString(36).substring(7),
        getRandomValues: (arr: Uint8Array) => {
            for (let i = 0; i < arr.length; i++) {
                arr[i] = Math.floor(Math.random() * 256);
            }
            return arr;
        },
    },
});
