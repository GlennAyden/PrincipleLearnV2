import { NextRequest, NextResponse } from 'next/server';

/**
 * Middleware to verify CSRF token
 * @param req The request object
 * @returns NextResponse or null if the CSRF token is valid
 */
export function verifyCsrfToken(req: NextRequest): NextResponse | null {
  // Skip CSRF check for GET requests
  if (req.method === 'GET') {
    return null;
  }
  
  // Get CSRF token from cookie
  const csrfCookie = req.cookies.get('csrf_token')?.value;
  
  // Get CSRF token from header
  const csrfHeader = req.headers.get('x-csrf-token');
  
  // If either token is missing, reject the request
  if (!csrfCookie || !csrfHeader) {
    return NextResponse.json(
      { error: 'CSRF token missing' },
      { status: 403 }
    );
  }
  
  // If tokens don't match, reject the request
  if (csrfCookie !== csrfHeader) {
    return NextResponse.json(
      { error: 'Invalid CSRF token' },
      { status: 403 }
    );
  }
  
  // Tokens match, allow the request
  return null;
} 