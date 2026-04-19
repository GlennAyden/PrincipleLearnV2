const mockCookieGet = jest.fn()
const mockVerifyToken = jest.fn()
const mockVerifyRefreshToken = jest.fn()
const mockUpdateUserRefreshTokenHash = jest.fn().mockResolvedValue(undefined)

jest.mock('next/headers', () => ({
  cookies: jest.fn(async () => ({
    get: (name: string) => mockCookieGet(name),
  })),
}))

jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  verifyRefreshToken: (...args: unknown[]) => mockVerifyRefreshToken(...args),
}))

jest.mock('@/services/auth.service', () => ({
  updateUserRefreshTokenHash: (...args: unknown[]) => mockUpdateUserRefreshTokenHash(...args),
}))

import { POST } from '@/app/api/auth/logout/route'

function setCookies(values: Record<string, string>) {
  mockCookieGet.mockImplementation((name: string) =>
    values[name] ? { value: values[name] } : undefined,
  )
}

function createLogoutRequest(headers?: Record<string, string>): Request {
  return new Request('http://localhost:3000/api/auth/logout', {
    method: 'POST',
    headers,
  })
}

describe('POST /api/auth/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setCookies({})
  })

  it('rejects logout when the CSRF token is missing or invalid', async () => {
    setCookies({ csrf_token: 'csrf-cookie' })

    const response = await POST(createLogoutRequest())
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Token CSRF tidak valid')
    expect(mockUpdateUserRefreshTokenHash).not.toHaveBeenCalled()
  })

  it('rejects logout when the CSRF header does not match the cookie', async () => {
    setCookies({ csrf_token: 'csrf-cookie' })

    const response = await POST(
      createLogoutRequest({ 'x-csrf-token': 'csrf-header-yang-salah' }),
    )
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Token CSRF tidak valid')
    expect(mockUpdateUserRefreshTokenHash).not.toHaveBeenCalled()
  })

  it('revokes the refresh hash when the access token is still valid', async () => {
    setCookies({
      csrf_token: 'csrf-match',
      access_token: 'valid-access-token',
    })
    mockVerifyToken.mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
    })

    const response = await POST(
      createLogoutRequest({ 'x-csrf-token': 'csrf-match' }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(data.message).toBe('Berhasil keluar')
    expect(mockUpdateUserRefreshTokenHash).toHaveBeenCalledWith('user-1', null)

    const cookieNames = response.headers.getSetCookie().map((cookie) => cookie.split('=')[0])
    expect(cookieNames).toEqual(expect.arrayContaining(['access_token', 'refresh_token', 'csrf_token']))
  })

  it('falls back to the refresh token when the access token is already expired', async () => {
    setCookies({
      csrf_token: 'csrf-match',
      access_token: 'expired-access-token',
      refresh_token: 'valid-refresh-token',
    })
    mockVerifyToken.mockReturnValue(null)
    mockVerifyRefreshToken.mockReturnValue({
      userId: 'user-2',
      email: 'user2@example.com',
      role: 'user',
    })

    const response = await POST(
      createLogoutRequest({ 'x-csrf-token': 'csrf-match' }),
    )

    expect(response.status).toBe(200)
    expect(mockUpdateUserRefreshTokenHash).toHaveBeenCalledWith('user-2', null)
  })

  it('still clears cookies even when no authenticated user can be resolved', async () => {
    setCookies({
      csrf_token: 'csrf-match',
    })
    mockVerifyToken.mockReturnValue(null)
    mockVerifyRefreshToken.mockReturnValue(null)

    const response = await POST(
      createLogoutRequest({ 'x-csrf-token': 'csrf-match' }),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.success).toBe(true)
    expect(mockUpdateUserRefreshTokenHash).not.toHaveBeenCalled()
    expect(response.headers.getSetCookie().some((cookie) => cookie.includes('refresh_token='))).toBe(true)
  })
})
