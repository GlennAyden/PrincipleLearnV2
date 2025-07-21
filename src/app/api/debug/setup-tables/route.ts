import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Debug: Setting up database tables');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Create users table
    const createUsersTable = `
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        name VARCHAR(255),
        role VARCHAR(50) DEFAULT 'user',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const { error: usersError } = await supabaseAdmin.rpc('exec_sql', { 
      sql: createUsersTable 
    });
    
    if (usersError) {
      console.error('Debug: Error creating users table:', usersError);
      return NextResponse.json({
        success: false,
        error: 'Failed to create users table',
        details: usersError
      }, { status: 500 });
    }
    
    // Create courses table
    const createCoursesTable = `
      CREATE TABLE IF NOT EXISTS courses (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        description TEXT,
        subject VARCHAR(100),
        difficulty_level VARCHAR(50),
        estimated_duration INTEGER,
        created_by UUID REFERENCES users(id),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    const { error: coursesError } = await supabaseAdmin.rpc('exec_sql', { 
      sql: createCoursesTable 
    });
    
    if (coursesError) {
      console.error('Debug: Error creating courses table:', coursesError);
    }
    
    // Create other necessary tables...
    const createSubtopicsTable = `
      CREATE TABLE IF NOT EXISTS subtopics (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        course_id UUID REFERENCES courses(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        content TEXT,
        order_index INTEGER NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: createSubtopicsTable });
    
    // Create basic RLS policies for users table
    const createUsersPolicy = `
      ALTER TABLE users ENABLE ROW LEVEL SECURITY;
      
      DROP POLICY IF EXISTS "Enable all operations for authenticated users" ON users;
      CREATE POLICY "Enable all operations for authenticated users" ON users
        FOR ALL USING (true) WITH CHECK (true);
    `;
    
    await supabaseAdmin.rpc('exec_sql', { sql: createUsersPolicy });
    
    console.log('Debug: Database tables setup completed');
    
    return NextResponse.json({
      success: true,
      message: 'Database tables created successfully'
    });
    
  } catch (error) {
    console.error('Debug: Setup error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}

// Alternative direct SQL execution
export async function GET() {
  try {
    console.log('Debug: Checking database setup without creating tables');
    
    const supabaseAdmin = createServiceRoleClient();
    
    // Check if users table exists
    const { data, error } = await supabaseAdmin
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'users');
    
    return NextResponse.json({
      success: true,
      tablesFound: data,
      usersTableExists: data && data.length > 0
    });
    
  } catch (error) {
    console.error('Debug: Check error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}