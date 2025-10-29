import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase';

export async function POST() {
  try {
    console.log('Setting up ask_question_history table...');

    const supabaseAdmin = createServiceRoleClient();

    const setupSql = `
      CREATE TABLE IF NOT EXISTS ask_question_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        module_index INTEGER DEFAULT 0,
        subtopic_index INTEGER DEFAULT 0,
        page_number INTEGER DEFAULT 0,
        subtopic_label TEXT,
        question TEXT NOT NULL,
        answer TEXT NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_id ON ask_question_history(user_id);
      CREATE INDEX IF NOT EXISTS idx_ask_question_history_course_id ON ask_question_history(course_id);
      CREATE INDEX IF NOT EXISTS idx_ask_question_history_created_at ON ask_question_history(created_at);
      CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_course ON ask_question_history(user_id, course_id);

      ALTER TABLE ask_question_history ENABLE ROW LEVEL SECURITY;

      DROP POLICY IF EXISTS "Users can view their own QnA history" ON ask_question_history;
      DROP POLICY IF EXISTS "Users can insert their own QnA history" ON ask_question_history;
      DROP POLICY IF EXISTS "Users can update their own QnA history" ON ask_question_history;

      CREATE POLICY "Users can view their own QnA history" ON ask_question_history
        FOR SELECT USING (user_id = auth.uid());

      CREATE POLICY "Users can insert their own QnA history" ON ask_question_history
        FOR INSERT WITH CHECK (user_id = auth.uid());

      CREATE POLICY "Users can update their own QnA history" ON ask_question_history
        FOR UPDATE USING (user_id = auth.uid());
    `;

    const { error } = await supabaseAdmin.rpc('exec_sql', { sql: setupSql });

    if (error) {
      console.error('Error creating ask_question_history table:', error);
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to create ask_question_history table',
          details: error.message,
        },
        { status: 500 }
      );
    }

    console.log('ask_question_history table created successfully');

    return NextResponse.json({
      success: true,
      message: 'ask_question_history table setup completed successfully',
      tables_created: ['ask_question_history'],
      indexes_created: [
        'idx_ask_question_history_user_id',
        'idx_ask_question_history_course_id',
        'idx_ask_question_history_created_at',
        'idx_ask_question_history_user_course',
      ],
      policies_created: [
        'Users can view their own QnA history',
        'Users can insert their own QnA history',
        'Users can update their own QnA history',
      ],
    });
  } catch (error: any) {
    console.error('Error in setup-ask-question-table:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to setup ask question table',
        details: error.message,
      },
      { status: 500 }
    );
  }
}
