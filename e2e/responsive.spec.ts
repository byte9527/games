import { expect, test, type Page } from '@playwright/test'

const gomokuPath = '/#/games/gomoku'

async function openGomoku(page: Page): Promise<void> {
  await page.goto(gomokuPath)
  await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()
}

async function openSudoku(page: Page): Promise<void> {
  await page.goto('/#/games/sudoku')
  await expect(page.getByRole('heading', { name: '数独' })).toBeVisible()
}

function point(page: Page, row: number, col: number) {
  return page.locator(`.intersection[data-row="${row}"][data-col="${col}"]`)
}

async function playBlackWin(page: Page): Promise<void> {
  for (const [row, col] of [
    [0, 0], [1, 0], [0, 1], [1, 1], [0, 2], [1, 2], [0, 3], [1, 3], [0, 4],
  ] as const) {
    await point(page, row, col).click()
  }
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
  test.skip(!testInfo.project.name.startsWith('mobile-'), '仅验证 mobile projects 的设备参数')
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
  test.skip(testInfo.project.name !== 'desktop-chromium', '仅验证 Desktop Chrome project')
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

  const blackStyle = await point(page, 7, 7)
    .locator('.stone--black')
    .evaluate((stone) => {
      const style = getComputedStyle(stone)
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow,
        outline: style.outline,
      }
    })
  const whiteStyle = await point(page, 7, 8)
    .locator('.stone--white')
    .evaluate((stone) => {
      const style = getComputedStyle(stone)
      return {
        backgroundColor: style.backgroundColor,
        backgroundImage: style.backgroundImage,
        borderColor: style.borderColor,
        borderStyle: style.borderStyle,
        boxShadow: style.boxShadow,
        outline: style.outline,
      }
    })
  const lastMoveComparison = await point(page, 7, 8).evaluate((intersection) => {
    const stone = intersection.querySelector<HTMLElement>('.stone')
    const marker = intersection.querySelector<HTMLElement>('.last-move')
    if (stone === null || marker === null) return null
    const stoneStyle = getComputedStyle(stone)
    const markerStyle = getComputedStyle(marker)
    return {
      stoneBackground: stoneStyle.backgroundColor,
      stoneWidth: stone.getBoundingClientRect().width,
      markerBackground: markerStyle.backgroundColor,
      markerBorderStyle: markerStyle.borderStyle,
      markerBorderWidth: markerStyle.borderWidth,
      markerWidth: marker.getBoundingClientRect().width,
    }
  })

  expect(blackStyle.backgroundImage).toContain('radial-gradient')
  expect(whiteStyle.backgroundImage).toContain('radial-gradient')
  expect([
    blackStyle.backgroundColor,
    blackStyle.backgroundImage,
    blackStyle.borderColor,
    blackStyle.borderStyle,
  ]).not.toEqual([
    whiteStyle.backgroundColor,
    whiteStyle.backgroundImage,
    whiteStyle.borderColor,
    whiteStyle.borderStyle,
  ])
  expect(lastMoveComparison).not.toBeNull()
  expect(lastMoveComparison?.markerBackground).not.toBe(lastMoveComparison?.stoneBackground)
  expect(lastMoveComparison?.markerBorderStyle).not.toBe('none')
  expect(parseFloat(lastMoveComparison?.markerBorderWidth ?? '0')).toBeGreaterThan(0)
  expect(lastMoveComparison?.markerWidth ?? 0).toBeGreaterThan(0)
  expect(lastMoveComparison?.markerWidth ?? 0).toBeLessThan(lastMoveComparison?.stoneWidth ?? 0)

  await playBlackWin(page)

  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeVisible()
  await expect(page.locator('.stone--winning')).toHaveCount(5)
  const winningStyle = await page.locator('.stone--winning').first().evaluate((stone) => {
    const style = getComputedStyle(stone)
    return { boxShadow: style.boxShadow, outline: style.outline }
  })
  expect(winningStyle).not.toEqual({
    boxShadow: blackStyle.boxShadow,
    outline: blackStyle.outline,
  })
})

test('强制颜色模式下网格、棋子与落子标记仍可辨识', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '强制颜色模拟仅在桌面 Chromium 验证')
  await page.emulateMedia({ forcedColors: 'active' })
  await openGomoku(page)
  await point(page, 7, 7).click()
  await point(page, 7, 8).click()

  const styles = await page.evaluate(() => {
    const board = document.querySelector<HTMLElement>('.gomoku-board')
    const intersection = document.querySelector<HTMLElement>('.intersection')
    const black = document.querySelector<HTMLElement>('.stone--black')
    const white = document.querySelector<HTMLElement>('.stone--white')
    const marker = document.querySelector<HTMLElement>('.last-move')
    if (board === null || intersection === null || black === null || white === null || marker === null) {
      return null
    }
    const boardStyle = getComputedStyle(board)
    const lineStyle = getComputedStyle(intersection, '::before')
    const blackStyle = getComputedStyle(black)
    const whiteStyle = getComputedStyle(white)
    const markerStyle = getComputedStyle(marker)
    return {
      boardBackground: boardStyle.backgroundColor,
      lineBackground: lineStyle.backgroundColor,
      lineForcedColorAdjust: lineStyle.forcedColorAdjust,
      black: {
        background: blackStyle.backgroundColor,
        borderColor: blackStyle.borderColor,
        borderStyle: blackStyle.borderStyle,
        forcedColorAdjust: blackStyle.forcedColorAdjust,
      },
      white: {
        background: whiteStyle.backgroundColor,
        borderColor: whiteStyle.borderColor,
        borderStyle: whiteStyle.borderStyle,
        forcedColorAdjust: whiteStyle.forcedColorAdjust,
      },
      marker: {
        background: markerStyle.backgroundColor,
        borderColor: markerStyle.borderColor,
        borderStyle: markerStyle.borderStyle,
        forcedColorAdjust: markerStyle.forcedColorAdjust,
        width: marker.getBoundingClientRect().width,
      },
      stoneWidth: white.getBoundingClientRect().width,
    }
  })

  expect(styles).not.toBeNull()
  expect(styles?.lineForcedColorAdjust).toBe('none')
  expect(styles?.lineBackground).not.toBe(styles?.boardBackground)
  expect(styles?.black.forcedColorAdjust).toBe('none')
  expect(styles?.white.forcedColorAdjust).toBe('none')
  expect(styles?.black).not.toEqual(styles?.white)
  expect(styles?.marker.forcedColorAdjust).toBe('none')
  expect(styles?.marker.background).not.toBe(styles?.white.background)
  expect(styles?.marker.borderStyle).not.toBe('none')
  expect(styles?.marker.width ?? 0).toBeLessThan(styles?.stoneWidth ?? 0)

  await page.reload()
  await playBlackWin(page)
  const winningStyle = await page.locator('.stone--winning').first().evaluate((stone) => {
    const style = getComputedStyle(stone)
    return {
      forcedColorAdjust: style.forcedColorAdjust,
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
    }
  })
  expect(winningStyle.forcedColorAdjust).toBe('none')
  expect(winningStyle.outlineStyle).not.toBe('none')
  expect(parseFloat(winningStyle.outlineWidth)).toBeGreaterThan(0)
})

test('五子棋私有控制区样式不会泄漏到合集页面', async ({ page }) => {
  await page.goto('/#/')
  await expect(page.getByRole('heading', { name: '小游戏' })).toBeVisible()

  const styles = await page.evaluate(() => {
    const controls = document.createElement('div')
    controls.className = 'game-controls'
    controls.innerHTML = '<button type="button">测试按钮</button>'
    document.querySelector('main')?.append(controls)

    const dialog = document.createElement('section')
    dialog.className = 'dialog-card'
    dialog.innerHTML = '<div class="dialog-actions"><button type="button">共享按钮</button></div>'
    document.querySelector('main')?.append(dialog)

    const controlStyle = getComputedStyle(controls)
    const dialogStyle = getComputedStyle(dialog)
    const sharedButtonStyle = getComputedStyle(dialog.querySelector('button')!)
    return {
      controlDisplay: controlStyle.display,
      controlColumns: controlStyle.gridTemplateColumns,
      dialogBackground: dialogStyle.backgroundColor,
      dialogBorderStyle: dialogStyle.borderStyle,
      sharedButtonMinHeight: sharedButtonStyle.minHeight,
    }
  })

  expect(styles.controlDisplay).not.toBe('grid')
  expect(styles.controlColumns).toBe('none')
  expect(styles.dialogBackground).not.toBe('rgba(0, 0, 0, 0)')
  expect(styles.dialogBorderStyle).toBe('solid')
  expect(parseFloat(styles.sharedButtonMinHeight)).toBeGreaterThanOrEqual(44)
})

test('键盘焦点清晰且可用方向键与 Enter 落子', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile-webkit', 'iOS Safari 默认不启用完整键盘 Tab 导航')
  await openGomoku(page)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: /^(如何安装|安装到桌面)$/ })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('link', { name: '返回小游戏' })).toBeFocused()
  const focusStyle = await page.getByRole('link', { name: '返回小游戏' }).evaluate((link) => {
    const style = getComputedStyle(link)
    return { outlineStyle: style.outlineStyle, outlineWidth: style.outlineWidth }
  })
  expect(focusStyle.outlineStyle).not.toBe('none')
  expect(parseFloat(focusStyle.outlineWidth)).toBeGreaterThan(0)

  await page.keyboard.press('Tab')
  await expect(page.getByRole('button', { name: '音乐' })).toBeFocused()
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
  await restartButton.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: '重新开始本局？' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '')
  await expect(page.locator('.game-content')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused()

  const backgroundRestart = page.locator('.game-controls button', { hasText: '重新开始' })
  const restartBounds = await backgroundRestart.boundingBox()
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(restartBounds).not.toBeNull()
  expect(scrollY).toBeGreaterThanOrEqual(0)
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

for (const viewport of [
  { label: '320×740', width: 320, height: 740 },
  { label: '375×812', width: 375, height: 812 },
  { label: 'iPhone 13', width: 390, height: 844 },
  { label: '768px', width: 768, height: 1024 },
  { label: '1440px', width: 1440, height: 1000 },
]) {
  test(`数独在 ${viewport.label} 视口无溢出且棋盘与控制区可操作`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await openSudoku(page)

    const independentControls = page.locator(
      '.number-pad button, .sudoku-controls button, .difficulty-selector button',
    )
    await expect(independentControls).toHaveCount(17)
    for (let index = 0; index < 17; index += 1) {
      await expect(independentControls.nth(index)).toBeVisible()
    }

    const metrics = await page.evaluate(() => {
      const board = document.querySelector<HTMLElement>('.sudoku-board')?.getBoundingClientRect()
      const numberPad = document.querySelector<HTMLElement>('.number-pad')?.getBoundingClientRect()
      const controls = Array.from(
        document.querySelectorAll<HTMLElement>(
          '.number-pad button, .sudoku-controls button, .difficulty-selector button',
        ),
        (button) => {
          const bounds = button.getBoundingClientRect()
          return {
            height: bounds.height,
            width: bounds.width,
            left: bounds.left,
            right: bounds.right,
          }
        },
      )
      const cell = document.querySelector<HTMLElement>('.sudoku-cell')?.getBoundingClientRect()
      return {
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        board: board === undefined ? null : {
          width: board.width,
          height: board.height,
          left: board.left,
          right: board.right,
        },
        numberPad: numberPad === undefined ? null : {
          width: numberPad.width,
          height: numberPad.height,
          left: numberPad.left,
          right: numberPad.right,
        },
        cellWidth: cell?.width ?? 0,
        controls,
      }
    })

    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.board).not.toBeNull()
    expect(Math.abs((metrics.board?.width ?? 0) - (metrics.board?.height ?? 0))).toBeLessThanOrEqual(1)
    expect(metrics.board?.left ?? -1).toBeGreaterThanOrEqual(0)
    expect(metrics.board?.right ?? Infinity).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.numberPad).not.toBeNull()
    expect(metrics.numberPad?.width ?? 0).toBeGreaterThan(0)
    expect(metrics.numberPad?.height ?? 0).toBeGreaterThan(0)
    expect(metrics.numberPad?.left ?? -1).toBeGreaterThanOrEqual(0)
    expect(metrics.numberPad?.right ?? Infinity).toBeLessThanOrEqual(metrics.viewportWidth)
    expect(metrics.controls).toHaveLength(17)
    expect(Math.min(...metrics.controls.map(({ height }) => height))).toBeGreaterThanOrEqual(44)
    expect(Math.min(...metrics.controls.map(({ width }) => width))).toBeGreaterThan(0)
    expect(Math.min(...metrics.controls.map(({ left }) => left))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...metrics.controls.map(({ right }) => right))).toBeLessThanOrEqual(
      metrics.viewportWidth,
    )
    if (viewport.width === 320) {
      expect(metrics.cellWidth).toBeGreaterThanOrEqual(28)
      expect(metrics.cellWidth).toBeLessThan(44)
    }
  })
}

test('数独在强制颜色下宫线、焦点和冲突仍可辨识', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', '强制颜色模拟仅在桌面 Chromium 验证')
  await page.emulateMedia({ forcedColors: 'active' })
  await openSudoku(page)

  const cellsByRow = await page.getByRole('grid', { name: '九乘九数独棋盘' })
    .getByRole('button')
    .evaluateAll((buttons) => {
      const rows = new Map<number, Array<{ row: number; col: number }>>()
      for (const button of buttons) {
        const label = button.getAttribute('aria-label') ?? ''
        const match = /^第 (\d+) 行第 (\d+) 列，空格/.exec(label)
        if (match === null) continue
        const row = Number(match[1])
        const entry = { row, col: Number(match[2]) }
        rows.set(row, [...(rows.get(row) ?? []), entry])
      }
      return Array.from(rows.values()).find((row) => row.length >= 2)?.slice(0, 2) ?? []
    })
  if (cellsByRow.length !== 2) throw new Error('没有两个同行空格用于冲突测试')

  for (const cell of cellsByRow) {
    await page.getByRole('button', {
      name: new RegExp(`^第 ${cell.row} 行第 ${cell.col} 列，`),
    }).click()
    await page.getByRole('button', { name: '数字 9', exact: true }).click()
  }
  const conflictCell = page.getByRole('button', {
    name: new RegExp(`^第 ${cellsByRow[1]?.row} 行第 ${cellsByRow[1]?.col} 列，玩家数字 9，存在冲突$`),
  })
  await conflictCell.focus()
  await expect(conflictCell).toBeFocused()

  const styles = await page.evaluate(() => {
    const thickLine = document.querySelector<HTMLElement>(
      '.sudoku-cell[data-box-col="0"]:not(:nth-child(9n + 1))',
    )
    const focused = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
    const conflict = document.querySelector<HTMLElement>('.sudoku-cell[data-conflict="true"]')
    if (thickLine === null || focused === null || conflict === null) return null
    const thickStyle = getComputedStyle(thickLine)
    const focusStyle = getComputedStyle(focused)
    const conflictStyle = getComputedStyle(conflict)
    return {
      thickBorderWidth: thickStyle.borderLeftWidth,
      thickBorderStyle: thickStyle.borderLeftStyle,
      thickForcedColorAdjust: thickStyle.forcedColorAdjust,
      focusOutlineStyle: focusStyle.outlineStyle,
      focusOutlineWidth: focusStyle.outlineWidth,
      conflictBoxShadow: conflictStyle.boxShadow,
      conflictForcedColorAdjust: conflictStyle.forcedColorAdjust,
    }
  })

  expect(styles).not.toBeNull()
  expect(styles?.thickBorderStyle).not.toBe('none')
  expect(parseFloat(styles?.thickBorderWidth ?? '0')).toBeGreaterThanOrEqual(2)
  expect(styles?.thickForcedColorAdjust).toBe('none')
  expect(styles?.focusOutlineStyle).not.toBe('none')
  expect(parseFloat(styles?.focusOutlineWidth ?? '0')).toBeGreaterThan(0)
  expect(styles?.conflictBoxShadow).not.toBe('none')
  expect(styles?.conflictForcedColorAdjust).toBe('none')
})

test('数独减少动态效果时过渡接近零', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openSudoku(page)

  const durations = await page.evaluate(() => {
    const elements = [
      document.querySelector<HTMLElement>('.sudoku-cell'),
      document.querySelector<HTMLElement>('.number-pad button'),
    ]
    return elements.map((element) => {
      if (element === null) throw new Error('缺少数独动态效果测试元素')
      const style = getComputedStyle(element)
      return {
        animationDuration: style.animationDuration,
        transitionDuration: style.transitionDuration,
      }
    })
  })
  const seconds = (value: string): number => value.endsWith('ms')
    ? parseFloat(value) / 1000
    : parseFloat(value)

  for (const duration of durations) {
    expect(seconds(duration.animationDuration)).toBeLessThanOrEqual(0.000_01)
    expect(seconds(duration.transitionDuration)).toBeLessThanOrEqual(0.000_01)
  }
})

test('数独确认弹窗隔离背景并在关闭后恢复触发按钮焦点', async ({ page }) => {
  await openSudoku(page)
  const emptyCell = page.getByRole('grid', { name: '九乘九数独棋盘' })
    .getByRole('button', { name: /，空格/ })
    .first()
  await emptyCell.click()
  await page.getByRole('button', { name: '数字 1', exact: true }).click()

  const restartButton = page.getByRole('button', { name: '重新开始' })
  await restartButton.focus()
  await page.keyboard.press('Enter')

  const dialog = page.getByRole('dialog', { name: '重新开始这道题？' })
  await expect(dialog).toBeVisible()
  await expect(page.locator('.game-content')).toHaveAttribute('inert', '')
  await expect(page.locator('.game-content')).toHaveAttribute('aria-hidden', 'true')
  await expect(page.getByRole('button', { name: '取消' })).toBeFocused()

  await page.getByRole('button', { name: '取消' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('.game-content')).not.toHaveAttribute('inert', '')
  await expect(page.locator('.game-content')).not.toHaveAttribute('aria-hidden', 'true')
  await expect(restartButton).toBeFocused()
})
