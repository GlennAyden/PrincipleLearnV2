/**
 * Notion Database Service for PrincipleLearn V3
 * 
 * This service provides CRUD operations for all entities using Notion as the database.
 * Designed for 50-70 users with rate limiting and caching.
 */

// Database Page IDs from Notion
export const NOTION_DATABASE_IDS = {
  ROOT_PAGE: '2fd32a17-dd09-80e5-be49-e15432114496',
  USERS: '2fd32a17-dd09-81ba-b18a-d54b0a6d0c75',
  COURSES: '2fd32a17-dd09-81be-96c2-c170b4c240f1',
  SUBTOPICS: '2fd32a17-dd09-81d8-bb5e-f9f8790fddc8',
  QUIZ: '2fd32a17-dd09-813e-9d86-c280bdcbaf4a',
  QUIZ_SUBMISSIONS: '2fd32a17-dd09-816c-ad4b-f1ba947a3f7a',
  JOURNALS: '2fd32a17-dd09-81a3-b86b-e4b1e93f2ba5',
  USER_PROGRESS: '2fd32a17-dd09-81df-94f4-ebcb8db1c1da',
  FEEDBACK: '2fd32a17-dd09-8159-a233-d001f89e5af4',
} as const;

// Types
export interface NotionUser {
  id: string;
  email: string;
  name: string | null;
  passwordHash: string;
  role: 'user' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
}

export interface NotionCourse {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  difficultyLevel: string | null;
  estimatedDuration: number | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotionSubtopic {
  id: string;
  courseId: string | null;
  title: string;
  content: string | null;
  orderIndex: number;
  createdAt: string;
  updatedAt: string;
}

export interface NotionQuiz {
  id: string;
  courseId: string | null;
  subtopicId: string | null;
  question: string;
  options: string[] | null;
  correctAnswer: string | null;
  explanation: string | null;
  createdAt: string;
}

export interface NotionQuizSubmission {
  id: string;
  userId: string | null;
  quizId: string | null;
  answer: string | null;
  isCorrect: boolean | null;
  submittedAt: string;
}

export interface NotionJournal {
  id: string;
  userId: string | null;
  courseId: string | null;
  content: string;
  reflection: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotionUserProgress {
  id: string;
  userId: string | null;
  courseId: string | null;
  subtopicId: string | null;
  isCompleted: boolean;
  completionDate: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotionFeedback {
  id: string;
  userId: string | null;
  courseId: string | null;
  subtopicId: string | null;
  rating: number;
  comment: string | null;
  createdAt: string;
}

// Simple in-memory cache
const cache = new Map<string, { data: unknown; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCached<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && cached.expiry > Date.now()) {
    return cached.data as T;
  }
  cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown): void {
  cache.set(key, { data, expiry: Date.now() + CACHE_TTL });
}

function clearCache(prefix?: string): void {
  if (prefix) {
    for (const key of cache.keys()) {
      if (key.startsWith(prefix)) {
        cache.delete(key);
      }
    }
  } else {
    cache.clear();
  }
}

// Rate limiting queue with multi-token support
const requestQueue: Array<() => Promise<unknown>> = [];
let isProcessing = false;

// Multi-token configuration for load balancing
// With 3 tokens, we get 9 req/s effective rate limit
const NOTION_TOKENS = [
  process.env.NOTION_TOKEN_1,
  process.env.NOTION_TOKEN_2,
  process.env.NOTION_TOKEN_3,
].filter(Boolean) as string[];

// Track current token index for round-robin
let currentTokenIndex = 0;

// Calculate rate limit based on number of tokens
// Base rate is ~3 req/s per token, with multiple tokens we can go faster
const TOKEN_COUNT = NOTION_TOKENS.length || 1;
const RATE_LIMIT_MS = Math.max(100, Math.floor(333 / TOKEN_COUNT)); // ~120ms with 3 tokens

// Get next token using round-robin
function getNextToken(): string {
  if (NOTION_TOKENS.length === 0) {
    // Fallback to legacy single token
    const legacyToken = process.env.NOTION_API_KEY;
    if (!legacyToken) {
      throw new Error('No Notion tokens configured. Set NOTION_TOKEN_1, NOTION_TOKEN_2, NOTION_TOKEN_3 or NOTION_API_KEY');
    }
    return legacyToken;
  }

  const token = NOTION_TOKENS[currentTokenIndex];
  currentTokenIndex = (currentTokenIndex + 1) % NOTION_TOKENS.length;
  return token;
}

// Export token stats for monitoring
export function getTokenStats() {
  return {
    tokenCount: TOKEN_COUNT,
    effectiveRateLimit: `${(TOKEN_COUNT * 3).toFixed(0)} req/s`,
    currentTokenIndex,
    rateLimitMs: RATE_LIMIT_MS,
  };
}

async function processQueue(): Promise<void> {
  if (isProcessing) return;
  isProcessing = true;

  while (requestQueue.length > 0) {
    const request = requestQueue.shift();
    if (request) {
      await request();
      await new Promise(resolve => setTimeout(resolve, RATE_LIMIT_MS));
    }
  }

  isProcessing = false;
}

function queueRequest<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    requestQueue.push(async () => {
      try {
        const result = await fn();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });
    processQueue();
  });
}

// Notion API helper with multi-token load balancing
async function notionFetch(endpoint: string, options: globalThis.RequestInit = {}, retries = 3): Promise<Response> {
  const token = getNextToken();

  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  // Handle rate limiting with retry
  if (response.status === 429 && retries > 0) {
    const retryAfter = parseInt(response.headers.get('Retry-After') || '1', 10);
    console.warn(`[Notion] Rate limited, retrying after ${retryAfter}s (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
    return notionFetch(endpoint, options, retries - 1);
  }

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`Notion API Error: ${error.message}`);
  }

  return response;
}

/**
 * Notion Database Service
 * 
 * Provides CRUD operations for all PrincipleLearn entities.
 * Uses Notion pages as database records (stored as children of database pages).
 */
export class NotionDatabaseService {
  // ==================== USERS ====================

  static async getUsers(): Promise<NotionUser[]> {
    const cacheKey = 'users:all';
    const cached = getCached<NotionUser[]>(cacheKey);
    if (cached) return cached;

    return queueRequest(async () => {
      const response = await notionFetch(`/blocks/${NOTION_DATABASE_IDS.USERS}/children`);
      const data = await response.json();

      const users: NotionUser[] = data.results
        .filter((block: { type: string }) => block.type === 'child_page')
        .map((block: { id: string; child_page: { title: string }; created_time: string; last_edited_time: string }) => ({
          id: block.id,
          email: '', // Will need to fetch page properties
          name: block.child_page.title,
          passwordHash: '',
          role: 'user' as const,
          createdAt: block.created_time,
          updatedAt: block.last_edited_time,
        }));

      setCache(cacheKey, users);
      return users;
    });
  }

  static async getUserByEmail(email: string): Promise<NotionUser | null> {
    const cacheKey = `users:email:${email}`;
    const cached = getCached<NotionUser | null>(cacheKey);
    if (cached !== null) return cached;

    // Search in users database
    return queueRequest(async () => {
      const response = await notionFetch('/search', {
        method: 'POST',
        body: JSON.stringify({
          query: email,
          filter: { property: 'object', value: 'page' },
        }),
      });

      const data = await response.json();
      const userPage = data.results.find((page: { parent?: { page_id?: string } }) =>
        page.parent?.page_id === NOTION_DATABASE_IDS.USERS
      );

      if (!userPage) {
        setCache(cacheKey, null);
        return null;
      }

      // Get full page details
      const pageResponse = await notionFetch(`/pages/${userPage.id}`);
      const pageData = await pageResponse.json();

      const user: NotionUser = {
        id: pageData.id,
        email: email,
        name: pageData.properties?.title?.title?.[0]?.plain_text || null,
        passwordHash: '',
        role: 'user',
        createdAt: pageData.created_time,
        updatedAt: pageData.last_edited_time,
      };

      setCache(cacheKey, user);
      return user;
    });
  }

  static async createUser(userData: Omit<NotionUser, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotionUser> {
    clearCache('users:');

    return queueRequest(async () => {
      const response = await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { page_id: NOTION_DATABASE_IDS.USERS },
          properties: {
            title: {
              title: [{ text: { content: userData.email } }],
            },
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Name: ${userData.name || 'N/A'}` } },
                ],
              },
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Role: ${userData.role}` } },
                ],
              },
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Password Hash: ${userData.passwordHash}` } },
                ],
              },
            },
          ],
        }),
      });

      const data = await response.json();

      return {
        id: data.id,
        email: userData.email,
        name: userData.name,
        passwordHash: userData.passwordHash,
        role: userData.role,
        createdAt: data.created_time,
        updatedAt: data.last_edited_time,
      };
    });
  }

  // ==================== COURSES ====================

  static async getCourses(): Promise<NotionCourse[]> {
    const cacheKey = 'courses:all';
    const cached = getCached<NotionCourse[]>(cacheKey);
    if (cached) return cached;

    return queueRequest(async () => {
      const response = await notionFetch(`/blocks/${NOTION_DATABASE_IDS.COURSES}/children`);
      const data = await response.json();

      const courses: NotionCourse[] = data.results
        .filter((block: { type: string }) => block.type === 'child_page')
        .map((block: { id: string; child_page: { title: string }; created_time: string; last_edited_time: string }) => ({
          id: block.id,
          title: block.child_page.title,
          description: null,
          subject: null,
          difficultyLevel: null,
          estimatedDuration: null,
          createdById: null,
          createdAt: block.created_time,
          updatedAt: block.last_edited_time,
        }));

      setCache(cacheKey, courses);
      return courses;
    });
  }

  static async getCourseById(id: string): Promise<NotionCourse | null> {
    const cacheKey = `courses:id:${id}`;
    const cached = getCached<NotionCourse | null>(cacheKey);
    if (cached !== null) return cached;

    return queueRequest(async () => {
      const response = await notionFetch(`/pages/${id}`);
      const data = await response.json();

      const course: NotionCourse = {
        id: data.id,
        title: data.properties?.title?.title?.[0]?.plain_text || '',
        description: null,
        subject: null,
        difficultyLevel: null,
        estimatedDuration: null,
        createdById: null,
        createdAt: data.created_time,
        updatedAt: data.last_edited_time,
      };

      setCache(cacheKey, course);
      return course;
    });
  }

  static async createCourse(courseData: Omit<NotionCourse, 'id' | 'createdAt' | 'updatedAt'>): Promise<NotionCourse> {
    clearCache('courses:');

    return queueRequest(async () => {
      const response = await notionFetch('/pages', {
        method: 'POST',
        body: JSON.stringify({
          parent: { page_id: NOTION_DATABASE_IDS.COURSES },
          properties: {
            title: {
              title: [{ text: { content: courseData.title } }],
            },
          },
          children: [
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Description: ${courseData.description || 'N/A'}` } },
                ],
              },
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Subject: ${courseData.subject || 'N/A'}` } },
                ],
              },
            },
            {
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [
                  { type: 'text', text: { content: `Difficulty: ${courseData.difficultyLevel || 'N/A'}` } },
                ],
              },
            },
          ],
        }),
      });

      const data = await response.json();

      return {
        id: data.id,
        title: courseData.title,
        description: courseData.description,
        subject: courseData.subject,
        difficultyLevel: courseData.difficultyLevel,
        estimatedDuration: courseData.estimatedDuration,
        createdById: courseData.createdById,
        createdAt: data.created_time,
        updatedAt: data.last_edited_time,
      };
    });
  }

  // ==================== UTILITY METHODS ====================

  static clearAllCache(): void {
    clearCache();
  }

  static getDatabaseIds() {
    return NOTION_DATABASE_IDS;
  }
}

export default NotionDatabaseService;
