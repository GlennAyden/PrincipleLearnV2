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
    '/admin/register'
  ]
  
  // API routes that handle their own authentication
  const apiAuthRoutes = [
    '/api/auth/login',
    '/api/auth/register',
    '/api/auth/refresh',
    '/api/auth/logout'
  ]
  
  // Check if the current route is public or an auth API route
  if (publicRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`)) ||
      apiAuthRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`))) {
    return NextResponse.next()
  }
  
  // Get the access token from cookies
  const accessToken = req.cookies.get('access_token')?.value
  
  // If no token exists, redirect to login
  if (!accessToken) {
    // For admin routes, redirect to admin login
    if (pathname.startsWith('/admin')) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
    
    // For user routes, redirect to user login
    return NextResponse.redirect(new URL('/login', req.url))
  }
  
  // Verify the token
  const payload = verifyToken(accessToken)
  
  // If token is invalid or expired, check for refresh token
  if (!payload) {
    // Check if there's a refresh token
    const refreshToken = req.cookies.get('refresh_token')?.value
    
    if (refreshToken) {
      // Redirect to token refresh endpoint
      return NextResponse.redirect(new URL('/api/auth/refresh', req.url))
    }
    
    // No refresh token, clear the invalid token and redirect to login
    const response = NextResponse.redirect(
      new URL(pathname.startsWith('/admin') ? '/admin/login' : '/login', req.url)
    )
    
    response.cookies.delete('access_token')
    return response
  }
  
  // For admin routes, check if the user has admin role
  if (pathname.startsWith('/admin') && payload.role !== 'ADMIN') {
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
