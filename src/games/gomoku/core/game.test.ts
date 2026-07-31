import { BOARD_SIZE, type GameState } from './types'
import { createGame, placeStone } from './game'

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
})
