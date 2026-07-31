import userEvent from '@testing-library/user-event'
import { render, screen, waitFor, within } from '@testing-library/react'
import { createGame as createCoreGame, placeStone } from '../core/game'
import { BOARD_SIZE, type Cell, type GameState, type Move, type Position } from '../core/types'
import { GomokuBoard } from './GomokuBoard'
import { TurnIndicator } from './TurnIndicator'

function createBoard(moves: readonly Move[] = []): Cell[] {
  const board = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (): Cell => null)

  for (const move of moves) {
    board[move.row * BOARD_SIZE + move.col] = move.player
  }

  return board
}

function createGame(overrides: Partial<GameState> = {}): GameState {
  return {
    board: createBoard(),
    currentPlayer: 'black',
    status: 'playing',
    winner: null,
    winningLines: [],
    history: [],
    ...overrides,
  }
}

function positionsInRow(row: number, startCol: number, length: number): Position[] {
  return Array.from({ length }, (_, offset) => ({ row, col: startCol + offset }))
}

function positionsInColumn(col: number, startRow: number, length: number): Position[] {
  return Array.from({ length }, (_, offset) => ({ row: startRow + offset, col }))
}

function move(position: Position, player: Move['player']): Move {
  return { ...position, player }
}

function createWinningGame(line: readonly Position[]): GameState {
  let game = createCoreGame()

  for (const [index, blackPosition] of line.entries()) {
    const blackResult = placeStone(game, blackPosition)
    if (!blackResult.ok) throw new Error(`黑棋第 ${index + 1} 手应当合法`)
    game = blackResult.state

    if (index === line.length - 1) continue

    const whiteResult = placeStone(game, { row: 0, col: index })
    if (!whiteResult.ok) throw new Error(`白棋第 ${index + 1} 手应当合法`)
    game = whiteResult.state
  }

  if (game.status !== 'won') throw new Error('合法五连序列应当产生获胜状态')
  return game
}

const winningDirectionCases = [
  { name: '横向 [0,1]', line: positionsInRow(7, 4, 5) },
  { name: '竖向 [1,0]', line: positionsInColumn(7, 4, 5) },
  {
    name: '主斜线 [1,1]',
    line: Array.from({ length: 5 }, (_, offset) => ({ row: 4 + offset, col: 4 + offset })),
  },
  {
    name: '副斜线 [1,-1]',
    line: Array.from({ length: 5 }, (_, offset) => ({ row: 4 + offset, col: 8 - offset })),
  },
] as const

describe('GomokuBoard', () => {
  it('以具名 group 渲染按行优先排列且符合样式契约的 225 个原生按钮', () => {
    render(<GomokuBoard game={createGame()} onPlace={vi.fn()} />)

    const board = screen.getByRole('group', { name: '十五乘十五五子棋棋盘' })
    const points = within(board).getAllByRole('button')

    expect(points).toHaveLength(225)
    expect(points[0]).toHaveAccessibleName('第 1 行第 1 列，空位')
    expect(points[7 * BOARD_SIZE + 7]).toHaveAccessibleName('第 8 行第 8 列，空位')
    expect(points[224]).toHaveAccessibleName('第 15 行第 15 列，空位')
    expect(points.every((point) => point.tagName === 'BUTTON')).toBe(true)
    expect(points.every((point) => point.classList.contains('intersection'))).toBe(true)
    expect(points[0]).toHaveAttribute('data-row', '0')
    expect(points[0]).toHaveAttribute('data-col', '0')
    expect(points[224]).toHaveAttribute('data-row', '14')
    expect(points[224]).toHaveAttribute('data-col', '14')
  })

  it('仅保留一个行优先的空位 Tab 停靠点', async () => {
    const user = userEvent.setup()
    const occupied = [move({ row: 0, col: 0 }, 'black'), move({ row: 0, col: 1 }, 'white')]
    render(
      <>
        <GomokuBoard
          game={createGame({ board: createBoard(occupied), history: occupied })}
          onPlace={vi.fn()}
        />
        <button type="button">棋盘后按钮</button>
      </>,
    )

    const board = screen.getByRole('group', { name: '十五乘十五五子棋棋盘' })
    const points = within(board).getAllByRole('button')
    const firstPlayablePoint = within(board).getByRole('button', {
      name: '第 1 行第 3 列，空位',
    })

    expect(points.filter((point) => point.tabIndex === 0)).toEqual([firstPlayablePoint])

    await user.tab()
    expect(firstPlayablePoint).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '棋盘后按钮' })).toHaveFocus()
  })

  it('点击中心和四角空位时回调对应的零基行列', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(<GomokuBoard game={createGame()} onPlace={onPlace} />)

    for (const name of [
      '第 1 行第 1 列，空位',
      '第 1 行第 15 列，空位',
      '第 8 行第 8 列，空位',
      '第 15 行第 1 列，空位',
      '第 15 行第 15 列，空位',
    ]) {
      await user.click(screen.getByRole('button', { name }))
    }

    expect(onPlace.mock.calls).toEqual([
      [{ row: 0, col: 0 }],
      [{ row: 0, col: 14 }],
      [{ row: 7, col: 7 }],
      [{ row: 14, col: 0 }],
      [{ row: 14, col: 14 }],
    ])
  })

  it('渲染黑白棋并禁用已占用交叉点', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    const moves = [move({ row: 3, col: 4 }, 'black'), move({ row: 9, col: 10 }, 'white')]
    render(
      <GomokuBoard
        game={createGame({ board: createBoard(moves), history: moves })}
        onPlace={onPlace}
      />,
    )

    const blackPoint = screen.getByRole('button', { name: '第 4 行第 5 列，黑棋' })
    const whitePoint = screen.getByRole('button', {
      name: '第 10 行第 11 列，白棋，最后一步',
    })

    expect(blackPoint).toBeDisabled()
    expect(whitePoint).toBeDisabled()
    expect(blackPoint.querySelector('.stone.stone--black')).toBeInTheDocument()
    expect(whitePoint.querySelector('.stone.stone--white')).toBeInTheDocument()

    await user.click(blackPoint)
    await user.click(whitePoint)
    expect(onPlace).not.toHaveBeenCalled()
  })

  it.each(['won', 'draw'] as const)('%s 终局禁用包括空位在内的全部交叉点', async (status) => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(
      <GomokuBoard
        game={createGame({
          status,
          winner: status === 'won' ? 'black' : null,
        })}
        onPlace={onPlace}
      />,
    )

    const points = screen.getAllByRole('button')
    expect(points.every((point) => point.hasAttribute('disabled'))).toBe(true)
    expect(points.every((point) => point.tabIndex === -1)).toBe(true)

    await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
    expect(onPlace).not.toHaveBeenCalled()
  })

  it('通过实际 Tab 和方向键导航后用 Enter 与 Space 激活空位', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(<GomokuBoard game={createGame()} onPlace={onPlace} />)

    await user.tab()
    expect(screen.getByRole('button', { name: '第 1 行第 1 列，空位' })).toHaveFocus()
    await user.keyboard('{Enter}')
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '第 1 行第 2 列，空位' })).toHaveFocus()
    await user.keyboard(' ')

    expect(onPlace.mock.calls).toEqual([[{ row: 0, col: 0 }], [{ row: 0, col: 1 }]])
  })

  it('方向键沿四个方向移动并跳过占用点且不越界循环', async () => {
    const user = userEvent.setup()
    const occupied = [move({ row: 0, col: 1 }, 'black'), move({ row: 1, col: 2 }, 'white')]
    render(
      <GomokuBoard
        game={createGame({ board: createBoard(occupied), history: occupied })}
        onPlace={vi.fn()}
      />,
    )

    const topLeft = screen.getByRole('button', { name: '第 1 行第 1 列，空位' })
    await user.tab()
    expect(topLeft).toHaveFocus()

    await user.keyboard('{ArrowLeft}{ArrowUp}')
    expect(topLeft).toHaveFocus()

    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '第 1 行第 3 列，空位' })).toHaveFocus()
    await user.keyboard('{ArrowDown}')
    expect(screen.getByRole('button', { name: '第 3 行第 3 列，空位' })).toHaveFocus()
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('button', { name: '第 3 行第 2 列，空位' })).toHaveFocus()
    await user.keyboard('{ArrowUp}')
    expect(screen.getByRole('button', { name: '第 2 行第 2 列，空位' })).toHaveFocus()
  })

  it('当前 Tab 停靠点变为占用后恢复到行优先第一个可落子点', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<GomokuBoard game={createGame()} onPlace={vi.fn()} />)

    await user.tab()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByRole('button', { name: '第 1 行第 2 列，空位' })).toHaveFocus()

    const placedMove = move({ row: 0, col: 1 }, 'black')
    rerender(
      <GomokuBoard
        game={createGame({ board: createBoard([placedMove]), history: [placedMove] })}
        onPlace={vi.fn()}
      />,
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: '第 1 行第 1 列，空位' }).tabIndex).toBe(0)
    })
    expect(
      screen.getByRole('button', { name: '第 1 行第 2 列，黑棋，最后一步' }),
    ).toBeDisabled()
  })

  it('仅在 history 最后一手位置渲染不参与可访问名称的标记', () => {
    const first = move({ row: 2, col: 3 }, 'black')
    const last = move({ row: 8, col: 9 }, 'white')
    const { container, rerender } = render(
      <GomokuBoard
        game={createGame({ board: createBoard([first, last]), history: [first, last] })}
        onPlace={vi.fn()}
      />,
    )

    let markers = container.querySelectorAll('.last-move')
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('aria-hidden', 'true')
    expect(markers[0]?.closest('button')).toHaveAccessibleName(
      '第 9 行第 10 列，白棋，最后一步',
    )

    const next = move({ row: 12, col: 13 }, 'black')
    rerender(
      <GomokuBoard
        game={createGame({ board: createBoard([first, last, next]), history: [first, last, next] })}
        onPlace={vi.fn()}
      />,
    )

    markers = container.querySelectorAll('.last-move')
    expect(markers).toHaveLength(1)
    expect(markers[0]?.closest('button')).toHaveAccessibleName(
      '第 13 行第 14 列，黑棋，最后一步',
    )

    rerender(<GomokuBoard game={createGame()} onPlace={vi.fn()} />)
    expect(container.querySelector('.last-move')).not.toBeInTheDocument()
  })

  it.each(winningDirectionCases)('高亮 $name 的完整胜线且不高亮胜线外棋子', ({ line }) => {
    const game = createWinningGame(line)
    const { container } = render(
      <GomokuBoard game={game} onPlace={vi.fn()} />,
    )

    expect(game.winner).toBe('black')
    expect(game.winningLines).toEqual([line])
    expect(container.querySelectorAll('.stone--winning')).toHaveLength(5)

    for (const position of line) {
      const lastMove = game.history.at(-1)
      const lastMoveText = lastMove?.row === position.row && lastMove.col === position.col
        ? '，最后一步'
        : ''
      const stone = screen
        .getByRole('button', {
          name: `第 ${position.row + 1} 行第 ${position.col + 1} 列，黑棋${lastMoveText}，获胜连线`,
        })
        .querySelector('.stone')
      expect(stone).toHaveClass('stone--winning')
      expect(stone).toHaveAttribute('aria-hidden', 'true')
    }

    expect(
      screen
        .getByRole('button', { name: '第 1 行第 1 列，白棋' })
        .querySelector('.stone--winning'),
    ).not.toBeInTheDocument()
  })

  it('高亮六连的全部六颗棋子', () => {
    const line = positionsInRow(5, 3, 6)
    const moves = line.map((position) => move(position, 'white'))
    const { container } = render(
      <GomokuBoard
        game={createGame({
          board: createBoard(moves),
          status: 'won',
          winner: 'white',
          winningLines: [line],
          history: moves,
        })}
        onPlace={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.stone--winning')).toHaveLength(6)
  })

  it('同一步形成两条五连时按唯一坐标高亮九颗棋子', () => {
    const horizontal = positionsInRow(7, 5, 5)
    const vertical = positionsInColumn(7, 5, 5)
    const uniquePositions = new Map<string, Position>()
    for (const position of [...horizontal, ...vertical]) {
      uniquePositions.set(`${position.row}:${position.col}`, position)
    }
    const moves = [...uniquePositions.values()].map((position) => move(position, 'black'))
    const { container } = render(
      <GomokuBoard
        game={createGame({
          board: createBoard(moves),
          status: 'won',
          winner: 'black',
          winningLines: [horizontal, vertical],
          history: moves,
        })}
        onPlace={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.stone--winning')).toHaveLength(9)
    expect(
      screen
        .getByRole('button', { name: '第 8 行第 8 列，黑棋，获胜连线' })
        .querySelectorAll('.stone.stone--black.stone--winning'),
    ).toHaveLength(1)
  })

  it('每次激活都向 onPlace 传入新的坐标对象', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn<(position: Position) => void>()
    render(<GomokuBoard game={createGame()} onPlace={onPlace} />)

    await user.tab()
    await user.keyboard('{Enter}{Enter}')

    const firstPosition = onPlace.mock.calls[0]?.[0]
    const secondPosition = onPlace.mock.calls[1]?.[0]
    expect(firstPosition).toEqual({ row: 0, col: 0 })
    expect(secondPosition).toEqual({ row: 0, col: 0 })
    expect(firstPosition).not.toBe(secondPosition)
  })

  it('渲染与交互不会修改传入状态的引用或内容', async () => {
    const user = userEvent.setup()
    const line = positionsInRow(4, 2, 5)
    const moves = line.map((position) => move(position, 'black'))
    const board = createBoard(moves)
    const game = createGame({ board, history: moves, winningLines: [line] })
    const boardReference = game.board
    const historyReference = game.history
    const winningLinesReference = game.winningLines
    const firstLineReference = game.winningLines[0]
    const firstPositionReference = firstLineReference?.[0]
    const contentBefore = JSON.stringify(game)

    render(<GomokuBoard game={game} onPlace={vi.fn()} />)
    await user.click(screen.getByRole('button', { name: '第 15 行第 15 列，空位' }))

    expect(game.board).toBe(boardReference)
    expect(game.history).toBe(historyReference)
    expect(game.winningLines).toBe(winningLinesReference)
    expect(game.winningLines[0]).toBe(firstLineReference)
    expect(game.winningLines[0]?.[0]).toBe(firstPositionReference)
    expect(JSON.stringify(game)).toBe(contentBefore)
  })
})

describe('TurnIndicator', () => {
  it.each([
    ['black', '黑方回合'],
    ['white', '白方回合'],
  ] as const)('显示 %s 方进行中的回合', (currentPlayer, expectedText) => {
    render(<TurnIndicator game={createGame({ currentPlayer })} />)

    const status = screen.getByRole('status')
    expect(status.textContent).toBe(expectedText)
    expect(status).toHaveAttribute('aria-live', 'polite')
    expect(status).toHaveClass('turn-indicator')
  })

  it.each([
    ['black', '黑方获胜'],
    ['white', '白方获胜'],
  ] as const)('显示 %s 方获胜', (winner, expectedText) => {
    render(<TurnIndicator game={createGame({ status: 'won', winner })} />)

    expect(screen.getByRole('status').textContent).toBe(expectedText)
  })

  it('显示和棋', () => {
    render(<TurnIndicator game={createGame({ status: 'draw' })} />)

    expect(screen.getByRole('status').textContent).toBe('本局和棋')
  })

  it('获胜状态缺少 winner 时显示明确异常', () => {
    render(<TurnIndicator game={createGame({ status: 'won', winner: null })} />)

    expect(screen.getByRole('status').textContent).toBe('棋局状态异常')
  })
})
