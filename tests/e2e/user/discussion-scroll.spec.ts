import { test, expect } from '@playwright/test'
import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { sign } from 'jsonwebtoken'

loadEnv({ path: '.env', override: false })
loadEnv({ path: '.env.local', override: true })

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000'
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const JWT_SECRET = process.env.JWT_SECRET

interface DiscussionTarget {
  userId: string
  email: string
  role: string
  courseId: string
  moduleId: string
  moduleIndex: number
  messageCount: number
}

async function resolveDiscussionTarget(): Promise<DiscussionTarget | null> {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return null
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  const { data: sessions, error: sessionError } = await supabase
    .from('discussion_sessions')
    .select('id, user_id, course_id, subtopic_id, created_at')
    .not('user_id', 'is', null)
    .not('course_id', 'is', null)
    .not('subtopic_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(20)

  if (sessionError || !sessions?.length) {
    return null
  }

  let bestCandidate: DiscussionTarget | null = null

  for (const session of sessions) {
    if (!session.user_id || !session.course_id || !session.subtopic_id) continue

    const { count } = await supabase
      .from('discussion_messages')
      .select('id', { count: 'exact', head: true })
      .eq('session_id', session.id)

    if (!count || count < 4) {
      continue
    }

    const [{ data: userRow }, { data: modules }] = await Promise.all([
      supabase
        .from('users')
        .select('email, role')
        .eq('id', session.user_id)
        .limit(1)
        .maybeSingle(),
      supabase
        .from('subtopics')
        .select('id, order_index')
        .eq('course_id', session.course_id)
        .order('order_index', { ascending: true }),
    ])

    if (!userRow?.email || !modules?.length) {
      continue
    }

    if (String(userRow.role ?? '').toLowerCase() === 'admin') {
      continue
    }

    const moduleIndex = modules.findIndex((module) => module.id === session.subtopic_id)
    if (moduleIndex === -1) {
      continue
    }

    const candidate: DiscussionTarget = {
      userId: session.user_id,
      email: userRow.email,
      role: userRow.role || 'user',
      courseId: session.course_id,
      moduleId: session.subtopic_id,
      moduleIndex,
      messageCount: count,
    }

    if (!bestCandidate || candidate.messageCount > bestCandidate.messageCount) {
      bestCandidate = candidate
    }
  }

  return bestCandidate
}

interface ScrollRootMetrics {
  key: string
  scrollTop: number
  scrollHeight: number
  clientHeight: number
}

test.describe('discussion scroll regression', () => {
  test.use({ viewport: { width: 1280, height: 420 } })

  test('supports wheel scrolling from the discussion header area', async ({ page, context }) => {
    test.slow()

    const target = await resolveDiscussionTarget()
    test.skip(
      !target || !JWT_SECRET,
      'Requires Supabase service-role env, JWT_SECRET, and at least one populated discussion session',
    )

    const accessToken = sign(
      {
        userId: target!.userId,
        email: target!.email,
        role: target!.role,
        type: 'access',
      },
      JWT_SECRET!,
      { expiresIn: '15m' },
    )

    await context.addCookies([
      {
        name: 'access_token',
        value: accessToken,
        url: BASE_URL,
        httpOnly: true,
        sameSite: 'Lax',
      },
      {
        name: 'csrf_token',
        value: 'discussion-scroll-csrf',
        url: BASE_URL,
        sameSite: 'Lax',
      },
      {
        name: 'onboarding_done',
        value: 'true',
        url: BASE_URL,
        sameSite: 'Lax',
      },
    ])

    await page.goto(
      `/course/${target!.courseId}/discussion/${target!.moduleIndex}?scope=module&module=${target!.moduleIndex}&moduleId=${target!.moduleId}`,
    )
    await expect(page.getByRole('heading', { name: 'Diskusi Wajib' })).toBeVisible({
      timeout: 30_000,
    })

    const container = page.locator('[class*="page_container__"]').first()
    await expect(container).toBeVisible()

    await page.evaluate(() => {
      const containerNode = document.querySelector<HTMLElement>('[class*="page_container__"]')
      if (!containerNode) return

      let spacer = document.getElementById('discussion-scroll-regression-spacer')
      if (!spacer) {
        spacer = document.createElement('div')
        spacer.id = 'discussion-scroll-regression-spacer'
        spacer.setAttribute('aria-hidden', 'true')
        spacer.style.width = '100%'
        spacer.style.height = '2200px'
        spacer.style.flex = '0 0 auto'
        spacer.style.pointerEvents = 'none'
        containerNode.appendChild(spacer)
      }
    })

    const scrollRoot = await page.evaluate<ScrollRootMetrics | null>(() => {
      const candidates: ScrollRootMetrics[] = []
      const selectors = [
        ['discussion-container', '[class*="page_container__"]'],
        ['course-content', '[class*="layout_content__"]'],
      ] as const

      for (const [key, selector] of selectors) {
        const node = document.querySelector<HTMLElement>(selector)
        if (!node) continue
        candidates.push({
          key,
          scrollTop: node.scrollTop,
          scrollHeight: node.scrollHeight,
          clientHeight: node.clientHeight,
        })
      }

      const scrollingElement = document.scrollingElement as HTMLElement | null
      if (scrollingElement) {
        candidates.push({
          key: 'document',
          scrollTop: scrollingElement.scrollTop,
          scrollHeight: scrollingElement.scrollHeight,
          clientHeight: scrollingElement.clientHeight,
        })
      }

      const overflowingCandidates = candidates
        .filter((candidate) => candidate.scrollHeight > candidate.clientHeight + 8)
        .sort(
          (left, right) =>
            right.scrollHeight - right.clientHeight - (left.scrollHeight - left.clientHeight),
        )

      return overflowingCandidates[0] ?? null
    })
    test.skip(!scrollRoot, 'No overflow scroll root found for the selected discussion page')

    await page.evaluate((key) => {
      const resetNode =
        key === 'discussion-container'
          ? document.querySelector<HTMLElement>('[class*="page_container__"]')
          : key === 'course-content'
            ? document.querySelector<HTMLElement>('[class*="layout_content__"]')
            : (document.scrollingElement as HTMLElement | null)

      if (resetNode) {
        resetNode.scrollTop = 0
      }
    }, scrollRoot!.key)
    await page.waitForTimeout(250)

    const before = await page.evaluate((key) => {
      const node =
        key === 'discussion-container'
          ? document.querySelector<HTMLElement>('[class*="page_container__"]')
          : key === 'course-content'
            ? document.querySelector<HTMLElement>('[class*="layout_content__"]')
            : (document.scrollingElement as HTMLElement | null)

      return node?.scrollTop ?? 0
    }, scrollRoot!.key)

    await page.getByRole('heading', { name: 'Diskusi Wajib' }).hover()
    await page.mouse.wheel(0, 1200)
    await page.waitForTimeout(350)

    const after = await page.evaluate((key) => {
      const node =
        key === 'discussion-container'
          ? document.querySelector<HTMLElement>('[class*="page_container__"]')
          : key === 'course-content'
            ? document.querySelector<HTMLElement>('[class*="layout_content__"]')
            : (document.scrollingElement as HTMLElement | null)

      return node?.scrollTop ?? 0
    }, scrollRoot!.key)

    expect(target!.messageCount).toBeGreaterThanOrEqual(4)
    expect(after).toBeGreaterThan(before)
  })
})
