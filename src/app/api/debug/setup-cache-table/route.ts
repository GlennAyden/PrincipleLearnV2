// src/app/api/debug/setup-cache-table/route.ts

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export async function GET() {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Create subtopic cache table
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Create subtopic cache table for performance optimization
        CREATE TABLE IF NOT EXISTS subtopic_cache (
          id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
          cache_key TEXT UNIQUE NOT NULL,
          content JSONB NOT NULL,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          updated_at TIMESTAMPTZ DEFAULT NOW()
        );

        -- Add index for faster lookups
        CREATE INDEX IF NOT EXISTS idx_subtopic_cache_key ON subtopic_cache(cache_key);

        -- Add index for cleanup (optional)
        CREATE INDEX IF NOT EXISTS idx_subtopic_cache_created ON subtopic_cache(created_at);
      `
    });

    if (createError) {
      console.error('Error creating table:', createError);
      // Try alternative approach
      const { error: altError } = await supabase
        .from('subtopic_cache')
        .select('id')
        .limit(1);
      
      if (altError && altError.code === '42P01') {
        // Table doesn't exist, need manual creation
        return NextResponse.json({
          success: false,
          error: 'Please create the table manually using the SQL in sql/create_subtopic_cache_table.sql',
          details: createError.message
        });
      }
    }

    // Enable RLS
    const { error: rlsError } = await supabase.rpc('exec_sql', {
      sql: `
        -- Enable RLS (Row Level Security)
        ALTER TABLE subtopic_cache ENABLE ROW LEVEL SECURITY;

        -- Create policy to allow all operations (since it's just cache)
        DO $$ 
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE schemaname = 'public' 
            AND tablename = 'subtopic_cache' 
            AND policyname = 'Allow all operations on subtopic_cache'
          ) THEN
            CREATE POLICY "Allow all operations on subtopic_cache" ON subtopic_cache
            FOR ALL TO authenticated, anon
            USING (true)
            WITH CHECK (true);
          END IF;
        END $$;
      `
    });

    if (rlsError) {
      console.warn('RLS setup warning (table may already exist):', rlsError);
    }

    // Test the table
    const { data: testData, error: testError } = await supabase
      .from('subtopic_cache')
      .select('id')
      .limit(1);

    if (testError) {
      return NextResponse.json({
        success: false,
        error: 'Cache table setup failed',
        details: testError.message
      });
    }

    return NextResponse.json({
      success: true,
      message: 'Subtopic cache table created successfully',
      tableExists: true,
      recordCount: testData?.length || 0
    });

  } catch (error: any) {
    console.error('Setup cache table error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Unknown error'
    }, { status: 500 });
  }
}