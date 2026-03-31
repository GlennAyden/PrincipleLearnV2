import { NextRequest, NextResponse } from 'next/server';
import type { ActivitySearchParams } from '@/types/activity';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const format = searchParams.get('format') as 'csv' | 'json' || 'csv';
  const types = searchParams.get('types')?.split(',') || [];
  
  // Mock data - integrate with search API
  const mockData = [
    { id: '1', type: 'quiz', userEmail: 'user@example.com', timestamp: '2024-01-15', topic: 'Math', detail: 'Solved correctly' },
    { id: '2', type: 'ask', userEmail: 'user@example.com', timestamp: '2024-01-14', topic: 'Science', detail: 'Asked question' },
  ];

  if (format === 'json') {
    return NextResponse.json(mockData, {
      headers: { 'Content-Disposition': 'attachment; filename=activity.json' }
    });
  }

  // CSV
  const csv = [
    ['ID', 'Type', 'User', 'Time', 'Topic', 'Detail'],
    ...mockData.map(row => [row.id, row.type, row.userEmail, row.timestamp, row.topic, row.detail])
  ].map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename=activity.csv'
    }
  });
}

