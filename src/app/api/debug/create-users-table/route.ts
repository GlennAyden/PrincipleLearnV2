import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Debug: Creating users table directly');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Execute SQL directly using Supabase SQL editor approach
    const createTableSQL = `
      -- Create users table
      CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          name VARCHAR(255),
          role VARCHAR(50) DEFAULT 'user',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      -- Enable RLS but allow all operations for now
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      
      -- Drop existing policies to avoid conflicts
      DROP POLICY IF EXISTS "Allow all operations" ON users;
      
      -- Create permissive policy for testing
      CREATE POLICY "Allow all operations" ON users FOR ALL USING (true) WITH CHECK (true);
    `;
    
    // Try to execute the SQL
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: createTableSQL
    });
    
    if (error) {
      console.error('Debug: SQL execution error:', error);
      
      // If exec_sql doesn't work, try alternative method
      console.log('Debug: Trying alternative table creation method');
      
      // Try creating table using raw query
      const { error: altError } = await supabaseAdmin
        .from('users')
        .select('id')
        .limit(1);
      
      if (altError && altError.code === '42P01') {
        // Table doesn't exist, but we can't create it via API
        return NextResponse.json({
          success: false,
          message: 'Users table does not exist and cannot be created via API',
          error: 'Please create the table manually in Supabase dashboard',
          sqlToRun: createTableSQL
        }, { status: 500 });
      }
    }
    
    console.log('Debug: Table creation completed');
    
    // Test inserting a user
    try {
      const testUser = {
        email: `test-${Date.now()}@example.com`,
        password_hash: '$2a$10$test',
        role: 'user'
      };
      
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('users')
        .insert(testUser)
        .select()
        .single();
      
      if (insertError) {
        console.error('Debug: Test insert error:', insertError);
        return NextResponse.json({
          success: false,
          message: 'Table exists but insert failed',
          error: insertError.message,
          details: insertError
        }, { status: 500 });
      }
      
      console.log('Debug: Test user created successfully:', insertData);
      
      return NextResponse.json({
        success: true,
        message: 'Users table created and tested successfully',
        testUser: insertData
      });
      
    } catch (testError) {
      console.error('Debug: Test error:', testError);
      return NextResponse.json({
        success: false,
        message: 'Table creation succeeded but test failed',
        error: testError instanceof Error ? testError.message : 'Unknown test error'
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Debug: Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}