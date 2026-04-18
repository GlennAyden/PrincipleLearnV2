import { test, expect, type Page } from '@playwright/test'

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || 'admin@principlelearn.com'
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || 'AdminPassword123!'

const STATIC_ADMIN_ROUTES = [
  '/admin/dashboard',
  '/admin/siswa',
  '/admin/aktivitas',
  '/admin/ekspor',
  '/admin/register',
  '/admin/riset',
  '/admin/riset/bukti',
  '/admin/riset/prompt',
  '/admin/riset/kognitif',
  '/admin/riset/readiness',
  '/admin/riset/triangulasi',
]

async function loginAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.fill('input[name="email"], input[type="email"]', ADMIN_EMAIL)
  await page.fill('input[name="password"], input[type="password"]', ADMIN_PASSWORD)
  await page.click('button[type="submit"]')
  await page.waitForURL(/\/admin(\/dashboard)?(?!.*login)/, { timeout: 15_000 })
}

async function resolveAdminRoutes(page: Page) {
  const routes = [...STATIC_ADMIN_ROUTES]
  const response = await page.request.get('/api/admin/users?limit=1')
  if (response.ok()) {
    const users = (await response.json().catch(() => [])) as Array<{ id?: string }>
    const firstUserId = users.find((user) => typeof user.id === 'string' && user.id.length > 0)?.id
    if (firstUserId) {
      routes.push(`/admin/siswa/${firstUserId}`)
    }
  }
  return routes
}

test.describe('admin smoke from clean browser state', () => {
  test.use({ storageState: undefined })

  test('loads core admin pages without hard API or render failures', async ({ page }) => {
    test.setTimeout(180_000)

    const serverFailures: string[] = []
    const requestFailures: string[] = []

    page.on('response', (response) => {
      const url = response.url()
      if (url.includes('/api/admin') && response.status() >= 500) {
        serverFailures.push(`${response.status()} ${url}`)
      }
    })

    page.on('requestfailed', (request) => {
      const url = request.url()
      const errorText = request.failure()?.errorText ?? 'unknown'
      if (
        url.includes('/api/admin') &&
        !/ERR_ABORTED|NS_BINDING_ABORTED|cancelled|canceled/i.test(errorText)
      ) {
        requestFailures.push(`${errorText} ${url}`)
      }
    })

    await page.context().clearCookies()
    await page.evaluate(() => {
      window.localStorage.clear()
      window.sessionStorage.clear()
    }).catch(() => undefined)

    await loginAdmin(page)

    for (const route of await resolveAdminRoutes(page)) {
      await page.goto(route)
      await page.waitForLoadState('domcontentloaded')
      await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined)
      await expect(page.locator('body')).not.toContainText(/404|500|Internal server error/i)
    }

    expect(serverFailures).toEqual([])
    expect(requestFailures).toEqual([])
  })
})
