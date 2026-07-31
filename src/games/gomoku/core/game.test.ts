import { toIndex } from './board'
import { findWinningLines } from './win'
import {
  BOARD_SIZE,
  type Cell,
  type GameState,
  type Move,
  type Player,
  type Position,
} from './types'
import { createGame, placeStone } from './game'

function gameWithStones(
  player: Player,
  positions: readonly Position[],
  currentPlayer: Player = player,
): GameState {
  const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null)
  const history: Move[] = []

  for (const position of positions) {
    board[toIndex(position)] = player
    history.push({ ...position, player })
  }

  return { ...createGame(), board, currentPlayer, history }
}

describe('gomoku game', () => {
  it('creates an empty 15×15 game with black to move', () => {
    const state = createGame()

    expect(state.board).toHaveLength(BOARD_SIZE * BOARD_SIZE)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.currentPlayer).toBe('black')
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.winningLines).toEqual([])
    expect(state.history).toEqual([])
  })

  it('places a stone immutably and changes the current player', () => {
    const state = createGame()
    const originalBoard = state.board
    const originalHistory = state.history

    const result = placeStone(state, { row: 3, col: 4 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('合法落子应当成功')

    expect(result.state).not.toBe(state)
    expect(result.state.board).not.toBe(originalBoard)
    expect(result.state.history).not.toBe(originalHistory)
    expect(result.state.board[3 * BOARD_SIZE + 4]).toBe('black')
    expect(result.state.currentPlayer).toBe('white')
    expect(result.state.history).toEqual([{ row: 3, col: 4, player: 'black' }])
    expect(state.board).toBe(originalBoard)
    expect(state.history).toBe(originalHistory)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.history).toEqual([])
  })

  it.each([
    { row: 0, col: 0 },
    { row: 0, col: BOARD_SIZE - 1 },
    { row: BOARD_SIZE - 1, col: 0 },
    { row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 },
  ])('accepts the corner position $row,$col', (position) => {
    const state = createGame()

    const result = placeStone(state, position)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('棋盘四角都应当允许落子')
    expect(result.state.board[position.row * BOARD_SIZE + position.col]).toBe('black')
  })

  it('preserves both moves and returns the turn to black', () => {
    const initialState = createGame()
    const firstMove = placeStone(initialState, { row: 7, col: 7 })
    if (!firstMove.ok) throw new Error('黑方合法落子应当成功')
    const firstBoard = firstMove.state.board
    const firstHistory = firstMove.state.history

    const secondMove = placeStone(firstMove.state, { row: 7, col: 8 })

    expect(secondMove.ok).toBe(true)
    if (!secondMove.ok) throw new Error('白方合法落子应当成功')
    expect(secondMove.state.board[7 * BOARD_SIZE + 7]).toBe('black')
    expect(secondMove.state.board[7 * BOARD_SIZE + 8]).toBe('white')
    expect(secondMove.state.currentPlayer).toBe('black')
    expect(secondMove.state.history).toEqual([
      { row: 7, col: 7, player: 'black' },
      { row: 7, col: 8, player: 'white' },
    ])
    expect(firstMove.state.board).toBe(firstBoard)
    expect(firstMove.state.history).toBe(firstHistory)
    expect(firstMove.state.board[7 * BOARD_SIZE + 8]).toBeNull()
    expect(firstMove.state.history).toEqual([{ row: 7, col: 7, player: 'black' }])
  })

  it.each([
    { row: -1, col: 0 },
    { row: BOARD_SIZE, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: BOARD_SIZE },
    { row: 1.5, col: 0 },
    { row: 0, col: 1.5 },
  ])('rejects an out-of-bounds position $row,$col', (position) => {
    const state = createGame()

    const result = placeStone(state, position)

    expect(result).toEqual({ ok: false, error: 'out-of-bounds', state })
    expect(result.state).toBe(state)
  })

  it('rejects an occupied position without replacing the state', () => {
    const initialState = createGame()
    const firstMove = placeStone(initialState, { row: 7, col: 7 })
    if (!firstMove.ok) throw new Error('首次合法落子应当成功')

    const result = placeStone(firstMove.state, { row: 7, col: 7 })

    expect(result).toEqual({ ok: false, error: 'occupied', state: firstMove.state })
    expect(result.state).toBe(firstMove.state)
  })

  it('rejects moves after the game is over without replacing the state', () => {
    const state: GameState = {
      ...createGame(),
      status: 'won',
      winner: 'black',
    }

    const result = placeStone(state, { row: 0, col: 0 })

    expect(result).toEqual({ ok: false, error: 'game-over', state })
    expect(result.state).toBe(state)
  })

  it('获胜后保留获胜方回合并拒绝继续落子', () => {
    const winningStones = Array.from({ length: 4 }, (_, col) => ({ row: 7, col: col + 3 }))
    const state = gameWithStones('black', winningStones)

    const winningMove = placeStone(state, { row: 7, col: 7 })

    expect(winningMove.ok).toBe(true)
    if (!winningMove.ok) throw new Error('获胜落子应当成功')
    expect(winningMove.state.status).toBe('won')
    expect(winningMove.state.winner).toBe('black')
    expect(winningMove.state.currentPlayer).toBe('black')
    expect(winningMove.state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
    expect(winningMove.state.history).toHaveLength(5)
    expect(winningMove.state.history.at(-1)).toEqual({ row: 7, col: 7, player: 'black' })
    expect(winningMove.state.winningLines).toEqual([
      Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 3 })),
    ])

    const result = placeStone(winningMove.state, { row: 0, col: 0 })

    expect(result).toEqual({ ok: false, error: 'game-over', state: winningMove.state })
    expect(result.state).toBe(winningMove.state)
  })

  it('隔离获胜线坐标与调用方的可变落子对象', () => {
    const winningStones = Array.from({ length: 4 }, (_, col) => ({ row: 7, col: col + 3 }))
    const state = gameWithStones('black', winningStones)
    const position = { row: 7, col: 7 }

    const result = placeStone(state, position)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('获胜落子应当成功')
    const winningLine = result.state.winningLines[0]
    if (!winningLine) throw new Error('获胜后应当保存获胜线')
    const storedOrigin = winningLine.find(({ row, col }) => row === 7 && col === 7)
    if (!storedOrigin) throw new Error('获胜线应当包含最后落子')

    position.row = 0
    position.col = 0

    expect(storedOrigin).not.toBe(position)
    expect(storedOrigin).toEqual({ row: 7, col: 7 })
    expect(result.state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
    expect(result.state.history).toHaveLength(5)
    expect(result.state.history.at(-1)).toEqual({ row: 7, col: 7, player: 'black' })
    expect(result.state.winningLines).toEqual([
      Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 3 })),
    ])
  })

  it('满盘无五连时判定和棋并保留最后落子方回合', () => {
    const finalPosition = { row: 14, col: 13 }
    const board: Cell[] = []
    const history: Move[] = []

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const position = { row, col }
        if (row === finalPosition.row && col === finalPosition.col) {
          board.push(null)
          continue
        }

        const player = (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
        board.push(player)
        history.push({ ...position, player })
      }
    }

    for (const move of history) {
      expect(findWinningLines(board, move, move.player)).toEqual([])
    }

    const state: GameState = { ...createGame(), board, currentPlayer: 'black', history }
    const result = placeStone(state, finalPosition)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('满盘的最后一步应当成功')
    expect(result.state.status).toBe('draw')
    expect(result.state.winner).toBeNull()
    expect(result.state.winningLines).toEqual([])
    expect(result.state.currentPlayer).toBe('black')
    expect(result.state.board[toIndex(finalPosition)]).toBe('black')
    expect(result.state.history).toHaveLength(BOARD_SIZE * BOARD_SIZE)
    expect(result.state.history.at(-1)).toEqual({ ...finalPosition, player: 'black' })

    const moveAfterDraw = placeStone(result.state, { row: 0, col: 0 })

    expect(moveAfterDraw).toEqual({ ok: false, error: 'game-over', state: result.state })
    expect(moveAfterDraw.state).toBe(result.state)
  })

  it('最后一步同时填满棋盘并获胜时优先判定获胜', () => {
    const finalPosition = { row: 14, col: 13 }
    const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
      const row = Math.floor(index / BOARD_SIZE)
      const col = index % BOARD_SIZE
      return (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
    })
    board[toIndex(finalPosition)] = null
    for (const col of [10, 11, 12, 14]) board[toIndex({ row: 14, col })] = 'black'

    const state: GameState = { ...createGame(), board, currentPlayer: 'black' }
    const result = placeStone(state, finalPosition)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('满盘获胜的最后一步应当成功')
    expect(result.state.status).toBe('won')
    expect(result.state.winner).toBe('black')
    expect(result.state.currentPlayer).toBe('black')
    expect(result.state.winningLines).toEqual([
      Array.from({ length: 6 }, (_, offset) => ({ row: 14, col: offset + 9 })),
    ])
  })
})
