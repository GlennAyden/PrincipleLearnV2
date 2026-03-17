/**
 * Database Service - Supabase PostgreSQL Implementation
 * 
 * Replaces the Notion-based DatabaseService with Supabase PostgreSQL.
 * All existing API routes work without changes since they use DatabaseService / adminDb.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const OPTIONAL_SUPABASE_TABLES = new Set(['discussion_admin_actions']);

function isOptionalMissingTableError(error: any): boolean {
  if (error?.code !== 'PGRST205' || typeof error?.message !== 'string') {
    return false;
  }

  return Array.from(OPTIONAL_SUPABASE_TABLES).some((tableName) =>
    error.message.includes(`'public.${tableName}'`)
  );
}

// ─── Supabase Client Initialization (lazy) ───────────────────────────────────

let _supabase: SupabaseClient | null = null;

function getSupabaseClient(): SupabaseClient {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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
  });

  return _supabase;
}

// ─── Database Error ───────────────────────────────────────────────────────────

export class DatabaseError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
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
 * Drop-in replacement for the Notion-based DatabaseService.
 * All existing API routes continue to work without changes.
 */
export class DatabaseService {

  /**
   * Get records from a table with optional filtering, ordering, and limiting.
   */
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
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      // Stringify any nested objects/arrays for non-JSONB text columns
      const sanitized = sanitizeForInsert(tableName, data as Record<string, any>);

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
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      const sanitized = sanitizeForInsert(tableName, data as Record<string, any>);

      const { data: result, error } = await getSupabaseClient()
        .from(tableName)
        .update({ ...sanitized, updated_at: new Date().toISOString() })
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
    options?: { useServiceRole?: boolean },
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
const JSONB_COLUMNS: Record<string, string[]> = {
  subtopics: ['content'],
  quiz: ['options'],
  subtopic_cache: ['content'],
  discussion_templates: ['source', 'template'],
  discussion_sessions: ['learning_goals'],
  discussion_messages: ['metadata'],
  api_logs: ['metadata'],
  course_generation_activity: ['request_payload', 'outline'],
  ask_question_history: ['prompt_components'],
};

function sanitizeForInsert(tableName: string, data: Record<string, any>): Record<string, any> {
  const jsonbCols = JSONB_COLUMNS[tableName] || [];
  const sanitized: Record<string, any> = {};

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
 * chainable interface identical to the old NotionQueryBuilder.
 *
 * Usage remains the same: adminDb.from('table').select().eq().single()
 */
class SupabaseQueryBuilder {
  private tableName: string;
  private client: SupabaseClient;
  private filters: Array<{ method: string; args: any[] }> = [];
  private selectFields: string = '*';
  private orderConfig: { column: string; ascending: boolean } | null = null;
  private limitCount: number | null = null;
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

  eq(column: string, value: any) {
    this.filters.push({ method: 'eq', args: [column, value] });
    return this;
  }

  neq(column: string, value: any) {
    this.filters.push({ method: 'neq', args: [column, value] });
    return this;
  }

  contains(column: string, value: any) {
    this.filters.push({ method: 'contains', args: [column, value] });
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

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  async insert(data: Record<string, any> | Record<string, any>[]) {
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

  async update(data: Record<string, any>) {
    try {
      const sanitized = sanitizeForInsert(this.tableName, {
        ...data,
        updated_at: new Date().toISOString(),
      });

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

  async upsert(data: Record<string, any> | Record<string, any>[], options?: { onConflict?: string }) {
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
  async then<T>(
    resolve: (value: { data: any; error: any }) => T,
    reject?: (error: any) => T
  ) {
    try {
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

      // Apply limit
      if (this.limitCount) {
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

export const adminDb = {
  from(tableName: string) {
    return new SupabaseQueryBuilder(tableName, getSupabaseClient());
  },
};

// Export for backward compatibility
export default DatabaseService;
