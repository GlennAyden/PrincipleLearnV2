import { supabase, createServiceRoleClient } from './supabase';
import type { Database } from '@/types/database';

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
  static async getRecords<T>(
    tableName: string, 
    options?: {
      select?: string;
      filter?: Record<string, any>;
      orderBy?: { column: string; ascending?: boolean };
      limit?: number;
    }
  ): Promise<T[]> {
    try {
      let query = supabase.from(tableName).select(options?.select || '*');
      
      if (options?.filter) {
        Object.entries(options.filter).forEach(([key, value]) => {
          query = query.eq(key, value);
        });
      }
      
      if (options?.orderBy) {
        query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending ?? true });
      }
      
      if (options?.limit) {
        query = query.limit(options.limit);
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
  static async insertRecord<T>(tableName: string, data: Partial<T>): Promise<T> {
    try {
      const { data: result, error } = await supabase
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
    idColumn: string = 'id'
  ): Promise<T> {
    try {
      const { data: result, error } = await supabase
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
    idColumn: string = 'id'
  ): Promise<void> {
    try {
      const { error } = await supabase
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
export const adminDb = createServiceRoleClient();