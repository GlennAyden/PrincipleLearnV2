/**
 * Database Service - Notion Implementation
 * 
 * This module replaces Supabase with Notion as the database backend.
 * All existing API routes will work without changes since they use DatabaseService.
 * 
 * Target: 50-70 users (within Notion API rate limits)
 */

const NOTION_DATABASE_IDS = {
  ROOT_PAGE: process.env.NOTION_DATABASE_PAGE_ID || '2fd32a17-dd09-80e5-be49-e15432114496',
  USERS: process.env.NOTION_USERS_DB_ID || '2fd32a17-dd09-81ba-b18a-d54b0a6d0c75',
  COURSES: process.env.NOTION_COURSES_DB_ID || '2fd32a17-dd09-81be-96c2-c170b4c240f1',
  SUBTOPICS: process.env.NOTION_SUBTOPICS_DB_ID || '2fd32a17-dd09-81d8-bb5e-f9f8790fddc8',
  QUIZ: process.env.NOTION_QUIZ_DB_ID || '2fd32a17-dd09-813e-9d86-c280bdcbaf4a',
  QUIZ_SUBMISSIONS: process.env.NOTION_QUIZ_SUBMISSIONS_DB_ID || '2fd32a17-dd09-816c-ad4b-f1ba947a3f7a',
  JOURNALS: process.env.NOTION_JOURNALS_DB_ID || '2fd32a17-dd09-81a3-b86b-e4b1e93f2ba5',
  USER_PROGRESS: process.env.NOTION_USER_PROGRESS_DB_ID || '2fd32a17-dd09-81df-94f4-ebcb8db1c1da',
  FEEDBACK: process.env.NOTION_FEEDBACK_DB_ID || '2fd32a17-dd09-8159-a233-d001f89e5af4',
  // New tables for discussion and caching
  SUBTOPIC_CACHE: process.env.NOTION_SUBTOPIC_CACHE_DB_ID || '',
  DISCUSSION_SESSIONS: process.env.NOTION_DISCUSSION_SESSIONS_DB_ID || '',
  DISCUSSION_MESSAGES: process.env.NOTION_DISCUSSION_MESSAGES_DB_ID || '',
  DISCUSSION_TEMPLATES: process.env.NOTION_DISCUSSION_TEMPLATES_DB_ID || '',
  API_LOGS: process.env.NOTION_API_LOGS_DB_ID || '',
  COURSE_GENERATION_ACTIVITY: process.env.NOTION_COURSE_GENERATION_ACTIVITY_DB_ID || '',
} as const;

// Table name to Notion page ID mapping
const TABLE_MAPPING: Record<string, string> = {
  'users': NOTION_DATABASE_IDS.USERS,
  'courses': NOTION_DATABASE_IDS.COURSES,
  'subtopics': NOTION_DATABASE_IDS.SUBTOPICS,
  'quiz': NOTION_DATABASE_IDS.QUIZ,
  'quiz_submissions': NOTION_DATABASE_IDS.QUIZ_SUBMISSIONS,
  'jurnal': NOTION_DATABASE_IDS.JOURNALS,
  'user_progress': NOTION_DATABASE_IDS.USER_PROGRESS,
  'feedback': NOTION_DATABASE_IDS.FEEDBACK,
  // New tables for discussion and caching
  'subtopic_cache': NOTION_DATABASE_IDS.SUBTOPIC_CACHE,
  'discussion_sessions': NOTION_DATABASE_IDS.DISCUSSION_SESSIONS,
  'discussion_messages': NOTION_DATABASE_IDS.DISCUSSION_MESSAGES,
  'discussion_templates': NOTION_DATABASE_IDS.DISCUSSION_TEMPLATES,
  'api_logs': NOTION_DATABASE_IDS.API_LOGS,
  'course_generation_activity': NOTION_DATABASE_IDS.COURSE_GENERATION_ACTIVITY,
};

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

// Rate limiting queue
const requestQueue: Array<() => Promise<unknown>> = [];
let isProcessing = false;
const RATE_LIMIT_MS = 350; // ~3 requests per second

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

// Notion API helper
async function notionFetch(endpoint: string, options: RequestInit = {}): Promise<Response> {
  const NOTION_API_KEY = process.env.NOTION_API_KEY;

  if (!NOTION_API_KEY) {
    throw new DatabaseError('NOTION_API_KEY is not configured');
  }

  const response = await fetch(`https://api.notion.com/v1${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${NOTION_API_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new DatabaseError(`Notion API Error: ${error.message}`);
  }

  return response;
}

// Parse Notion page content to extract data
interface NotionBlock {
  id: string;
  type: string;
  paragraph?: {
    rich_text: Array<{
      plain_text: string;
    }>;
  };
  child_page?: {
    title: string;
  };
  created_time: string;
  last_edited_time: string;
}

interface PageRecord {
  id: string;
  [key: string]: any;
}

async function parsePageContent(pageId: string): Promise<Record<string, any>> {
  const response = await notionFetch(`/blocks/${pageId}/children`);
  const data = await response.json();

  const record: Record<string, any> = { id: pageId };

  // Parse blocks to extract field values
  for (const block of data.results as NotionBlock[]) {
    if (block.type === 'paragraph' && block.paragraph?.rich_text?.length) {
      const text = block.paragraph.rich_text[0].plain_text;
      const match = text.match(/^(.+?):\s*(.+)$/);
      if (match) {
        const [, key, value] = match;
        const fieldName = key.toLowerCase().replace(/\s+/g, '_');
        record[fieldName] = value === 'N/A' ? null : value;
      }
    }
  }

  // Get page metadata
  const pageResponse = await notionFetch(`/pages/${pageId}`);
  const pageData = await pageResponse.json();
  record.created_at = pageData.created_time;
  record.updated_at = pageData.last_edited_time;

  // Extract title as the first field (usually email or title)
  if (pageData.properties?.title?.title?.length) {
    record._title = pageData.properties.title.title[0].plain_text;
  }

  return record;
}

// Database Error class
export class DatabaseError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const response = await notionFetch(`/pages/${NOTION_DATABASE_IDS.ROOT_PAGE}`);
    return response.ok;
  } catch (error) {
    console.error('Notion connection test failed:', error);
    return false;
  }
}

/**
 * DatabaseService - Notion Implementation
 * 
 * Drop-in replacement for Supabase-based DatabaseService.
 * All existing API routes will work without changes.
 */
export class DatabaseService {

  // Get records from a "table" (Notion page with child pages)
  static async getRecords<T>(
    tableName: string,
    options?: {
      select?: string;
      filter?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      useServiceRole?: boolean;
    }
  ): Promise<T[]> {
    const pageId = TABLE_MAPPING[tableName];
    if (!pageId) {
      throw new DatabaseError(`Unknown table: ${tableName}`);
    }

    const cacheKey = `${tableName}:${JSON.stringify(options?.filter || {})}`;
    const cached = getCached<T[]>(cacheKey);
    if (cached) return cached;

    return queueRequest(async () => {
      try {
        // Get all child pages from the table page
        const response = await notionFetch(`/blocks/${pageId}/children`);
        const data = await response.json();

        const childPages = data.results.filter(
          (block: NotionBlock) => block.type === 'child_page'
        );

        // Parse each child page to get records
        const records: T[] = [];

        for (const page of childPages) {
          const record = await parsePageContent(page.id);

          // Map to expected field names based on table
          const mappedRecord = mapNotionToRecord(tableName, record, page);

          // Apply filter
          let matchesFilter = true;
          if (options?.filter) {
            for (const [key, value] of Object.entries(options.filter)) {
              if (mappedRecord[key] !== value) {
                matchesFilter = false;
                break;
              }
            }
          }

          if (matchesFilter) {
            records.push(mappedRecord as T);
          }

          // Apply limit
          if (options?.limit && records.length >= options.limit) {
            break;
          }
        }

        // Apply ordering
        if (options?.orderBy) {
          records.sort((a: any, b: any) => {
            const aVal = a[options.orderBy!.column];
            const bVal = b[options.orderBy!.column];
            const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
            return options.orderBy!.ascending !== false ? comparison : -comparison;
          });
        }

        setCache(cacheKey, records);
        return records;
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError(`Failed to get records from ${tableName}`, error);
      }
    });
  }

  // Insert a record
  static async insertRecord<T>(
    tableName: string,
    data: Partial<T>,
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    const pageId = TABLE_MAPPING[tableName];
    if (!pageId) {
      throw new DatabaseError(`Unknown table: ${tableName}`);
    }

    clearCache(tableName);

    return queueRequest(async () => {
      try {
        // Create child blocks for each field
        const children = Object.entries(data)
          .filter(([, value]) => value !== undefined)
          .map(([key, value]) => ({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [
                {
                  type: 'text',
                  text: { content: `${formatFieldName(key)}: ${value ?? 'N/A'}` }
                }
              ]
            }
          }));

        // Determine title from data
        const title = getRecordTitle(tableName, data as Record<string, any>);

        // Create page
        const response = await notionFetch('/pages', {
          method: 'POST',
          body: JSON.stringify({
            parent: { page_id: pageId },
            properties: {
              title: {
                title: [{ text: { content: title } }]
              }
            },
            children
          })
        });

        const result = await response.json();

        return {
          id: result.id,
          ...data,
          created_at: result.created_time,
          updated_at: result.last_edited_time,
        } as T;
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError(`Failed to insert record into ${tableName}`, error);
      }
    });
  }

  // Update a record
  static async updateRecord<T>(
    tableName: string,
    id: string | number,
    data: Partial<T>,
    idColumn: string = 'id',
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    clearCache(tableName);

    return queueRequest(async () => {
      try {
        // Get existing page content
        const existingResponse = await notionFetch(`/blocks/${id}/children`);
        const existingData = await existingResponse.json();

        // Update each block that matches a field in data
        for (const block of existingData.results as NotionBlock[]) {
          if (block.type === 'paragraph' && block.paragraph?.rich_text?.length) {
            const text = block.paragraph.rich_text[0].plain_text;
            const match = text.match(/^(.+?):\s*/);
            if (match) {
              const fieldName = match[1].toLowerCase().replace(/\s+/g, '_');
              if (fieldName in (data as Record<string, any>)) {
                // Update this block
                await notionFetch(`/blocks/${block.id}`, {
                  method: 'PATCH',
                  body: JSON.stringify({
                    paragraph: {
                      rich_text: [
                        {
                          type: 'text',
                          text: {
                            content: `${match[1]}: ${(data as Record<string, any>)[fieldName] ?? 'N/A'}`
                          }
                        }
                      ]
                    }
                  })
                });
              }
            }
          }
        }

        // Get updated page
        const pageResponse = await notionFetch(`/pages/${id}`);
        const pageData = await pageResponse.json();

        return {
          id,
          ...data,
          updated_at: pageData.last_edited_time,
        } as T;
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError(`Failed to update record in ${tableName}`, error);
      }
    });
  }

  // Delete a record
  static async deleteRecord(
    tableName: string,
    id: string | number,
    idColumn: string = 'id',
    options?: { useServiceRole?: boolean },
  ): Promise<void> {
    clearCache(tableName);

    return queueRequest(async () => {
      try {
        // Archive the page (Notion's way of "deleting")
        await notionFetch(`/pages/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({ archived: true })
        });
      } catch (error) {
        if (error instanceof DatabaseError) throw error;
        throw new DatabaseError(`Failed to delete record from ${tableName}`, error);
      }
    });
  }
}

// Helper: Map Notion record to expected database format
function mapNotionToRecord(tableName: string, record: Record<string, any>, page: NotionBlock): Record<string, any> {
  const baseRecord = {
    id: record.id,
    created_at: record.created_at,
    updated_at: record.updated_at,
  };

  switch (tableName) {
    case 'users':
      return {
        ...baseRecord,
        email: record._title || record.email,
        name: record.name,
        password_hash: record.password_hash,
        role: record.role || 'user',
      };
    case 'courses':
      return {
        ...baseRecord,
        title: record._title || record.title,
        description: record.description,
        subject: record.subject,
        difficulty_level: record.difficulty || record.difficulty_level,
        estimated_duration: record.estimated_duration ? parseInt(record.estimated_duration) : null,
        created_by: record.created_by,
      };
    case 'subtopics':
      return {
        ...baseRecord,
        title: record._title || record.title,
        content: record.content,
        course_id: record.course_id,
        order_index: record.order_index ? parseInt(record.order_index) : 0,
      };
    case 'quiz':
      return {
        ...baseRecord,
        question: record._title || record.question,
        options: record.options ? JSON.parse(record.options) : null,
        correct_answer: record.correct_answer,
        explanation: record.explanation,
        course_id: record.course_id,
        subtopic_id: record.subtopic_id,
      };
    default:
      return { ...baseRecord, ...record };
  }
}

// Helper: Format field name for display
function formatFieldName(key: string): string {
  return key
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// Helper: Get title for a record based on table type
function getRecordTitle(tableName: string, data: Record<string, any>): string {
  switch (tableName) {
    case 'users':
      return data.email || 'User';
    case 'courses':
      return data.title || 'Course';
    case 'subtopics':
      return data.title || 'Subtopic';
    case 'quiz':
      return data.question?.substring(0, 50) || 'Quiz Question';
    case 'jurnal':
      return data.content?.substring(0, 50) || 'Journal Entry';
    case 'feedback':
      return `Feedback ${data.rating}/5`;
    case 'discussion_sessions':
      return `Session ${data.user_id || Date.now()}`;
    case 'discussion_messages':
      return `Message ${Date.now()}`;
    case 'discussion_templates':
      return `Template ${data.subtopic_id || Date.now()}`;
    case 'subtopic_cache':
      return data.cache_key || `Cache ${Date.now()}`;
    case 'api_logs':
      return `${data.method || 'LOG'} ${data.endpoint || ''}`;
    case 'course_generation_activity':
      return `Activity ${Date.now()}`;
    default:
      return `Record ${Date.now()}`;
  }
}

/**
 * Supabase-compatible wrapper for Notion DatabaseService
 * Provides .from('table').select().eq() chain pattern
 */
class NotionQueryBuilder {
  private tableName: string;
  private filters: Record<string, any> = {};
  private selectFields: string[] = [];
  private orderConfig: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private isSingle = false;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(fields: string = '*') {
    if (fields !== '*') {
      this.selectFields = fields.split(',').map(f => f.trim());
    }
    return this;
  }

  eq(column: string, value: any) {
    this.filters[column] = value;
    return this;
  }

  neq(column: string, value: any) {
    this.filters[`${column}_neq`] = value;
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderConfig = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  async insert(data: Record<string, any> | Record<string, any>[]) {
    try {
      const records = Array.isArray(data) ? data : [data];
      const results = [];
      for (const record of records) {
        const result = await DatabaseService.insertRecord(this.tableName, record);
        results.push(result);
      }
      return { data: Array.isArray(data) ? results : results[0], error: null };
    } catch (error) {
      console.error(`[NotionQueryBuilder] Insert error:`, error);
      return { data: null, error };
    }
  }

  async update(data: Record<string, any>) {
    try {
      // Find records matching filters first
      const records = await DatabaseService.getRecords<any>(this.tableName, { filter: this.filters });
      const results = [];
      for (const record of records) {
        const updated = await DatabaseService.updateRecord(this.tableName, record.id, data);
        results.push(updated);
      }
      return { data: results, error: null };
    } catch (error) {
      console.error(`[NotionQueryBuilder] Update error:`, error);
      return { data: null, error };
    }
  }

  async delete() {
    try {
      const records = await DatabaseService.getRecords<any>(this.tableName, { filter: this.filters });
      for (const record of records) {
        await DatabaseService.deleteRecord(this.tableName, record.id);
      }
      return { data: null, error: null };
    } catch (error) {
      console.error(`[NotionQueryBuilder] Delete error:`, error);
      return { data: null, error };
    }
  }

  async upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }) {
    try {
      const records = Array.isArray(data) ? data : [data];
      const results = [];

      for (const record of records) {
        // Check if record exists
        const conflictField = options?.onConflict || 'id';
        if (record[conflictField]) {
          const existing = await DatabaseService.getRecords<any>(this.tableName, {
            filter: { [conflictField]: record[conflictField] }
          });

          if (existing.length > 0) {
            // Update existing
            const updated = await DatabaseService.updateRecord(this.tableName, existing[0].id, record);
            results.push(updated);
          } else {
            // Insert new
            const inserted = await DatabaseService.insertRecord(this.tableName, record);
            results.push(inserted);
          }
        } else {
          // Insert new
          const inserted = await DatabaseService.insertRecord(this.tableName, record);
          results.push(inserted);
        }
      }

      return { data: Array.isArray(data) ? results : results[0], error: null };
    } catch (error) {
      console.error(`[NotionQueryBuilder] Upsert error:`, error);
      return { data: null, error };
    }
  }

  // Execute query (called when await is used)
  async then<T>(resolve: (value: { data: any; error: any }) => T, reject?: (error: any) => T) {
    try {
      let records = await DatabaseService.getRecords<any>(this.tableName, { filter: this.filters });

      // Apply ordering
      if (this.orderConfig) {
        const { column, ascending } = this.orderConfig;
        records.sort((a: Record<string, any>, b: Record<string, any>) => {
          const aVal = a[column];
          const bVal = b[column];
          if (aVal < bVal) return ascending ? -1 : 1;
          if (aVal > bVal) return ascending ? 1 : -1;
          return 0;
        });
      }

      // Apply limit
      if (this.limitCount) {
        records = records.slice(0, this.limitCount);
      }

      // Single record
      if (this.isSingle) {
        return resolve({ data: records[0] || null, error: null });
      }

      return resolve({ data: records, error: null });
    } catch (error) {
      console.error(`[NotionQueryBuilder] Query error:`, error);
      if (reject) {
        return reject(error);
      }
      return resolve({ data: null, error });
    }
  }
}

// adminDb compatible interface
export const adminDb = {
  from(tableName: string) {
    return new NotionQueryBuilder(tableName);
  }
};

// Export for backward compatibility
export default DatabaseService;
