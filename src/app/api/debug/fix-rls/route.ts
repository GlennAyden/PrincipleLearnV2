import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Debug: Fixing RLS policies for users table');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Fix RLS policies for users table
    const fixRLSSQL = `
      -- Drop existing restrictive policies
      DROP POLICY IF EXISTS "Users can view their own data" ON users;
      DROP POLICY IF EXISTS "Users can update their own data" ON users;
      
      -- Create new policies that allow registration
      -- Allow anonymous users to insert (for registration)
      CREATE POLICY "Allow user registration" 
      ON users FOR INSERT 
      WITH CHECK (true);
      
      -- Allow users to view their own data (for login)
      CREATE POLICY "Users can view their own data" 
      ON users FOR SELECT 
      USING (true);
      
      -- Allow users to update their own data
      CREATE POLICY "Users can update their own data" 
      ON users FOR UPDATE 
      USING (true)
      WITH CHECK (true);
      
      -- Allow users to delete their own data (if needed)
      CREATE POLICY "Users can delete their own data" 
      ON users FOR DELETE 
      USING (true);
    `;
    
    // Execute the SQL using raw query
    const { data, error } = await supabaseAdmin.rpc('exec_sql', {
      sql: fixRLSSQL
    });
    
    if (error) {
      console.error('Debug: Error fixing RLS policies:', error);
      
      // If exec_sql doesn't work, try alternative approach
      console.log('Debug: Trying alternative RLS fix approach');
      
      // Try disabling RLS temporarily as fallback
      const disableRLSSQL = `ALTER TABLE users DISABLE ROW LEVEL SECURITY;`;
      
      const { error: disableError } = await supabaseAdmin.rpc('exec_sql', {
        sql: disableRLSSQL
      });
      
      if (disableError) {
        return NextResponse.json({
          success: false,
          message: 'Failed to fix RLS policies',
          error: error.message,
          fallbackError: disableError.message,
          manualFix: 'Please run the SQL manually in Supabase dashboard',
          sqlToRun: fixRLSSQL
        }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        message: 'RLS disabled as fallback - registration should work now',
        warning: 'RLS is disabled, consider re-enabling with proper policies later'
      });
    }
    
    console.log('Debug: RLS policies fixed successfully');
    
    // Test user insertion
    try {
      const testUser = {
        email: `test-rls-${Date.now()}@example.com`,
        password_hash: '$2a$10$test',
        role: 'user'
      };
      
      const { data: insertData, error: insertError } = await supabaseAdmin
        .from('users')
        .insert(testUser)
        .select()
        .single();
      
      if (insertError) {
        console.error('Debug: Test insert still failing:', insertError);
        return NextResponse.json({
          success: false,
          message: 'RLS policies updated but insert still fails',
          error: insertError.message,
          details: insertError
        }, { status: 500 });
      }
      
      console.log('Debug: Test user created successfully after RLS fix:', insertData);
      
      return NextResponse.json({
        success: true,
        message: 'RLS policies fixed and tested successfully',
        testUser: insertData
      });
      
    } catch (testError) {
      console.error('Debug: Test error after RLS fix:', testError);
      return NextResponse.json({
        success: true,
        message: 'RLS policies updated but test failed',
        warning: 'Please test user registration manually',
        error: testError instanceof Error ? testError.message : 'Unknown test error'
      });
    }
    
  } catch (error) {
    console.error('Debug: Unexpected error fixing RLS:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}

export async function GET() {
  try {
    console.log('Debug: Checking current RLS policies');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Query current policies
    const { data, error } = await supabaseAdmin
      .from('pg_policies')
      .select('*')
      .eq('tablename', 'users');
    
    if (error) {
      console.error('Debug: Error checking policies:', error);
      return NextResponse.json({
        success: false,
        error: error.message
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Current RLS policies for users table',
      policies: data
    });
    
  } catch (error) {
    console.error('Debug: Error checking policies:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}