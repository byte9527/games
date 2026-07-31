import { expect, test, type Page } from '@playwright/test'

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
