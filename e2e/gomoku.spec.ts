import { expect, test, type Page } from '@playwright/test'

interface AudioLifecycle {
  readonly constructions: number
  readonly resumes: number
}

async function instrumentAudioLifecycle(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const lifecycle = { constructions: 0, resumes: 0 }
    Object.defineProperty(window, '__audioLifecycle', { value: lifecycle })

    const NativeAudioContext = window.AudioContext
    if (NativeAudioContext === undefined) return

    const InstrumentedAudioContext = new Proxy(NativeAudioContext, {
      construct(target, argumentsList, newTarget) {
        const context = Reflect.construct(target, argumentsList, newTarget) as AudioContext
        lifecycle.constructions += 1
        const resume = context.resume.bind(context)
        Object.defineProperty(context, 'resume', {
          configurable: true,
          value: () => {
            lifecycle.resumes += 1
            return resume()
          },
        })
        return context
      },
    })
    Object.defineProperty(window, 'AudioContext', {
      configurable: true,
      writable: true,
      value: InstrumentedAudioContext,
    })
  })
}

async function readAudioLifecycle(page: Page): Promise<AudioLifecycle> {
  return page.evaluate(() => (
    window as typeof window & { readonly __audioLifecycle: AudioLifecycle }
  ).__audioLifecycle)
}

function intersection(page: Page, row: number, col: number, state: '空位' | '黑棋' | '白棋') {
  return page.getByRole('button', { name: `第 ${row} 行第 ${col} 列，${state}` })
}

function occupiedIntersections(page: Page) {
  return page.getByRole('button', {
    name: /^第 \d+ 行第 \d+ 列，(?:黑棋|白棋)(?:，.*)?$/,
  })
}

test('从合集进入五子棋，刷新恢复棋局，黑方获胜后可悔棋', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('link', { name: /五子棋/ }).click()
  await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()

  await intersection(page, 8, 4, '空位').click()
  await intersection(page, 9, 4, '空位').click()

  await page.reload()

  await expect(intersection(page, 8, 4, '黑棋')).toBeVisible()
  await expect(intersection(page, 9, 4, '白棋')).toBeVisible()
  await expect(occupiedIntersections(page)).toHaveCount(2)
  await expect(page.getByRole('status')).toHaveText('黑方回合')

  for (const [row, col] of [
    [8, 5],
    [9, 5],
    [8, 6],
    [9, 6],
    [8, 7],
    [9, 7],
    [8, 8],
  ] as const) {
    await intersection(page, row, col, '空位').click()
  }

  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeVisible()
  await page.getByRole('button', { name: '悔棋一步' }).click()

  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeHidden()
  await expect(page.getByRole('status')).toHaveText('黑方回合')
  await expect(occupiedIntersections(page)).toHaveCount(8)
  await expect(intersection(page, 8, 4, '黑棋')).toBeVisible()
  await expect(intersection(page, 9, 7, '白棋')).toBeVisible()
  await expect(intersection(page, 8, 8, '空位')).toBeVisible()

  await intersection(page, 8, 8, '空位').click()
  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeVisible()
})

test('重新开始取消时保留棋局，确认后清空棋盘', async ({ page }) => {
  await page.goto('/#/games/gomoku')
  await intersection(page, 8, 8, '空位').click()

  await page.getByRole('button', { name: '重新开始' }).click()
  await expect(page.getByRole('dialog', { name: '重新开始本局？' })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()

  await expect(intersection(page, 8, 8, '黑棋')).toBeVisible()

  await page.getByRole('button', { name: '重新开始' }).click()
  await page.getByRole('button', { name: '确认重新开始' }).click()

  await expect(page.getByRole('dialog', { name: '重新开始本局？' })).toBeHidden()
  await page.reload()

  await expect(intersection(page, 8, 8, '空位')).toBeVisible()
  await expect(occupiedIntersections(page)).toHaveCount(0)
  await expect(page.getByRole('status')).toHaveText('黑方回合')
})

test('音乐开关跨刷新保存，且仅真实鼠标、触控或键盘激活音频', async ({ context, page }, testInfo) => {
  const errors: string[] = []
  const httpRequests: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') httpRequests.push(url.href)
  })

  await instrumentAudioLifecycle(page)
  await page.goto('/#/games/gomoku')

  const toggle = page.getByRole('button', { name: '音乐' })
  await expect(toggle).toBeVisible()
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveAttribute('aria-pressed', 'true')
  await expect(toggle).toHaveText('音乐开')
  await page.evaluate(() => {
    document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
    document.dispatchEvent(new Event('keydown', { bubbles: true }))
  })
  expect(await readAudioLifecycle(page)).toEqual({ constructions: 0, resumes: 0 })

  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-pressed', 'false')
  await expect(toggle).toHaveText('音乐关')

  await page.reload()

  const reloadedToggle = page.getByRole('button', { name: '音乐' })
  await expect(reloadedToggle).toHaveAttribute('aria-pressed', 'false')
  await expect(reloadedToggle).toHaveText('音乐关')

  await reloadedToggle.evaluate((button) => {
    if (!(button instanceof HTMLButtonElement)) throw new Error('音乐开关应当是 button')
    button.click()
  })
  await expect(reloadedToggle).toHaveAttribute('aria-pressed', 'true')
  await expect(reloadedToggle).toHaveText('音乐开')
  expect(await readAudioLifecycle(page)).toEqual({ constructions: 0, resumes: 0 })

  if (testInfo.project.name.startsWith('mobile-')) {
    await reloadedToggle.tap()
    await reloadedToggle.tap()
  } else {
    await reloadedToggle.click()
    await reloadedToggle.click()
  }
  await expect.poll(() => readAudioLifecycle(page)).toEqual({ constructions: 1, resumes: 1 })

  if (testInfo.project.name.startsWith('mobile-')) await reloadedToggle.tap()
  else await reloadedToggle.click()
  await reloadedToggle.focus()
  await page.keyboard.press('Enter')
  await expect.poll(() => readAudioLifecycle(page)).toEqual({ constructions: 1, resumes: 2 })

  await page.getByRole('link', { name: '返回小游戏' }).click()
  await expect(page.getByRole('heading', { name: '小游戏' })).toBeVisible()

  const appOrigin = new URL(page.url()).origin
  const externalRequests = httpRequests.filter(
    (requestUrl) => new URL(requestUrl).origin !== appOrigin,
  )
  expect(errors).toEqual([])
  expect(externalRequests).toEqual([])
})
