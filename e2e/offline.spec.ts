import { expect, test } from '@playwright/test'

test('应用缓存后可离线重新打开五子棋', async ({ context, page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-webkit',
    'Playwright WebKit 在 Service Worker 控制页面离线 reload 时报告内部错误',
  )

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

  try {
    await page.goto('/#/games/gomoku')
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload()

    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)

    await context.setOffline(true)
    await page.reload()

    await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()
    const board = page.getByRole('group', { name: '十五乘十五五子棋棋盘' })
    await expect(board).toBeVisible()
    await expect(board.getByRole('button')).toHaveCount(15 * 15)

    const toggle = page.getByRole('button', { name: '音乐' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveText('音乐开')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveText('音乐关')

    await board.getByRole('button', { name: '第 8 行第 8 列，空位' }).click()
    await expect(board.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeVisible()

    const appOrigin = new URL(page.url()).origin
    const externalRequests = httpRequests.filter(
      (requestUrl) => new URL(requestUrl).origin !== appOrigin,
    )
    expect(errors).toEqual([])
    expect(externalRequests).toEqual([])
  } finally {
    await context.setOffline(false)
  }
})
