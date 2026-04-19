import { NextRequest } from 'next/server'

const mockVerifyToken = jest.fn()
const mockVerifyRefreshToken = jest.fn()
const mockFrom = jest.fn()
const mockEq = jest.fn()
const mockUpdate = jest.fn()

jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
  verifyRefreshToken: (...args: unknown[]) => mockVerifyRefreshToken(...args),
}))

jest.mock('@/lib/database', () => ({
  adminDb: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}))

import { POST } from '@/app/api/admin/logout/route'

function createRequest(
  cookies: Record<string, string>,
  headers: Record<string, string> = {},
): NextRequest {
  const cookieHeader = Object.entries(cookies)
    .map(([name, value]) => `${name}=${value}`)
    .join('; ')

  return new NextRequest('http://localhost:3000/api/admin/logout', {
    method: 'POST',
    headers: {
      ...headers,
      Cookie: cookieHeader,
    },
  })
}

describe('POST /api/admin/logout', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockEq.mockReturnValue({ update: mockUpdate })
    mockFrom.mockReturnValue({ eq: mockEq })
    mockUpdate.mockResolvedValue({ data: null, error: null })
  })

  it('rejects logout when the CSRF token is missing', async () => {
    const response = await POST(createRequest({ access_token: 'token' }))
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('CSRF token missing')
  })

  it('returns 401 when admin auth cannot be resolved', async () => {
    mockVerifyToken.mockReturnValue(null)
    mockVerifyRefreshToken.mockReturnValue(null)

    const response = await POST(
      createRequest(
        {
          access_token: 'expired-admin-token',
          csrf_token: 'csrf-match',
        },
        { 'x-csrf-token': 'csrf-match' },
      ),
    )
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Token admin tidak valid atau kedaluwarsa')
  })

  it('returns 401 when no access or refresh token is present', async () => {
    const response = await POST(
      createRequest(
        {
          csrf_token: 'csrf-match',
        },
        { 'x-csrf-token': 'csrf-match' },
      ),
    )
    const data = await response.json()

    expect(response.status).toBe(401)
    expect(data.error).toBe('Tidak terotorisasi')
  })

  it('clears the refresh hash for a valid admin access token', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    })

    const response = await POST(
      createRequest(
        {
          access_token: 'valid-admin-token',
          csrf_token: 'csrf-match',
        },
        { 'x-csrf-token': 'csrf-match' },
      ),
    )
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.ok).toBe(true)
    expect(mockFrom).toHaveBeenCalledWith('users')
    expect(mockEq).toHaveBeenCalledWith('id', 'admin-1')
    expect(mockUpdate).toHaveBeenCalledWith({ refresh_token_hash: null })
  })

  it('falls back to a valid admin refresh token when access is expired', async () => {
    mockVerifyToken.mockReturnValue(null)
    mockVerifyRefreshToken.mockReturnValue({
      userId: 'admin-2',
      email: 'admin2@example.com',
      role: 'ADMIN',
    })

    const response = await POST(
      createRequest(
        {
          access_token: 'expired-admin-token',
          refresh_token: 'valid-admin-refresh-token',
          csrf_token: 'csrf-match',
        },
        { 'x-csrf-token': 'csrf-match' },
      ),
    )

    expect(response.status).toBe(200)
    expect(mockEq).toHaveBeenCalledWith('id', 'admin-2')
    expect(mockUpdate).toHaveBeenCalledWith({ refresh_token_hash: null })
  })

  it('returns 403 when the resolved token is not an admin token', async () => {
    mockVerifyToken.mockReturnValue(null)
    mockVerifyRefreshToken.mockReturnValue({
      userId: 'user-1',
      email: 'user@example.com',
      role: 'user',
    })

    const response = await POST(
      createRequest(
        {
          refresh_token: 'valid-user-refresh-token',
          csrf_token: 'csrf-match',
        },
        { 'x-csrf-token': 'csrf-match' },
      ),
    )
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Akses ditolak')
  })
})
