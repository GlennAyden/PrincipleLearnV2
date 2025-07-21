import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function GET() {
  try {
    console.log('Debug: Checking table existence and structure');
    
    // Check if users table exists by trying a simple query
    const { data, error, count } = await supabase
      .from('users')
      .select('*', { count: 'exact' })
      .limit(1);
    
    if (error) {
      console.error('Debug: Error querying users table:', error);
      return NextResponse.json({
        success: false,
        message: 'Users table error',
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      }, { status: 500 });
    }
    
    console.log('Debug: Users table query successful');
    console.log('Debug: Sample data:', data);
    console.log('Debug: Total count:', count);
    
    return NextResponse.json({
      success: true,
      message: 'Users table accessible',
      sampleData: data,
      totalCount: count
    });
  } catch (error) {
    console.error('Debug: Unexpected error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}