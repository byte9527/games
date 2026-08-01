import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'

interface CellRef {
  readonly row: number
  readonly col: number
}

interface RuntimeSignals {
  readonly errors: string[]
  readonly httpRequests: string[]
  readonly mediaRequests: string[]
}

const runtimeSignalsByPage = new WeakMap<Page, RuntimeSignals>()

function trackRuntimeSignals(context: BrowserContext, page: Page): RuntimeSignals {
  const signals: RuntimeSignals = { errors: [], httpRequests: [], mediaRequests: [] }

  page.on('pageerror', (error) => signals.errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') signals.errors.push(message.text())
  })
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') {
      signals.httpRequests.push(url.href)
    }
    if (request.resourceType() === 'media') signals.mediaRequests.push(url.href)
  })

  return signals
}

function sudokuBoard(page: Page): Locator {
  return page.getByRole('grid', { name: '九乘九数独棋盘' })
}

function cellAt(page: Page, { row, col }: CellRef): Locator {
  return page.getByRole('button', {
    name: new RegExp(`^第 ${row} 行第 ${col} 列，`),
  })
}

async function readPuzzleId(page: Page): Promise<string> {
  const board = sudokuBoard(page)
  await expect(board).toHaveAttribute('data-puzzle-id', /^(easy|medium|hard)-\d{3}$/)
  const puzzleId = await board.getAttribute('data-puzzle-id')
  if (puzzleId === null) throw new Error('数独棋盘缺少 data-puzzle-id')
  return puzzleId
}

async function readEmptyCells(page: Page, count: number): Promise<CellRef[]> {
  const labels = await sudokuBoard(page).getByRole('button').evaluateAll(
    (buttons) => buttons
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label?.includes('，空格') === true),
  )
  const cells = labels.slice(0, count).map((label) => {
    const match = /^第 (\d+) 行第 (\d+) 列，空格/.exec(label)
    if (match === null) throw new Error(`无法解析数独空格名称：${label}`)
    return { row: Number(match[1]), col: Number(match[2]) }
  })
  if (cells.length !== count) throw new Error(`数独棋盘没有 ${count} 个可用空格`)
  return cells
}

async function openSudokuFromCatalog(page: Page): Promise<void> {
  await page.goto('/#/')
  await page.getByRole('link', { name: /数独/ }).click()
  await expect(page).toHaveURL(/#\/games\/sudoku$/)
  await expect(page.getByRole('heading', { name: '数独' })).toBeVisible()
}

async function openSudoku(page: Page): Promise<void> {
  await page.goto('/#/games/sudoku')
  await expect(page.getByRole('heading', { name: '数独' })).toBeVisible()
}

function expectNoExternalRuntimeActivity(page: Page, signals: RuntimeSignals): void {
  const appOrigin = new URL(page.url()).origin
  const externalRequests = signals.httpRequests.filter(
    (requestUrl) => new URL(requestUrl).origin !== appOrigin,
  )
  expect(signals.errors).toEqual([])
  expect(externalRequests).toEqual([])
  expect(signals.mediaRequests).toEqual([])
}

test.beforeEach(async ({ context, page }) => {
  runtimeSignalsByPage.set(page, trackRuntimeSignals(context, page))
})

test.afterEach(async ({ page }) => {
  const signals = runtimeSignalsByPage.get(page)
  if (signals === undefined) throw new Error('数独 E2E 缺少运行时信号追踪')
  expectNoExternalRuntimeActivity(page, signals)
})

test('从合集进入后输入正式数字与候选，撤销并刷新恢复存档', async ({ page }) => {
  await openSudokuFromCatalog(page)

  await page.getByRole('button', { name: '中等' }).click()
  const puzzleId = await readPuzzleId(page)
  const [formalCell, savedCandidateCell, undoneCandidateCell] = await readEmptyCells(page, 3)

  await cellAt(page, formalCell).click()
  await page.getByRole('button', { name: '数字 1', exact: true }).click()
  await expect(cellAt(page, formalCell)).toHaveAccessibleName(/玩家数字 1/)

  const noteMode = page.getByRole('button', { name: /候选模式/ })
  await noteMode.click()
  await expect(noteMode).toHaveAttribute('aria-pressed', 'true')
  await cellAt(page, savedCandidateCell).click()
  await page.getByRole('button', { name: '数字 2', exact: true }).click()
  await expect(cellAt(page, savedCandidateCell)).toHaveAccessibleName(
    `第 ${savedCandidateCell.row} 行第 ${savedCandidateCell.col} 列，空格，候选数 2`,
  )

  await cellAt(page, undoneCandidateCell).click()
  await page.getByRole('button', { name: '数字 3', exact: true }).click()
  await expect(cellAt(page, undoneCandidateCell)).toHaveAccessibleName(/候选数 3/)
  await page.getByRole('button', { name: '撤销' }).click()
  await expect(cellAt(page, undoneCandidateCell)).toHaveAccessibleName(
    `第 ${undoneCandidateCell.row} 行第 ${undoneCandidateCell.col} 列，空格`,
  )

  await expect(page.getByRole('button', { name: '中等' })).toHaveAttribute('aria-pressed', 'true')
  await page.reload()

  expect(await readPuzzleId(page)).toBe(puzzleId)
  await expect(page.getByRole('button', { name: '中等' })).toHaveAttribute('aria-pressed', 'true')
  await expect(cellAt(page, formalCell)).toHaveAccessibleName(/玩家数字 1/)
  await expect(cellAt(page, savedCandidateCell)).toHaveAccessibleName(/候选数 2/)
  await expect(noteMode).toHaveAttribute('aria-pressed', 'true')
})

test('重新开始取消保留当前题，确认后清空并保持同一题目', async ({ page }) => {
  await openSudoku(page)
  const puzzleId = await readPuzzleId(page)
  const [formalCell] = await readEmptyCells(page, 1)

  await cellAt(page, formalCell).click()
  await page.getByRole('button', { name: '数字 4', exact: true }).click()
  await page.getByRole('button', { name: '重新开始' }).click()
  await expect(page.getByRole('dialog', { name: '重新开始这道题？' })).toBeVisible()
  await page.getByRole('button', { name: '取消' }).click()
  await expect(cellAt(page, formalCell)).toHaveAccessibleName(/玩家数字 4/)
  expect(await readPuzzleId(page)).toBe(puzzleId)

  await page.getByRole('button', { name: '重新开始' }).click()
  await page.getByRole('button', { name: '确认重新开始' }).click()
  await expect(page.getByRole('dialog', { name: '重新开始这道题？' })).toBeHidden()
  await expect(sudokuBoard(page).getByRole('button', { name: /玩家数字|候选数/ })).toHaveCount(0)
  expect(await readPuzzleId(page)).toBe(puzzleId)

  await page.reload()
  expect(await readPuzzleId(page)).toBe(puzzleId)
  await expect(sudokuBoard(page).getByRole('button', { name: /玩家数字|候选数/ })).toHaveCount(0)
})

test('切换难度和换题不会连续重复题目', async ({ page }) => {
  await openSudoku(page)
  const initialEasyId = await readPuzzleId(page)

  await page.getByRole('button', { name: '中等' }).click()
  const firstMediumId = await readPuzzleId(page)
  expect(firstMediumId).not.toBe(initialEasyId)
  await expect(page.getByRole('button', { name: '中等' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '简单' }).click()
  const nextEasyId = await readPuzzleId(page)
  expect(nextEasyId).not.toBe(initialEasyId)
  await expect(page.getByRole('button', { name: '简单' })).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('button', { name: '换一题' }).click()
  const replacedEasyId = await readPuzzleId(page)
  expect(replacedEasyId).not.toBe(nextEasyId)

  await page.getByRole('button', { name: '中等' }).click()
  expect(await readPuzzleId(page)).not.toBe(firstMediumId)
})

test('键盘支持方向、数字、候选、擦除和两种撤销快捷键', async ({ page }) => {
  await openSudoku(page)
  const emptyCells = await readEmptyCells(page, 4)
  const directionSource = await sudokuBoard(page).getByRole('button').evaluateAll((buttons) => {
    for (const button of buttons) {
      const label = button.getAttribute('aria-label') ?? ''
      const match = /^第 (\d+) 行第 (\d+) 列，/.exec(label)
      if (match === null) continue
      const row = Number(match[1])
      const col = Number(match[2])
      if (row > 1 && row < 9 && col > 1 && col < 9) return { row, col }
    }
    return null
  })
  if (directionSource === null) throw new Error('没有可用于完整方向键测试的棋盘格')

  await cellAt(page, directionSource).focus()
  await page.keyboard.press('ArrowRight')
  await expect(cellAt(page, { row: directionSource.row, col: directionSource.col + 1 })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(cellAt(page, {
    row: directionSource.row + 1,
    col: directionSource.col + 1,
  })).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(cellAt(page, { row: directionSource.row + 1, col: directionSource.col })).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(cellAt(page, directionSource)).toBeFocused()
  await page.keyboard.press('End')
  await expect(cellAt(page, { row: directionSource.row, col: 9 })).toBeFocused()
  await page.keyboard.press('Home')
  await expect(cellAt(page, { row: directionSource.row, col: 1 })).toBeFocused()

  const formalCell = emptyCells[1]
  const candidateCell = emptyCells[2]
  if (formalCell === undefined || candidateCell === undefined) {
    throw new Error('数独棋盘空格不足')
  }

  await cellAt(page, formalCell).focus()
  await page.keyboard.press('4')
  await expect(cellAt(page, formalCell)).toHaveAccessibleName(/玩家数字 4/)

  await page.keyboard.press('N')
  await expect(page.getByRole('button', { name: /候选模式/ })).toHaveAttribute('aria-pressed', 'true')
  await cellAt(page, candidateCell).focus()
  await page.keyboard.press('5')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/候选数 5/)
  await page.keyboard.press('Delete')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/，空格$/)

  await page.keyboard.press('6')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/候选数 6/)
  await page.keyboard.press('Control+z')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/，空格$/)

  await page.keyboard.press('6')
  await page.keyboard.press('Meta+z')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/，空格$/)

  await page.keyboard.press('N')
  await page.keyboard.press('7')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/玩家数字 7/)
  await page.keyboard.press('Backspace')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/，空格$/)
  await page.keyboard.press('8')
  await page.keyboard.press('Delete')
  await expect(cellAt(page, candidateCell)).toHaveAccessibleName(/，空格$/)
})
