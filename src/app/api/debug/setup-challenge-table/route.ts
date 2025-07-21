import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error('Missing Supabase environment variables');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST() {
  try {
    console.log('Setting up challenge_responses table...');

    // Create challenge_responses table
    const { error: tableError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS challenge_responses (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          course_id TEXT NOT NULL,
          module_index INTEGER DEFAULT 0,
          subtopic_index INTEGER DEFAULT 0,
          page_number INTEGER DEFAULT 0,
          question TEXT NOT NULL,
          answer TEXT NOT NULL,
          feedback TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create indexes for performance
        CREATE INDEX IF NOT EXISTS idx_challenge_responses_user_id ON challenge_responses(user_id);
        CREATE INDEX IF NOT EXISTS idx_challenge_responses_course_id ON challenge_responses(course_id);
        CREATE INDEX IF NOT EXISTS idx_challenge_responses_user_course ON challenge_responses(user_id, course_id);
        CREATE INDEX IF NOT EXISTS idx_challenge_responses_created_at ON challenge_responses(created_at);

        -- Enable RLS
        ALTER TABLE challenge_responses ENABLE ROW LEVEL SECURITY;

        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Users can view their own challenge responses" ON challenge_responses;
        DROP POLICY IF EXISTS "Users can insert their own challenge responses" ON challenge_responses;
        DROP POLICY IF EXISTS "Users can update their own challenge responses" ON challenge_responses;

        -- Create RLS policies
        CREATE POLICY "Users can view their own challenge responses" ON challenge_responses
          FOR SELECT USING (user_id = current_user_id());

        CREATE POLICY "Users can insert their own challenge responses" ON challenge_responses
          FOR INSERT WITH CHECK (user_id = current_user_id());

        CREATE POLICY "Users can update their own challenge responses" ON challenge_responses
          FOR UPDATE USING (user_id = current_user_id());
      `
    });

    if (tableError) {
      console.error('Error creating challenge_responses table:', tableError);
      return NextResponse.json(
        { error: 'Failed to create challenge_responses table: ' + tableError.message },
        { status: 500 }
      );
    }

    console.log('challenge_responses table created successfully');

    return NextResponse.json({
      success: true,
      message: 'Challenge responses table setup completed successfully',
      tables_created: ['challenge_responses'],
      indexes_created: [
        'idx_challenge_responses_user_id',
        'idx_challenge_responses_course_id', 
        'idx_challenge_responses_user_course',
        'idx_challenge_responses_created_at'
      ],
      policies_created: [
        'Users can view their own challenge responses',
        'Users can insert their own challenge responses',
        'Users can update their own challenge responses'
      ]
    });

  } catch (error: any) {
    console.error('Error in setup-challenge-table:', error);
    return NextResponse.json(
      { error: 'Failed to setup challenge table: ' + error.message },
      { status: 500 }
    );
  }
}