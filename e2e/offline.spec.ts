import { expect, test, type Page } from '@playwright/test'

interface SudokuCellRef {
  readonly row: number
  readonly col: number
}

function sudokuCell(page: Page, cell: SudokuCellRef) {
  return page.getByRole('button', {
    name: new RegExp(`^第 ${cell.row} 行第 ${cell.col} 列，`),
  })
}

async function sudokuEmptyCells(page: Page, count: number): Promise<SudokuCellRef[]> {
  const labels = await page.getByRole('grid', { name: '九乘九数独棋盘' })
    .getByRole('button')
    .evaluateAll((buttons) => buttons
      .map((button) => button.getAttribute('aria-label'))
      .filter((label): label is string => label?.includes('，空格') === true))
  const cells = labels.slice(0, count).map((label) => {
    const match = /^第 (\d+) 行第 (\d+) 列，空格/.exec(label)
    if (match === null) throw new Error(`无法解析数独空格名称：${label}`)
    return { row: Number(match[1]), col: Number(match[2]) }
  })
  if (cells.length !== count) throw new Error(`数独棋盘没有 ${count} 个可用空格`)
  return cells
}

test('应用缓存后可离线重新打开五子棋', async ({ context, page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-webkit',
    'Playwright WebKit 在 Service Worker 控制页面离线 reload 时报告内部错误',
  )

  const errors: string[] = []
  const httpRequests: string[] = []
  const mediaRequests: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') httpRequests.push(url.href)
    if (request.resourceType() === 'media') mediaRequests.push(url.href)
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

    await board.getByRole('button', { name: '第 8 行第 8 列，空位' }).click()
    await expect(board.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeVisible()
    await expect(page.getByRole('status')).toHaveText('白方回合')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveText('音乐开')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await expect(toggle).toHaveText('音乐关')

    const appOrigin = new URL(page.url()).origin
    const externalRequests = httpRequests.filter(
      (requestUrl) => new URL(requestUrl).origin !== appOrigin,
    )
    expect(errors).toEqual([])
    expect(externalRequests).toEqual([])
    expect(mediaRequests).toEqual([])
  } finally {
    await context.setOffline(false)
  }
})

test('数独存档可在离线重载后恢复并继续输入与撤销', async ({ context, page }, testInfo) => {
  test.skip(
    testInfo.project.name === 'mobile-webkit',
    'Playwright WebKit 在 Service Worker 控制页面离线 reload 时报告内部错误',
  )

  const errors: string[] = []
  const httpRequests: string[] = []
  const mediaRequests: string[] = []

  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  context.on('request', (request) => {
    const url = new URL(request.url())
    if (url.protocol === 'http:' || url.protocol === 'https:') httpRequests.push(url.href)
    if (request.resourceType() === 'media') mediaRequests.push(url.href)
  })

  try {
    await page.goto('/#/games/sudoku')
    await page.evaluate(() => navigator.serviceWorker.ready)
    const [formalCell, savedCandidateCell, offlineCandidateCell] = await sudokuEmptyCells(page, 3)

    await sudokuCell(page, formalCell).click()
    await page.getByRole('button', { name: '数字 1', exact: true }).click()
    await page.getByRole('button', { name: /候选模式/ }).click()
    await sudokuCell(page, savedCandidateCell).click()
    await page.getByRole('button', { name: '数字 2', exact: true }).click()

    await page.reload()
    expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
    await expect(sudokuCell(page, formalCell)).toHaveAccessibleName(/玩家数字 1/)
    await expect(sudokuCell(page, savedCandidateCell)).toHaveAccessibleName(/候选数 2/)

    await context.setOffline(true)
    await page.reload()

    await expect(page.getByRole('heading', { name: '数独' })).toBeVisible()
    const board = page.getByRole('grid', { name: '九乘九数独棋盘' })
    await expect(board).toBeVisible()
    await expect(board.getByRole('button')).toHaveCount(81)
    await expect(sudokuCell(page, formalCell)).toHaveAccessibleName(/玩家数字 1/)
    await expect(sudokuCell(page, savedCandidateCell)).toHaveAccessibleName(/候选数 2/)

    const numberPad = page.getByRole('group', { name: '数独数字键盘' })
    await expect(numberPad).toBeVisible()
    await expect(numberPad.getByRole('button')).toHaveCount(11)
    const toggle = page.getByRole('button', { name: '音乐' })
    await expect(toggle).toBeVisible()
    await expect(toggle).toBeEnabled()

    await sudokuCell(page, offlineCandidateCell).click()
    await page.getByRole('button', { name: '数字 3', exact: true }).click()
    await expect(sudokuCell(page, offlineCandidateCell)).toHaveAccessibleName(/候选数 3/)
    await page.getByRole('button', { name: '撤销' }).click()
    await expect(sudokuCell(page, offlineCandidateCell)).toHaveAccessibleName(/，空格$/)

    const appOrigin = new URL(page.url()).origin
    const externalRequests = httpRequests.filter(
      (requestUrl) => new URL(requestUrl).origin !== appOrigin,
    )
    expect(errors).toEqual([])
    expect(externalRequests).toEqual([])
    expect(mediaRequests).toEqual([])
  } finally {
    await context.setOffline(false)
  }
})
