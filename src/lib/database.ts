/**
 * Database Service - Supabase PostgreSQL Implementation
 * 
 * Provides generic CRUD operations and a chainable query builder via Supabase PostgreSQL.
 * All API routes use DatabaseService (static methods) or adminDb (chainable queries).
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { config as loadEnv } from 'dotenv';

const OPTIONAL_SUPABASE_TABLES = new Set(['discussion_admin_actions']);

/**
 * Ensure Supabase env vars are present. Falls back to loading .env.local / .env
 * directly via dotenv when process.env is missing them — this covers cases where
 * Next.js' automatic env loading hasn't populated the worker process (e.g. a stale
 * build, or a server started before the env file was written).
 */
let _envFallbackAttempted = false;
function ensureSupabaseEnv(): { url: string | undefined; serviceKey: string | undefined; anonKey: string | undefined } {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if ((!url || !serviceKey) && !_envFallbackAttempted) {
    _envFallbackAttempted = true;
    try {
      loadEnv({ path: '.env', override: false });
      loadEnv({ path: '.env.local', override: true });
      url = process.env.NEXT_PUBLIC_SUPABASE_URL;
      serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
      anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
      if (url && serviceKey) {
        console.warn('[Database] Supabase env vars loaded from .env.local fallback');
      }
    } catch (err) {
      console.warn('[Database] dotenv fallback failed:', (err as Error).message);
    }
  }

  return { url, serviceKey, anonKey };
}

function isOptionalMissingTableError(error: unknown): boolean {
  const err = error as Record<string, unknown> | null | undefined;
  if (err?.code !== 'PGRST205' || typeof err?.message !== 'string') {
    return false;
  }

  return Array.from(OPTIONAL_SUPABASE_TABLES).some((tableName) =>
    (err.message as string).includes(`'public.${tableName}'`)
  );
}

// ─── Supabase Client Initialization (lazy) ───────────────────────────────────

let _supabase: SupabaseClient | null = null;
let _supabaseAnon: SupabaseClient | null = null;

/**
 * Service-role client — bypasses RLS, full database access.
 * Used for most operations because we use custom JWT auth (not Supabase Auth),
 * so RLS policies that rely on auth.uid() cannot identify our users.
 */
function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const { url: supabaseUrl, serviceKey: supabaseServiceRoleKey } = ensureSupabaseEnv();

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new DatabaseError(
      'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables'
    );
  }

  _supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        return fetch(url, { ...options, signal: controller.signal }).finally(() =>
          clearTimeout(timeout)
        );
      },
    },
  });

  return _supabase;
}

/**
 * Anon-key client — respects RLS policies.
 * Use for read-only access to shared/public content (subtopic_cache, discussion_templates)
 * where RLS policies use `USING (true)` for authenticated role.
 * Follows the principle of least privilege: no elevated access needed for public reads.
 */
function getAnonClient(): SupabaseClient {
  if (_supabaseAnon) return _supabaseAnon;

  const { url: supabaseUrl, anonKey } = ensureSupabaseEnv();

  if (!supabaseUrl || !anonKey) {
    // Fall back to service-role if anon key is not configured
    return getSupabaseClient();
  }

  _supabaseAnon = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      fetch: (url, options = {}) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        return fetch(url, { ...options, signal: controller.signal }).finally(() =>
          clearTimeout(timeout)
        );
      },
    },
  });

  return _supabaseAnon;
}

// ─── Database Error ───────────────────────────────────────────────────────────

/** Shape of a Supabase PostgREST error (the most common originalError type). */
export interface PostgrestErrorLike {
  message: string;
  code: string;
  details?: string | null;
  hint?: string | null;
}

/** Common Postgres/PostgREST error codes for programmatic handling. */
export const DB_ERROR_CODES = {
  UNIQUE_VIOLATION: '23505',
  FOREIGN_KEY_VIOLATION: '23503',
  NOT_NULL_VIOLATION: '23502',
  CHECK_VIOLATION: '23514',
  TABLE_NOT_FOUND: 'PGRST205',
  PERMISSION_DENIED: '42501',
  CONNECTION_FAILURE: '08000',
} as const;

export class DatabaseError extends Error {
  public readonly originalError?: PostgrestErrorLike | Error;

  constructor(message: string, originalError?: unknown) {
    super(message);
    this.name = 'DatabaseError';

    // Normalize the original error into a typed shape
    if (originalError && typeof originalError === 'object') {
      const err = originalError as Record<string, unknown>;
      if ('code' in err && 'message' in err) {
        this.originalError = err as unknown as PostgrestErrorLike;
      } else if (originalError instanceof Error) {
        this.originalError = originalError;
      }
    }
  }

  /** The PostgREST / Postgres error code, if available. */
  get code(): string | undefined {
    if (this.originalError && 'code' in this.originalError) {
      return (this.originalError as PostgrestErrorLike).code;
    }
    return undefined;
  }

  /** Check whether this error matches a specific DB error code. */
  is(errorCode: string): boolean {
    return this.code === errorCode;
  }

  /** True if the error is a unique constraint violation (e.g. duplicate email). */
  get isUniqueViolation(): boolean {
    return this.code === DB_ERROR_CODES.UNIQUE_VIOLATION;
  }

  /** True if the error is a foreign key constraint violation. */
  get isForeignKeyViolation(): boolean {
    return this.code === DB_ERROR_CODES.FOREIGN_KEY_VIOLATION;
  }
}

// ─── Test Connection ──────────────────────────────────────────────────────────

export async function testConnection(): Promise<boolean> {
  try {
    const { error } = await getSupabaseClient().from('users').select('id').limit(1);
    return !error;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// ─── DatabaseService ──────────────────────────────────────────────────────────

/**
 * DatabaseService — Supabase PostgreSQL Implementation
 *
 * Static methods for common CRUD operations via Supabase.
 * Used by API routes for simple database interactions.
 */
export class DatabaseService {

  /**
   * Get records from a table with optional filtering, ordering, and limiting.
   */
  static async getRecords<T>(
    tableName: string,
    options?: {
      select?: string;
      filter?: Record<string, unknown>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
      useServiceRole?: boolean;
    }
  ): Promise<T[]> {
    try {
      let query = getSupabaseClient()
        .from(tableName)
        .select(options?.select || '*');

      // Apply filters
      if (options?.filter) {
        for (const [key, value] of Object.entries(options.filter)) {
          query = query.eq(key, value);
        }
      }

      // Apply ordering
      if (options?.orderBy) {
        query = query.order(options.orderBy.column, {
          ascending: options.orderBy.ascending !== false,
        });
      }

      // Apply limit
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new DatabaseError(`Failed to get records from ${tableName}: ${error.message}`, error);
      }

      return (data || []) as T[];
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Failed to get records from ${tableName}`, error);
    }
  }

  /**
   * Insert a record into a table.
   */
  static async insertRecord<T>(
    tableName: string,
    data: Partial<T>,
    _options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      // Ensure JSONB column mapping is loaded (no-op after first call)
      await detectJsonbColumns();

      // Stringify any nested objects/arrays for non-JSONB text columns
      const sanitized = sanitizeForInsert(tableName, data as Record<string, unknown>);

      const { data: result, error } = await getSupabaseClient()
        .from(tableName)
        .insert(sanitized)
        .select()
        .single();

      if (error) {
        throw new DatabaseError(`Failed to insert record into ${tableName}: ${error.message}`, error);
      }

      return result as T;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Failed to insert record into ${tableName}`, error);
    }
  }

  /**
   * Update a record in a table by ID.
   */
  static async updateRecord<T>(
    tableName: string,
    id: string | number,
    data: Partial<T>,
    idColumn: string = 'id',
    _options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      const sanitized = sanitizeForInsert(tableName, data as Record<string, unknown>);

      const TABLES_WITHOUT_UPDATED_AT = [
        'rate_limits',
        'api_logs',
        'quiz_submissions',
        'feedback',
        'discussion_templates',
      ];
      const payload = TABLES_WITHOUT_UPDATED_AT.includes(tableName)
        ? sanitized
        : { ...sanitized, updated_at: new Date().toISOString() };

      const { data: result, error } = await getSupabaseClient()
        .from(tableName)
        .update(payload)
        .eq(idColumn, id)
        .select()
        .single();

      if (error) {
        throw new DatabaseError(`Failed to update record in ${tableName}: ${error.message}`, error);
      }

      return result as T;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Failed to update record in ${tableName}`, error);
    }
  }

  /**
   * Delete a record from a table by ID.
   */
  static async deleteRecord(
    tableName: string,
    id: string | number,
    idColumn: string = 'id',
    _options?: { useServiceRole?: boolean },
  ): Promise<void> {
    try {
      const { error } = await getSupabaseClient()
        .from(tableName)
        .delete()
        .eq(idColumn, id);

      if (error) {
        throw new DatabaseError(`Failed to delete record from ${tableName}: ${error.message}`, error);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Failed to delete record from ${tableName}`, error);
    }
  }
}

// ─── Sanitize Helper ──────────────────────────────────────────────────────────

// Tables with JSONB columns that should NOT be stringified
/**
 * Fallback JSONB column mapping — used until auto-detection completes.
 * Kept in sync manually as a safety net; auto-detection overwrites this on first use.
 */
const JSONB_COLUMNS_FALLBACK: Record<string, string[]> = {
  subtopics: ['content'],
  quiz: ['options'],
  subtopic_cache: ['content'],
  discussion_templates: ['source', 'template'],
  discussion_sessions: ['learning_goals'],
  discussion_messages: ['metadata'],
  discussion_admin_actions: ['payload'],
  api_logs: ['metadata'],
  course_generation_activity: ['request_payload', 'outline'],
  ask_question_history: ['prompt_components'],
};

/** Auto-detected JSONB columns (populated lazily from database schema). */
let _jsonbColumns: Record<string, string[]> | null = null;
let _jsonbDetectionAttempted = false;

/**
 * Auto-detect JSONB columns from the database schema via get_jsonb_columns() RPC.
 * Called lazily on first insert; result is cached for the process lifetime.
 */
async function detectJsonbColumns(): Promise<Record<string, string[]>> {
  if (_jsonbColumns) return _jsonbColumns;
  if (_jsonbDetectionAttempted) return JSONB_COLUMNS_FALLBACK;

  _jsonbDetectionAttempted = true;
  try {
    const { data, error } = await getSupabaseClient().rpc('get_jsonb_columns');
    if (error || !data) {
      console.warn('[Database] JSONB auto-detection failed, using fallback:', error?.message);
      return JSONB_COLUMNS_FALLBACK;
    }

    const mapping: Record<string, string[]> = {};
    for (const row of data as { table_name: string; column_name: string }[]) {
      if (!mapping[row.table_name]) mapping[row.table_name] = [];
      mapping[row.table_name].push(row.column_name);
    }

    _jsonbColumns = mapping;
    return mapping;
  } catch {
    console.warn('[Database] JSONB auto-detection threw, using fallback');
    return JSONB_COLUMNS_FALLBACK;
  }
}

/** Synchronous lookup — returns cached result or fallback. */
function getJsonbColumnsSync(tableName: string): string[] {
  const source = _jsonbColumns ?? JSONB_COLUMNS_FALLBACK;
  return source[tableName] || [];
}

function sanitizeForInsert(tableName: string, data: Record<string, unknown>): Record<string, unknown> {
  const jsonbCols = getJsonbColumnsSync(tableName);
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;

    // If it's a JSONB column, pass objects/arrays directly (Supabase handles them)
    if (jsonbCols.includes(key)) {
      sanitized[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      // Non-JSONB column receiving an object — stringify it for TEXT columns
      sanitized[key] = JSON.stringify(value);
    } else if (Array.isArray(value) && !jsonbCols.includes(key)) {
      sanitized[key] = JSON.stringify(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

// ─── Supabase Query Builder (compatible with existing adminDb usage) ──────────

/**
 * SupabaseQueryBuilder wraps the real Supabase client to provide a
 * chainable interface for Supabase queries.
 *
 * Usage remains the same: adminDb.from('table').select().eq().single()
 */
class SupabaseQueryBuilder {
  private tableName: string;
  private client: SupabaseClient;
  private filters: Array<{ method: string; args: unknown[] }> = [];
  private selectFields: string = '*';
  private orderConfig: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
  private rangeConfig: { from: number; to: number } | null = null;
  private isSingle = false;
  private isMaybeSingle = false;

  constructor(tableName: string, client: SupabaseClient) {
    this.tableName = tableName;
    this.client = client;
  }

  select(fields: string = '*') {
    this.selectFields = fields;
    return this;
  }

  eq(column: string, value: string | number | boolean | null) {
    this.filters.push({ method: 'eq', args: [column, value] });
    return this;
  }

  neq(column: string, value: string | number | boolean | null) {
    this.filters.push({ method: 'neq', args: [column, value] });
    return this;
  }

  is(column: string, value: null | boolean) {
    this.filters.push({ method: 'is', args: [column, value] });
    return this;
  }

  gt(column: string, value: string | number) {
    this.filters.push({ method: 'gt', args: [column, value] });
    return this;
  }

  gte(column: string, value: string | number) {
    this.filters.push({ method: 'gte', args: [column, value] });
    return this;
  }

  lt(column: string, value: string | number) {
    this.filters.push({ method: 'lt', args: [column, value] });
    return this;
  }

  lte(column: string, value: string | number) {
    this.filters.push({ method: 'lte', args: [column, value] });
    return this;
  }

  contains(column: string, value: Record<string, unknown> | unknown[]) {
    this.filters.push({ method: 'contains', args: [column, value] });
    return this;
  }

  in(column: string, values: (string | number)[]) {
    this.filters.push({ method: 'in', args: [column, values] });
    return this;
  }

  ilike(column: string, pattern: string) {
    this.filters.push({ method: 'ilike', args: [column, pattern] });
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

  range(from: number, to: number) {
    this.rangeConfig = { from, to };
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async insert(data: Record<string, unknown> | Record<string, unknown>[]) {
    try {
      const records = Array.isArray(data) ? data : [data];
      const sanitized = records.map(r => sanitizeForInsert(this.tableName, r));

      const query = this.client.from(this.tableName).insert(sanitized).select();
      const { data: result, error } = await query;

      if (error) {
        console.error(`[SupabaseQueryBuilder] Insert error:`, error);
        return { data: null, error };
      }

      return {
        data: Array.isArray(data) ? result : result?.[0] ?? null,
        error: null,
      };
    } catch (error) {
      console.error(`[SupabaseQueryBuilder] Insert error:`, error);
      return { data: null, error };
    }
  }

  async update(data: Record<string, unknown>) {
    try {
      // Only inject updated_at if the caller didn't already provide it
      // and the table likely has the column (skip for known tables without it)
      const TABLES_WITHOUT_UPDATED_AT = [
        'rate_limits',
        'api_logs',
        'quiz_submissions',
        'feedback',
        'discussion_templates',
      ];
      const payload = TABLES_WITHOUT_UPDATED_AT.includes(this.tableName)
        ? data
        : { ...data, updated_at: new Date().toISOString() };
      const sanitized = sanitizeForInsert(this.tableName, payload);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Supabase filter chaining
      let query: any = this.client.from(this.tableName).update(sanitized);
      for (const filter of this.filters) {
        query = query[filter.method](...filter.args);
      }
      query = query.select();

      const { data: result, error } = await query;

      if (error) {
        console.error(`[SupabaseQueryBuilder] Update error:`, error);
        return { data: null, error };
      }

      return { data: result, error: null };
    } catch (error) {
      console.error(`[SupabaseQueryBuilder] Update error:`, error);
      return { data: null, error };
    }
  }

  async delete() {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Supabase filter chaining
      let query: any = this.client.from(this.tableName).delete();
      for (const filter of this.filters) {
        query = query[filter.method](...filter.args);
      }

      const { error } = await query;

      if (error) {
        console.error(`[SupabaseQueryBuilder] Delete error:`, error);
        return { data: null, error };
      }

      return { data: null, error: null };
    } catch (error) {
      console.error(`[SupabaseQueryBuilder] Delete error:`, error);
      return { data: null, error };
    }
  }

  async upsert(data: Record<string, unknown> | Record<string, unknown>[], options?: { onConflict?: string }) {
    try {
      const records = Array.isArray(data) ? data : [data];
      const sanitized = records.map(r => sanitizeForInsert(this.tableName, r));

      const { data: result, error } = await this.client
        .from(this.tableName)
        .upsert(sanitized, { onConflict: options?.onConflict })
        .select();

      if (error) {
        console.error(`[SupabaseQueryBuilder] Upsert error:`, error);
        return { data: null, error };
      }

      return {
        data: Array.isArray(data) ? result : result?.[0] ?? null,
        error: null,
      };
    } catch (error) {
      console.error(`[SupabaseQueryBuilder] Upsert error:`, error);
      return { data: null, error };
    }
  }

  // Execute query (called when await is used on the builder chain)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase thenable interface requires any for dynamic query results
  async then<T>(resolve: (value: { data: any; error: any }) => T, reject?: (error: any) => T) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- dynamic Supabase filter chaining
      let query: any = this.client.from(this.tableName).select(this.selectFields);

      // Apply filters
      for (const filter of this.filters) {
        query = query[filter.method](...filter.args);
      }

      // Apply ordering
      if (this.orderConfig) {
        query = query.order(this.orderConfig.column, {
          ascending: this.orderConfig.ascending,
        });
      }

      // Apply range (takes precedence over limit)
      if (this.rangeConfig) {
        query = query.range(this.rangeConfig.from, this.rangeConfig.to);
      } else if (this.limitCount) {
        query = query.limit(this.limitCount);
      }

      // Single record
      if (this.isSingle) {
        query = query.single();
      } else if (this.isMaybeSingle) {
        query = query.maybeSingle();
      }

      const { data, error } = await query;

      if (error) {
        if (isOptionalMissingTableError(error)) {
          console.warn(`[SupabaseQueryBuilder] Optional table is missing:`, error);
        } else {
          console.error(`[SupabaseQueryBuilder] Query error:`, error);
        }
        if (reject) return reject(error);
        return resolve({ data: null, error });
      }

      return resolve({ data, error: null });
    } catch (error) {
      if (isOptionalMissingTableError(error)) {
        console.warn(`[SupabaseQueryBuilder] Optional table is missing:`, error);
      } else {
        console.error(`[SupabaseQueryBuilder] Query error:`, error);
      }
      if (reject) return reject(error);
      return resolve({ data: null, error });
    }
  }
}

// ─── adminDb export (keeps the same interface) ───────────────────────────────

/**
 * Service-role database client — bypasses RLS, full access.
 * Use for user-scoped queries, admin operations, and all writes.
 */
export const adminDb = {
  from(tableName: string) {
    return new SupabaseQueryBuilder(tableName, getSupabaseClient());
  },
  /** Call a Postgres function via Supabase RPC. */
  rpc(functionName: string, params?: Record<string, unknown>) {
    return getSupabaseClient().rpc(functionName, params);
  },
};

/**
 * Anon-key database client — respects RLS policies.
 * Use for read-only access to shared content (subtopic_cache, discussion_templates).
 * Falls back to service-role if NEXT_PUBLIC_SUPABASE_ANON_KEY is not set.
 */
export const publicDb = {
  from(tableName: string) {
    return new SupabaseQueryBuilder(tableName, getAnonClient());
  },
};

// Export for backward compatibility
export default DatabaseService;
