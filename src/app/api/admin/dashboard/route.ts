// principle-learn/src/app/api/admin/dashboard/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function GET(request: NextRequest) {
  console.log('[Admin Dashboard] Starting dashboard data fetch');
  
  try {
    // Get date range from query parameters
    const { searchParams } = new URL(request.url);
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    
    // Default to last 7 days if no dates provided
    const today = new Date();
    const defaultStartDate = new Date();
    defaultStartDate.setDate(today.getDate() - 6);
    
    // Parse dates or use defaults
    const parsedStartDate = startDate ? new Date(startDate) : defaultStartDate;
    const parsedEndDate = endDate ? new Date(endDate) : today;
    
    // Make sure the parsedEndDate includes the full day
    parsedEndDate.setHours(23, 59, 59, 999);
    
    // Ensure start date is earlier than end date
    if (parsedStartDate > parsedEndDate) {
      return NextResponse.json(
        { message: 'Start date must be earlier than end date' },
        { status: 400 }
      );
    }
    
    // Limit date range to 31 days (1 month)
    const maxRange = new Date(parsedStartDate);
    maxRange.setDate(parsedStartDate.getDate() + 31);
    
    if (parsedEndDate > maxRange) {
      return NextResponse.json(
        { message: 'Date range cannot exceed 31 days' },
        { status: 400 }
      );
    }
    
    console.log('[Admin Dashboard] Date range:', {
      start: parsedStartDate.toISOString().slice(0, 10),
      end: parsedEndDate.toISOString().slice(0, 10)
    });
    
    // 1. Hitung total metrics (untuk rentang waktu yang dipilih)
    console.log('[Admin Dashboard] Counting activity metrics');
    
    const dateFilter = {
      createdAt: {
        gte: parsedStartDate,
        lte: parsedEndDate
      }
    };
    
    // Mock activity counts
    const totalGenerateCourse = Math.floor(Math.random() * 50) + 10;
    const transcriptQnA = Math.floor(Math.random() * 100) + 20;
    const soalOtomatis = Math.floor(Math.random() * 80) + 15;
    const jurnalRefleksi = Math.floor(Math.random() * 60) + 10;
    
    console.log('[Admin Dashboard] Activity counts:', {
      totalGenerateCourse,
      transcriptQnA,
      soalOtomatis,
      jurnalRefleksi,
    });
    
    // Mock recent course data
    console.log('[Admin Dashboard] Mock data generated for dashboard');

    // 2. Buat array tanggal untuk rentang yang dipilih
    console.log('[Admin Dashboard] Generating date range for chart');
    const diffTime = Math.abs(parsedEndDate.getTime() - parsedStartDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    
    const dates: Date[] = Array.from({ length: diffDays }).map((_, i) => {
      const d = new Date(parsedStartDate);
      d.setDate(parsedStartDate.getDate() + i);
      d.setHours(0, 0, 0, 0);
      return d;
    });

    // 3. Generate mock daily data for chart
    console.log('[Admin Dashboard] Generating mock daily activity counts');
    const chart = dates.map((d) => {
      const dateStr = d.toISOString().slice(0, 10);
      
      // Generate random mock data for each day
      const g = Math.floor(Math.random() * 10);
      const t = Math.floor(Math.random() * 15);
      const s = Math.floor(Math.random() * 12);
      const j = Math.floor(Math.random() * 8);
      
      console.log(`[Admin Dashboard] Mock count for ${dateStr}:`, { g, t, s, j });
      
      return {
        date: dateStr,
        totalGenerateCourse: g,
        transcriptQnA: t,
        soalOtomatis: s,
        jurnalRefleksi: j,
      }
    });

    // 4. Kembalikan response
    console.log('[Admin Dashboard] Sending response with all metrics');
    return NextResponse.json(
      {
        metrics: {
          totalGenerateCourse,
          transcriptQnA,
          soalOtomatis,
          jurnalRefleksi,
        },
        chart,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[Admin Dashboard] Error in API:', err);
    if (err instanceof Error) {
      console.error('[Admin Dashboard] Error details:', err.message);
      console.error('[Admin Dashboard] Error stack:', err.stack);
    }
    return NextResponse.json(
      { message: 'Internal Server Error' },
      { status: 500 }
    );
  }
}
