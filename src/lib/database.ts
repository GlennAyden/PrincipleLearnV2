import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase, createServiceRoleClient } from './supabase';
import type { Database } from '@/types/database';

let cachedServiceRoleClient: SupabaseClient<Database> | null = null;

function getServiceRoleClient(): SupabaseClient<Database> {
  if (!cachedServiceRoleClient) {
    cachedServiceRoleClient = createServiceRoleClient();
  }
  return cachedServiceRoleClient;
}

// Database utilities with error handling
export class DatabaseError extends Error {
  constructor(message: string, public originalError?: any) {
    super(message);
    this.name = 'DatabaseError';
  }
}

// Test database connection
export async function testConnection(): Promise<boolean> {
  try {
    const { data, error } = await supabase.from('_realtime_subscriptions').select('count').limit(1);
    
    if (error && error.code !== 'PGRST116') { // PGRST116 is "relation does not exist" which is fine
      throw new DatabaseError('Database connection failed', error);
    }
    
    return true;
  } catch (error) {
    console.error('Database connection test failed:', error);
    return false;
  }
}

// Generic CRUD operations
export class DatabaseService {
  // Get records from a table
  private static getClient(useServiceRole: boolean): SupabaseClient<Database> {
    return useServiceRole ? getServiceRoleClient() : supabase;
  }

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
      const {
        select,
        filter,
        orderBy,
        limit,
        useServiceRole = true,
      } = options ?? {};

      const client = this.getClient(useServiceRole);

      let query = client.from(tableName).select(select || '*');

      if (filter) {
        Object.entries(filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }

      if (orderBy) {
        query = query.order(orderBy.column, { ascending: orderBy.ascending ?? true });
      }

      if (limit) {
        query = query.limit(limit);
      }

      const { data, error } = await query;

      if (error) {
        throw new DatabaseError(`Failed to get records from ${tableName}`, error);
      }

      return data as T[];
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Unexpected error getting records from ${tableName}`, error);
    }
  }
  
  // Insert a record
  static async insertRecord<T>(
    tableName: string,
    data: Partial<T>,
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      const client = this.getClient(options?.useServiceRole ?? true);

      const { data: result, error } = await client
        .from(tableName)
        .insert(data)
        .select()
        .single();

      if (error) {
        throw new DatabaseError(`Failed to insert record into ${tableName}`, error);
      }

      return result as T;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Unexpected error inserting record into ${tableName}`, error);
    }
  }
  
  // Update a record
  static async updateRecord<T>(
    tableName: string, 
    id: string | number, 
    data: Partial<T>,
    idColumn: string = 'id',
    options?: { useServiceRole?: boolean },
  ): Promise<T> {
    try {
      const client = this.getClient(options?.useServiceRole ?? true);

      const { data: result, error } = await client
        .from(tableName)
        .update(data)
        .eq(idColumn, id)
        .select()
        .single();

      if (error) {
        throw new DatabaseError(`Failed to update record in ${tableName}`, error);
      }

      return result as T;
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Unexpected error updating record in ${tableName}`, error);
    }
  }
  
  // Delete a record
  static async deleteRecord(
    tableName: string, 
    id: string | number,
    idColumn: string = 'id',
    options?: { useServiceRole?: boolean },
  ): Promise<void> {
    try {
      const client = this.getClient(options?.useServiceRole ?? true);

      const { error } = await client
        .from(tableName)
        .delete()
        .eq(idColumn, id);

      if (error) {
        throw new DatabaseError(`Failed to delete record from ${tableName}`, error);
      }
    } catch (error) {
      if (error instanceof DatabaseError) throw error;
      throw new DatabaseError(`Unexpected error deleting record from ${tableName}`, error);
    }
  }
}

// Service role client for admin operations
export const adminDb = getServiceRoleClient();
