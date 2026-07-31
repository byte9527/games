import userEvent from '@testing-library/user-event'
import { render, screen, within } from '@testing-library/react'
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

describe('GomokuBoard', () => {
  it('以具名 grid 渲染按行优先排列的 225 个原生按钮', () => {
    render(<GomokuBoard game={createGame()} onPlace={vi.fn()} />)

    const board = screen.getByRole('grid', { name: '十五乘十五五子棋棋盘' })
    const points = within(board).getAllByRole('button')

    expect(points).toHaveLength(225)
    expect(points[0]).toHaveAccessibleName('第 1 行第 1 列，空位')
    expect(points[7 * BOARD_SIZE + 7]).toHaveAccessibleName('第 8 行第 8 列，空位')
    expect(points[224]).toHaveAccessibleName('第 15 行第 15 列，空位')
    expect(points.every((point) => point.tagName === 'BUTTON')).toBe(true)
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
    const whitePoint = screen.getByRole('button', { name: '第 10 行第 11 列，白棋' })

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

    await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
    expect(onPlace).not.toHaveBeenCalled()
  })

  it('允许用 Enter 和 Space 操作进行中的空位按钮', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(<GomokuBoard game={createGame()} onPlace={onPlace} />)

    screen.getByRole('button', { name: '第 2 行第 3 列，空位' }).focus()
    await user.keyboard('{Enter}')
    screen.getByRole('button', { name: '第 5 行第 7 列，空位' }).focus()
    await user.keyboard(' ')

    expect(onPlace.mock.calls).toEqual([[{ row: 1, col: 2 }], [{ row: 4, col: 6 }]])
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
    expect(markers[0]?.closest('button')).toHaveAccessibleName('第 9 行第 10 列，白棋')

    const next = move({ row: 12, col: 13 }, 'black')
    rerender(
      <GomokuBoard
        game={createGame({ board: createBoard([first, last, next]), history: [first, last, next] })}
        onPlace={vi.fn()}
      />,
    )

    markers = container.querySelectorAll('.last-move')
    expect(markers).toHaveLength(1)
    expect(markers[0]?.closest('button')).toHaveAccessibleName('第 13 行第 14 列，黑棋')

    rerender(<GomokuBoard game={createGame()} onPlace={vi.fn()} />)
    expect(container.querySelector('.last-move')).not.toBeInTheDocument()
  })

  it('高亮横向五连且不高亮胜线外棋子', () => {
    const line = positionsInRow(7, 4, 5)
    const winningMoves = line.map((position) => move(position, 'black'))
    const outsideMove = move({ row: 1, col: 1 }, 'white')
    const { container } = render(
      <GomokuBoard
        game={createGame({
          board: createBoard([...winningMoves, outsideMove]),
          status: 'won',
          winner: 'black',
          winningLines: [line],
          history: [...winningMoves, outsideMove],
        })}
        onPlace={vi.fn()}
      />,
    )

    expect(container.querySelectorAll('.stone--winning')).toHaveLength(5)
    expect(
      screen
        .getByRole('button', { name: '第 2 行第 2 列，白棋' })
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
        .getByRole('button', { name: '第 8 行第 8 列，黑棋' })
        .querySelectorAll('.stone.stone--black.stone--winning'),
    ).toHaveLength(1)
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
    expect(status).toHaveTextContent(expectedText)
    expect(status).toHaveAttribute('aria-live', 'polite')
  })

  it.each([
    ['black', '黑方获胜'],
    ['white', '白方获胜'],
  ] as const)('显示 %s 方获胜', (winner, expectedText) => {
    render(<TurnIndicator game={createGame({ status: 'won', winner })} />)

    expect(screen.getByRole('status')).toHaveTextContent(expectedText)
  })

  it('显示和棋', () => {
    render(<TurnIndicator game={createGame({ status: 'draw' })} />)

    expect(screen.getByRole('status')).toHaveTextContent('本局和棋')
  })
})
