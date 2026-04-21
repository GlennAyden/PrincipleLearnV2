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
        { error: 'Autentikasi diperlukan' },
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

    // For API routes we must NEVER redirect — the browser auto-follows 302
    // as a GET, which silently drops POST bodies (quiz submit, generate
    // subtopic, etc.) and converts the request into a method it wasn't
    // meant to be. Return 401 JSON instead and let the client-side
    // `apiFetch` wrapper call /api/auth/refresh + retry with the original
    // method and body intact.
    if (pathname.startsWith('/api/')) {
      const response = NextResponse.json(
        { error: 'Token tidak valid atau sudah kedaluwarsa' },
        { status: 401 }
      )
      response.cookies.delete('access_token')
      return response
    }

    if (refreshToken) {
      // Let the page navigation continue and allow the client-side `apiFetch`
      // wrapper to refresh the session on the first 401. Redirecting a page
      // request to /api/auth/refresh is brittle because the refresh route is a
      // POST endpoint and a browser redirect will arrive as GET.
      const response = NextResponse.next()
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
  
  // For admin routes (pages AND API), check if the user has admin role.
  // Support both 'ADMIN' and 'admin' (admin login stores lowercase).
  //
  // NOTE FOR DEVS: This role check runs on EVERY request to /admin/** and
  // /api/admin/**, after JWT verification via verifyToken(). The payload.role
  // claim comes straight from the signed access_token cookie, so it cannot be
  // tampered with by the client. Downstream admin route handlers MAY rely on
  // this enforcement and do not need to re-verify the role themselves —
  // duplicating the check adds noise without changing the security posture.
  // If a specific admin route needs additional scoping (e.g. super-admin),
  // layer that on top of this check rather than replacing it.
  const isAdminPage = pathname.startsWith('/admin')
  const isAdminApi = pathname.startsWith('/api/admin')
  if ((isAdminPage || isAdminApi) && payload.role?.toLowerCase() !== 'admin') {
    if (isAdminApi) {
      return NextResponse.json(
        { error: 'Akses ditolak: diperlukan peran admin' },
        { status: 403 }
      )
    }
    return NextResponse.redirect(new URL('/', req.url))
  }

  // Onboarding enforcement for regular users (not admins).
  // Two-stage cookie gate:
  //   1. `onboarding_done=true`      → profile wizard finished (v1 + v2)
  //   2. `intro_slides_done=true`    → educational intro slides finished (v2)
  //
  // Stage 1 still redirects to /onboarding (profile wizard). Stage 2 redirects
  // to /onboarding/intro for users who already completed the profile wizard
  // under onboarding v1 but never saw the new slide deck — without this
  // second gate they silently skip the intro forever because they already
  // have `onboarding_done=true` from before the new deck shipped.
  //
  // Both cookies are non-HttpOnly so the client can set them from the
  // onboarding pages. This is a UX guard, NOT a security boundary — the
  // server-side source of truth is `learning_profiles.intro_slides_completed`.
  // Deleting the cookie just re-triggers the flow, which is the desired UX.
  const isRegularUser = payload.role?.toLowerCase() !== 'admin'
  if (isRegularUser) {
    const onboardingExempt =
      pathname === '/onboarding' ||
      pathname.startsWith('/onboarding/') ||
      pathname === '/logout' ||
      pathname.startsWith('/api/auth/') ||
      pathname.startsWith('/api/learning-profile') ||
      pathname.startsWith('/api/onboarding-state') ||
      pathname === '/favicon.ico' ||
      pathname.startsWith('/_next/')
    const onboardingDone = req.cookies.get('onboarding_done')?.value === 'true'
    const introSlidesDone = req.cookies.get('intro_slides_done')?.value === 'true'

    if (!onboardingExempt && !pathname.startsWith('/api/')) {
      if (!onboardingDone) {
        return NextResponse.redirect(new URL('/onboarding', req.url))
      }
      if (!introSlidesDone) {
        return NextResponse.redirect(new URL('/onboarding/intro', req.url))
      }
    }
  }

  
  // CSRF validation for mutation requests (POST, PUT, DELETE, PATCH)
  const mutationMethods = ['POST', 'PUT', 'DELETE', 'PATCH']
  if (pathname.startsWith('/api/') && mutationMethods.includes(req.method)) {
    const csrfCookie = req.cookies.get('csrf_token')?.value
    const csrfHeader = req.headers.get('x-csrf-token')

    if (!csrfCookie || !csrfHeader) {
      return NextResponse.json(
        { error: 'Token CSRF wajib disertakan' },
        { status: 403 }
      )
    }

    if (csrfCookie !== csrfHeader) {
      return NextResponse.json(
        { error: 'Token CSRF tidak cocok' },
        { status: 403 }
      )
    }
  }

  // Add user info to request headers for use in API routes.
  //
  // INVESTIGATION (2026-04): Several routes (api/quiz/submit, api/quiz/status,
  // api/generate-subtopic, and others) carry comments like
  // "Middleware header propagation has proven unreliable in production".
  // Reviewing the middleware path shows no functional bug — headers ARE cloned
  // onto the rewritten request via NextResponse.next({ request: { headers } }),
  // and Next.js forwards them to both edge and nodejs route handlers.
  //
  // The empirical flakiness observed in production is believed to come from:
  //   1. Middleware NOT matching the route (e.g. when `matcher` excludes a
  //      path, or when a request is served by a static/ISR cache layer that
  //      bypasses middleware entirely).
  //   2. Requests that never traverse middleware at all (direct server action
  //      invocations, certain edge-cache HITs, certain rewrites).
  //   3. Historical cases where the handler read the header BEFORE a refresh
  //      completed, so payload was unverified.
  //
  // In all three cases the root cause is NOT "middleware sets a header but
  // the handler doesn't see it"; it's "middleware didn't run for this
  // request, so the header was never set".
  //
  // CONTRACT FOR ROUTE HANDLERS:
  //   - Headers x-user-id, x-user-email, x-user-role are injected here AFTER
  //     verifyToken() has validated the access_token cookie. They are
  //     therefore SAFE TO TRUST inside /api/** handlers — do not re-verify
  //     the JWT just to "double check" the identity.
  //   - If a handler finds the header missing, that means middleware did not
  //     run for this request (see cases above). Falling back to
  //     verifyToken(req.cookies.get('access_token')) is the correct recovery
  //     path, and several routes already implement it. New routes SHOULD
  //     follow that pattern rather than returning 401 on missing header.
  //
  // Do not remove this comment without confirming the header-propagation
  // story is still understood by the next developer.
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
