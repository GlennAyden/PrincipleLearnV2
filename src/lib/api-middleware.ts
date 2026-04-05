import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from './jwt';

/**
 * Middleware to verify authentication and CSRF token for API routes
 * @param handler The API route handler function
 * @param options Configuration options
 * @returns The handler function with authentication and CSRF protection
 */
export function withProtection(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options: { 
    csrfProtection?: boolean;
    requireAuth?: boolean;
    adminOnly?: boolean;
  } = { csrfProtection: true, requireAuth: true, adminOnly: false }
) {
  return async (req: NextRequest) => {
    // Skip protection for GET requests if CSRF protection is enabled
    if (options.csrfProtection && req.method !== 'GET') {
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
    }
    
    // Skip authentication check if not required
    if (!options.requireAuth) {
      return handler(req);
    }
    
    // Get access token from cookies
    const accessToken = req.cookies.get('access_token')?.value;
    
    // If no token exists, return unauthorized
    if (!accessToken) {
      return NextResponse.json(
        { error: 'Not authenticated' },
        { status: 401 }
      );
    }
    
    // Verify the token
    const payload = verifyToken(accessToken);
    
    // If token is invalid or expired, return unauthorized
    if (!payload) {
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }
    
    // Check admin role if required (normalize to lowercase for consistency)
    if (options.adminOnly && payload.role?.toLowerCase() !== 'admin') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin access required' },
        { status: 403 }
      );
    }
    
    // Add user info to request headers
    req.headers.set('x-user-id', payload.userId);
    req.headers.set('x-user-email', payload.email);
    req.headers.set('x-user-role', payload.role);
    
    // Call the handler
    return handler(req);
  };
}

/**
 * Add Cache-Control headers to a NextResponse for short-lived caching.
 * Use on read-only admin endpoints whose data changes infrequently.
 *
 * @param response The NextResponse to add headers to
 * @param maxAgeSeconds Cache duration in seconds (default: 60)
 */
export function withCacheHeaders(response: NextResponse, maxAgeSeconds = 60): NextResponse {
  response.headers.set(
    'Cache-Control',
    `private, s-maxage=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`
  );
  return response;
} 