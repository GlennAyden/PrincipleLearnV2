// principle-learn/middleware.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from './src/lib/jwt'

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl
  
  // Public routes that don't require authentication
  const publicRoutes = [
    '/',
    '/login',
    '/signup',
    '/admin/login',
  ]
  
  // API routes that handle their own authentication (no token required)
  const apiAuthRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/logout',
    '/api/admin/login',
    '/api/admin/register',
  ]
  
  // Check if the current route is public or an auth API route
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`)) ||
      apiAuthRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next()
  }
  
  // Unified auth cookie — both admin and user login set 'access_token'
  const activeToken = req.cookies.get('access_token')?.value || null
  
  // If no token exists, return appropriate response
  if (!activeToken) {
    // For API routes, return JSON 401 instead of HTML redirect
    if (pathname.startsWith('/api/')) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      )
    }
    
    // For admin routes, redirect to admin login
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    
    // For user routes, redirect to user login
    return NextResponse.redirect(new URL('/login', req.url))
  }
  
  // Verify the token
  const payload = verifyToken(activeToken)
  
  // If token is invalid or expired, check for refresh token
  if (!payload) {
    // Check if there's a refresh token
    const refreshToken = req.cookies.get('refresh_token')?.value
    
    if (refreshToken) {
      // Redirect to token refresh endpoint
      return NextResponse.redirect(new URL('/api/auth/refresh', req.url))
    }
    
    // No refresh token, clear the invalid tokens
    // For API routes, return JSON 401
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      )
      response.cookies.delete('access_token')
      return response
    }

    // For page routes, redirect to login
    const response = NextResponse.redirect(
      new URL(pathname.startsWith('/admin') ? '/admin/login' : '/login', req.url)
    )

    response.cookies.delete('access_token')
    return response
  }
  
  // For admin routes (pages AND API), check if the user has admin role
  // Support both 'ADMIN' and 'admin' (admin login stores lowercase)
  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin')
  if ((isAdminPage || isAdminApi) && payload.role?.toLowerCase() !== 'admin') {
    if (isAdminApi) {
      return NextResponse.json(
        { error: 'Forbidden: admin role required' },
        { status: 403 }
      )
    }
    return NextResponse.redirect(new URL('/', req.url))
  }

  
  // Add user info to request headers for use in API routes
  const requestHeaders = new Headers(req.headers)
  requestHeaders.set('x-user-id', payload.userId)
  requestHeaders.set('x-user-email', payload.email)
  requestHeaders.set('x-user-role', payload.role)
  
  // Continue with the request
  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
}
