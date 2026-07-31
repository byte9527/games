import { expect, test, type Page } from '@playwright/test'

const gomokuPath = '/#/games/gomoku'

async function openGomoku(page: Page): Promise<void> {
  await page.goto(gomokuPath)
  await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()
}

function point(page: Page, row: number, col: number) {
  return page.locator(`.intersection[data-row="${row}"][data-col="${col}"]`)
}

test.describe('320px 竖屏布局', () => {
  test.use({ viewport: { width: 320, height: 700 } })

  test('页面无横向溢出且棋盘保持在可用宽度内', async ({ page }) => {
    await openGomoku(page)

    await expect(page.locator('.game-header')).toBeVisible()
    await expect(page.locator('.game-controls')).toBeVisible()

    const metrics = await page.evaluate(() => {
      const board = document.querySelector<HTMLElement>('.gomoku-board')
      const bounds = board?.getBoundingClientRect()
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        boardWidth: bounds?.width ?? 0,
        boardHeight: bounds?.height ?? 0,
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.boardWidth).toBeLessThanOrEqual(296)
    expect(Math.abs(metrics.boardWidth - metrics.boardHeight)).toBeLessThanOrEqual(1)
  })
})

test('iPhone 13 上棋盘和触控控件适配视口', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile', '仅验证 mobile project 的设备参数')
  await openGomoku(page)

  const metrics = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.gomoku-board')?.getBoundingClientRect()
    const controlHeights = Array.from(
      document.querySelectorAll<HTMLElement>('.game-controls button'),
      (button) => button.getBoundingClientRect().height,
    )
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      boardWidth: board?.width ?? 0,
      boardHeight: board?.height ?? 0,
      controlHeights,
    }
  })

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.boardWidth).toBeLessThanOrEqual(metrics.viewportWidth - 24)
  expect(Math.abs(metrics.boardWidth - metrics.boardHeight)).toBeLessThanOrEqual(1)
  expect(metrics.controlHeights).toHaveLength(2)
  expect(Math.min(...metrics.controlHeights)).toBeGreaterThanOrEqual(44)
})

test('桌面端限制页面和棋盘宽度并居中', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', '仅验证 Desktop Chrome project')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await openGomoku(page)

  const metrics = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.gomoku-board')?.getBoundingClientRect()
    const game = document.querySelector<HTMLElement>('.gomoku-page')?.getBoundingClientRect()
    return {
      viewportWidth: window.innerWidth,
      boardWidth: board?.width ?? 0,
      boardHeight: board?.height ?? 0,
      gameWidth: game?.width ?? 0,
      gameCenter: game === undefined ? 0 : game.left + game.width / 2,
    }
  })

  expect(metrics.boardWidth).toBeLessThanOrEqual(680)
  expect(Math.abs(metrics.boardWidth - metrics.boardHeight)).toBeLessThanOrEqual(1)
  expect(metrics.gameWidth).toBeLessThanOrEqual(760)
  expect(Math.abs(metrics.gameCenter - metrics.viewportWidth / 2)).toBeLessThanOrEqual(1)
})

for (const viewport of [
  { width: 320, height: 700 },
  { width: 375, height: 812 },
  { width: 768, height: 1024 },
  { width: 1440, height: 1000 },
]) {
  test(`${viewport.width}px 视口无横向溢出`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await openGomoku(page)

    const widths = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
      viewport: window.innerWidth,
    }))
    expect(widths.document).toBeLessThanOrEqual(widths.viewport)
    expect(widths.body).toBeLessThanOrEqual(widths.viewport)
  })
}

test('木质棋盘、棋子、最后一步和获胜线具有可辨识视觉', async ({ page }) => {
  await openGomoku(page)

  const boardStyle = await page.locator('.gomoku-board').evaluate((board) => {
    const style = getComputedStyle(board)
    return {
      backgroundColor: style.backgroundColor,
      borderStyle: style.borderStyle,
      borderWidth: style.borderWidth,
    }
  })
  expect(boardStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(boardStyle.borderStyle).toBe('solid')
  expect(parseFloat(boardStyle.borderWidth)).toBeGreaterThan(0)

  await point(page, 7, 7).click()
  await point(page, 7, 8).click()

  const blackBackground = await point(page, 7, 7)
    .locator('.stone--black')
    .evaluate((stone) => getComputedStyle(stone).backgroundImage)
  const whiteBackground = await point(page, 7, 8)
    .locator('.stone--white')
    .evaluate((stone) => getComputedStyle(stone).backgroundImage)
  const lastMoveStyle = await point(page, 7, 8)
    .locator('.last-move')
    .evaluate((marker) => {
      const style = getComputedStyle(marker)
      const rect = marker.getBoundingClientRect()
      return { backgroundColor: style.backgroundColor, width: rect.width }
    })

  expect(blackBackground).toContain('radial-gradient')
  expect(whiteBackground).toContain('radial-gradient')
  expect(lastMoveStyle.backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
  expect(lastMoveStyle.width).toBeGreaterThan(0)

  for (const [row, col] of [
    [0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4],
  ] as const) {
    await point(page, row, col).click()
  }

  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeVisible()
  await expect(page.locator('.stone--winning')).toHaveCount(5)
  const winningShadow = await page.locator('.stone--winning').first()
    .evaluate((stone) => getComputedStyle(stone).boxShadow)
  expect(winningShadow).not.toBe('none')
})

test('键盘焦点清晰且可用方向键与 Enter 落子', async ({ page }) => {
  await openGomoku(page)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '返回小游戏' })).toBeFocused()
  const focusStyle = await page.getByRole('link', { name: '返回小游戏' }).evaluate((link) => {
    const style = getComputedStyle(link)
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0)

  await page.keyboard.press('Tab')
  await expect(point(page, 0, 0)).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(point(page, 0, 1)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(point(page, 0, 1).locator('.stone--black')).toBeVisible()
  await expect(point(page, 0, 2)).toBeFocused()
})

test('确认弹窗隔离背景并在取消后恢复属性与焦点', async ({ page }) => {
  await openGomoku(page)
  await point(page, 7, 7).click()

  const restartButton = page.getByRole('button', { name: '重新开始' })
  const restartBounds = await restartButton.boundingBox()
  expect(restartBounds).not.toBeNull()
  await restartButton.click()

  const dialog = page.getByRole('dialog', { name: '重新开始本局？' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '')
  await expect(page.locator('.game-content')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused()

  if (restartBounds !== null) {
    await page.mouse.click(
      restartBounds.x + restartBounds.width / 2,
      restartBounds.y + restartBounds.height / 2,
    )
  }
  await expect(dialog).toBeVisible()
  await expect(page.locator('.stone')).toHaveCount(1)

  await page.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.game-content')).not.toHaveAttribute('inert', '')
  await expect(page.locator('.game-content')).not.toHaveAttribute('aria-hidden', 'true')
  await expect(restartButton).toBeFocused()
})

test('减少动态效果设置会将非必要动画与过渡压缩到近零', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openGomoku(page)

  const durations = await page.locator('.game-controls button').first().evaluate((button) => {
    const style = getComputedStyle(button)
    return {
      animationDuration: style.animationDuration,
      transitionDuration: style.transitionDuration,
    }
  })

  const seconds = (value: string): number => {
    if (value.endsWith('ms')) return parseFloat(value) / 1000
    return parseFloat(value)
  }
  expect(seconds(durations.animationDuration)).toBeLessThanOrEqual(0.000_01)
  expect(seconds(durations.transitionDuration)).toBeLessThanOrEqual(0.000_01)
})
