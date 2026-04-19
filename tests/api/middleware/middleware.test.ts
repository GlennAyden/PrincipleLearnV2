import { NextRequest } from 'next/server'

const mockVerifyToken = jest.fn()

jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}))

import { middleware } from '../../../middleware'

function createRequest(
  path: string,
  options: {
    method?: string
    cookies?: Record<string, string>
  } = {},
): NextRequest {
  const url = new URL(path, 'http://localhost:3000')
  const request = new NextRequest(url, { method: options.method ?? 'GET' })

  for (const [name, value] of Object.entries(options.cookies ?? {})) {
    request.cookies.set(name, value)
  }

  return request
}

describe('middleware auth flow', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns JSON 401 for protected API routes without an access token', async () => {
    const response = middleware(createRequest('/api/courses'))
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Autentikasi diperlukan')
    expect(response.headers.get('location')).toBeNull()
  })

  it('returns JSON 401 for invalid API tokens even when a refresh token exists', async () => {
    mockVerifyToken.mockReturnValue(null)

    const response = middleware(
      createRequest('/api/courses', {
        cookies: {
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
        },
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(401)
    expect(body.error).toBe('Token tidak valid atau sudah kedaluwarsa')
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes('access_token='))).toBe(true)
  })

  it('lets expired page requests continue when a refresh token exists', () => {
    mockVerifyToken.mockReturnValue(null)

    const response = middleware(
      createRequest('/dashboard', {
        cookies: {
          access_token: 'expired-token',
          refresh_token: 'valid-refresh-token',
        },
      }),
    )

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes('access_token='))).toBe(true)
  })

  it('redirects protected user pages to /login when there is no session', () => {
    const response = middleware(createRequest('/dashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/login')
  })

  it('redirects protected admin pages to /admin/login when there is no session', () => {
    const response = middleware(createRequest('/admin/dashboard'))

    expect(response.status).toBe(307)
    expect(response.headers.get('location')).toContain('/admin/login')
  })

  it('allows auth API routes to pass through without a token', () => {
    const response = middleware(createRequest('/api/auth/refresh'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })

  it('rejects non-admin tokens for admin APIs with JSON 403', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
    })

    const response = middleware(
      createRequest('/api/admin/dashboard', {
        cookies: { access_token: 'valid-user-token' },
      }),
    )
    const body = await response.json()

    expect(response.status).toBe(403)
    expect(body.error).toBe('Akses ditolak: diperlukan peran admin')
  })

  it('passes valid API requests through and injects user headers', () => {
    mockVerifyToken.mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    })

    const response = middleware(
      createRequest('/api/courses', {
        cookies: { access_token: 'valid-token' },
      }),
    )

    expect(response.status).toBe(200)
    expect(
      response.headers.get('x-user-id') ||
        response.headers.get('x-middleware-request-x-user-id'),
    ).toBeTruthy()
    expect(
      response.headers.get('x-user-role') ||
        response.headers.get('x-middleware-request-x-user-role'),
    ).toBeTruthy()
  })

  it('allows public routes without a token', () => {
    const response = middleware(createRequest('/'))

    expect(response.status).toBe(200)
    expect(response.headers.get('location')).toBeNull()
  })
})
