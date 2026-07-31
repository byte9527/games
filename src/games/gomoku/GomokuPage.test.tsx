import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { createGame, placeStone, replayMoves } from './core/game'
import { BOARD_SIZE, type GameState, type Move, type Position } from './core/types'
import { type GomokuStoragePort, type LoadResult, type SaveResult } from './storage/storage'
import { GomokuPage } from './GomokuPage'

class FakeStorage implements GomokuStoragePort {
  readonly savedStates: GameState[] = []
  clearCalls = 0

  constructor(
    private readonly loadResult: LoadResult,
    private readonly saveResult: SaveResult = { ok: true },
    private readonly clearResult: SaveResult = { ok: true },
  ) {}

  load(): LoadResult {
    return this.loadResult
  }

  save(state: GameState): SaveResult {
    this.savedStates.push(state)
    return this.saveResult
  }

  clear(): SaveResult {
    this.clearCalls += 1
    return this.clearResult
  }
}

function playMoves(positions: readonly Position[]): GameState {
  let game = createGame()

  for (const position of positions) {
    const result = placeStone(game, position)
    if (!result.ok) throw new Error(`测试准备的合法落子失败：${result.error}`)
    game = result.state
  }

  return game
}

function blackNearWin(): GameState {
  return playMoves([
    { row: 7, col: 3 },
    { row: 0, col: 0 },
    { row: 7, col: 4 },
    { row: 0, col: 1 },
    { row: 7, col: 5 },
    { row: 0, col: 2 },
    { row: 7, col: 6 },
    { row: 1, col: 0 },
  ])
}

function blackWin(): GameState {
  const result = placeStone(blackNearWin(), { row: 7, col: 7 })
  if (!result.ok || result.state.status !== 'won') throw new Error('黑方获胜棋局准备失败')
  return result.state
}

function whiteWin(): GameState {
  return playMoves([
    { row: 0, col: 0 },
    { row: 7, col: 3 },
    { row: 0, col: 2 },
    { row: 7, col: 4 },
    { row: 0, col: 4 },
    { row: 7, col: 5 },
    { row: 1, col: 0 },
    { row: 7, col: 6 },
    { row: 1, col: 2 },
    { row: 7, col: 7 },
  ])
}

function drawGame(): GameState {
  const blackMoves: Move[] = []
  const whiteMoves: Move[] = []

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player = (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
      const currentMove = { row, col, player } satisfies Move
      if (player === 'black') blackMoves.push(currentMove)
      else whiteMoves.push(currentMove)
    }
  }

  const moves: Move[] = []
  for (let index = 0; index < blackMoves.length; index += 1) {
    const blackMove = blackMoves[index]
    if (blackMove === undefined) throw new Error('和棋序列应当包含黑棋落子')
    moves.push(blackMove)

    const whiteMove = whiteMoves[index]
    if (whiteMove !== undefined) moves.push(whiteMove)
  }

  const game = replayMoves(moves)
  if (game === null || game.status !== 'draw') throw new Error('和棋棋局准备失败')
  return game
}

function renderPage(storage: GomokuStoragePort = new FakeStorage({ kind: 'empty' })) {
  return render(<GomokuPage storage={storage} />)
}

function getBoardButtons(): HTMLElement[] {
  return within(screen.getByRole('group', { name: '十五乘十五五子棋棋盘' }))
    .getAllByRole('button')
}

describe('GomokuPage', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('组装页面标题、hash 返回链接、225 点棋盘和黑方回合', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '五子棋' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回小游戏' })).toHaveAttribute('href', '#/')
    expect(getBoardButtons()).toHaveLength(225)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('黑方回合')
  })

  it('未注入存储时通过浏览器存储工厂完成页面 smoke', () => {
    render(<GomokuPage />)

    expect(screen.getByRole('heading', { level: 1, name: '五子棋' })).toBeInTheDocument()
    expect(getBoardButtons()).toHaveLength(225)
  })

  it('空棋局重新开始不弹确认并直接清除存档', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage({ kind: 'empty' })
    renderPage(storage)

    await user.click(screen.getByRole('button', { name: '重新开始' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(storage.clearCalls).toBe(1)
    expect(screen.getByText('黑方回合')).toBeInTheDocument()
  })

  it('非空棋局重新开始可取消，确认弹窗接管焦点并限制前后 Tab', async () => {
    const user = userEvent.setup()
    renderPage(new FakeStorage({ kind: 'loaded', state: playMoves([{ row: 7, col: 7 }]) }))
    const restartButton = screen.getByRole('button', { name: '重新开始' })

    await user.click(restartButton)

    const dialog = screen.getByRole('dialog', { name: '重新开始本局？' })
    const cancelButton = within(dialog).getByRole('button', { name: '取消' })
    const confirmButton = within(dialog).getByRole('button', { name: '确认重新开始' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(cancelButton).toHaveFocus()

    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()
    await user.tab()
    expect(cancelButton).toHaveFocus()

    await user.click(cancelButton)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第 8 行第 8 列，黑棋，最后一步' })).toBeDisabled()
    expect(restartButton).toHaveFocus()
  })

  it('确认弹窗按 Escape 取消并恢复打开前焦点', async () => {
    const user = userEvent.setup()
    renderPage(new FakeStorage({ kind: 'loaded', state: playMoves([{ row: 7, col: 7 }]) }))
    const restartButton = screen.getByRole('button', { name: '重新开始' })

    await user.click(restartButton)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(restartButton).toHaveFocus()
  })

  it('确认重新开始清空棋局、清除存档并关闭弹窗', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage({ kind: 'loaded', state: playMoves([{ row: 7, col: 7 }]) })
    renderPage(storage)

    await user.click(screen.getByRole('button', { name: '重新开始' }))
    await user.click(screen.getByRole('button', { name: '确认重新开始' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(storage.clearCalls).toBe(1)
    expect(screen.getByRole('button', { name: '第 8 行第 8 列，空位' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '悔棋' })).toBeDisabled()
  })

  it('空棋局禁用悔棋，普通悔棋撤销最近一手并恢复回合', async () => {
    const user = userEvent.setup()
    const emptyPage = render(<GomokuPage storage={new FakeStorage({ kind: 'empty' })} />)
    expect(screen.getByRole('button', { name: '悔棋' })).toBeDisabled()

    emptyPage.unmount()
    renderPage(new FakeStorage({
      kind: 'loaded',
      state: playMoves([{ row: 7, col: 7 }, { row: 7, col: 8 }]),
    }))

    await user.click(screen.getByRole('button', { name: '悔棋' }))

    expect(screen.getByText('白方回合')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第 8 行第 9 列，空位' })).toBeEnabled()
  })

  it.each([
    ['黑方获胜', blackWin()],
    ['白方获胜', whiteWin()],
    ['本局和棋', drawGame()],
  ] as const)('%s 时显示结果弹窗和三个操作', (title, game) => {
    renderPage(new FakeStorage({ kind: 'loaded', state: game }))

    const dialog = screen.getByRole('dialog', { name: title })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(within(dialog).getByRole('button', { name: '悔棋一步' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '再来一局' })).toBeInTheDocument()
    expect(within(dialog).getByRole('link', { name: '返回小游戏' })).toHaveAttribute('href', '#/')
  })

  it('键盘 Enter 完成胜利后弹窗接管焦点，悔棋后恢复原棋位', async () => {
    const user = userEvent.setup()
    renderPage(new FakeStorage({ kind: 'loaded', state: blackNearWin() }))
    const winningPoint = screen.getByRole('button', { name: '第 8 行第 8 列，空位' })
    winningPoint.focus()

    await user.keyboard('{Enter}')

    const dialog = screen.getByRole('dialog', { name: '黑方获胜' })
    const undoButton = within(dialog).getByRole('button', { name: '悔棋一步' })
    expect(undoButton).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(dialog).toBeInTheDocument()

    await user.click(undoButton)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('黑方回合')).toBeInTheDocument()
    const restoredPoint = screen.getByRole('button', { name: '第 8 行第 8 列，空位' })
    await waitFor(() => expect(restoredPoint).toHaveFocus())
  })

  it('结果弹窗把前后 Tab 限制在三个操作内', async () => {
    const user = userEvent.setup()
    renderPage(new FakeStorage({ kind: 'loaded', state: blackWin() }))
    const dialog = screen.getByRole('dialog', { name: '黑方获胜' })
    const undoButton = within(dialog).getByRole('button', { name: '悔棋一步' })
    const homeLink = within(dialog).getByRole('link', { name: '返回小游戏' })

    expect(undoButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(homeLink).toHaveFocus()
    await user.tab()
    expect(undoButton).toHaveFocus()
  })

  it('结果弹窗再来一局清空棋局并关闭', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage({ kind: 'loaded', state: whiteWin() })
    renderPage(storage)

    await user.click(screen.getByRole('button', { name: '再来一局' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('黑方回合')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '悔棋' })).toBeDisabled()
    expect(storage.clearCalls).toBe(1)
  })

  it.each([
    [{ kind: 'invalid' }, '旧对局无法恢复，已开始新棋局。'],
    [{ kind: 'unavailable' }, '自动保存不可用，本局仍可继续。'],
  ] as const)('$1 提示可关闭', async (loadResult, message) => {
    const user = userEvent.setup()
    renderPage(new FakeStorage(loadResult))

    const notice = screen.getByText(message).closest('[role="status"]')
    expect(notice).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByText(message)).not.toBeInTheDocument()
  })

  it('保存失败显示提示但不回滚内存棋局', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage({ kind: 'empty' }, { ok: false, reason: 'unavailable' })
    renderPage(storage)

    await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))

    expect(screen.getByRole('button', { name: '第 8 行第 8 列，黑棋，最后一步' })).toBeDisabled()
    expect(screen.getByText('白方回合')).toBeInTheDocument()
    expect(screen.getByText('自动保存不可用，本局仍可继续。')).toBeInTheDocument()
  })

  it('清除失败显示提示但不回滚新棋局', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage(
      { kind: 'loaded', state: playMoves([{ row: 7, col: 7 }]) },
      { ok: true },
      { ok: false, reason: 'unavailable' },
    )
    renderPage(storage)

    await user.click(screen.getByRole('button', { name: '重新开始' }))
    await user.click(screen.getByRole('button', { name: '确认重新开始' }))

    expect(screen.getByText('黑方回合')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '悔棋' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '第 8 行第 8 列，空位' })).toBeEnabled()
    expect(screen.getByText('自动保存不可用，本局仍可继续。')).toBeInTheDocument()
  })

  it('不吞掉存储端口 save 抛出的编程错误', () => {
    const programmingError = new Error('unexpected save failure')
    const reportedErrors: unknown[] = []
    const handleWindowError = (event: ErrorEvent): void => {
      event.preventDefault()
      reportedErrors.push(event.error)
    }
    const storage: GomokuStoragePort = {
      load: () => ({ kind: 'empty' }),
      save: () => {
        throw programmingError
      },
      clear: () => ({ ok: true }),
    }
    renderPage(storage)

    window.addEventListener('error', handleWindowError)
    try {
      fireEvent.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
    } finally {
      window.removeEventListener('error', handleWindowError)
    }

    expect(reportedErrors).toEqual([programmingError])
  })
})
