import { NextRequest, NextResponse } from 'next/server';
import type { ActivityActionRequest } from '@/types/activity';

export async function POST(req: NextRequest) {
  try {
    const body: ActivityActionRequest = await req.json();
    
    // Log action (future table: activity_admin_actions)
    console.log(`[Admin Action] ${body.action} on ${body.activityId}: ${body.reason || 'No reason'}`);
    
    // Mock responses - implement per-type logic
    const responses = {
      flag: 'Activity flagged for review',
      reset: 'Activity reset completed',
      notify: 'Notification sent to user'
    };
    
    return NextResponse.json({ success: true, message: responses[body.action] });
  } catch {
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}

