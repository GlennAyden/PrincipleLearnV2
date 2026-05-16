import { NextResponse } from 'next/server';

// Diagnostic: minimal API route with zero imports beyond NextResponse.
// If this hangs on Vercel while pages work, the issue is at Vercel
// function infra layer, not in our service modules. If it returns 200,
// the hang is downstream (middleware bundle, specific service imports).
export async function GET() {
  return NextResponse.json({
    ok: true,
    timestamp: new Date().toISOString(),
    runtime: typeof process !== 'undefined' ? process.version : 'unknown',
  });
}
