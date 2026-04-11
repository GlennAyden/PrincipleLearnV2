// src/lib/admin-queries.ts
// Shared query utilities for admin API routes — extracted from duplicated code

import { adminDb } from '@/lib/database';

export type TimeRange = '7d' | '30d' | '90d' | 'all';

/**
 * Convert a time range string to a Date threshold.
 * Returns null for 'all' (no filtering).
 */
export function getDateSince(range: TimeRange): Date | null {
  if (range === 'all') return null;
  const now = new Date();
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90;
  now.setDate(now.getDate() - days);
  return now;
}

/**
 * Safe table query — handles missing tables gracefully by returning [].
 * Supports equality filters, date filtering, ordering, and limit.
 */
export async function safeQuery<T = Record<string, unknown>>(
  tableName: string,
  selectFields: string = '*',
  filters?: Record<string, string | number | boolean | null>,
  options?: { dateSince?: Date | null; limit?: number; orderBy?: { column: string; ascending: boolean } }
): Promise<T[]> {
  try {
    let query = adminDb.from(tableName).select(selectFields);

    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value);
      }
    }

    if (options?.dateSince) {
      query = query.gte('created_at', options.dateSince.toISOString());
    }

    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending });
    }

    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;
    if (error) {
      console.warn(`[AdminQuery] ${tableName} failed:`, error.message || error);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (err) {
    console.warn(`[AdminQuery] ${tableName} exception:`, err);
    return [];
  }
}

/**
 * Build a Map indexed by user ID from an array of records.
 */
export function buildUserMap<T extends { user_id?: string; created_by?: string }>(
  items: T[],
  userIdField: 'user_id' | 'created_by' = 'user_id'
): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const uid = item[userIdField];
    if (!uid) continue;
    if (!map.has(uid)) map.set(uid, []);
    map.get(uid)!.push(item);
  }
  return map;
}

/**
 * Filter items by date threshold (in-memory).
 */
export function filterByTime<T extends { created_at?: string }>(items: T[], dateSince: Date | null): T[] {
  if (!dateSince) return items;
  const threshold = dateSince.getTime();
  return items.filter(item => {
    if (!item.created_at) return false;
    return new Date(item.created_at).getTime() >= threshold;
  });
}
