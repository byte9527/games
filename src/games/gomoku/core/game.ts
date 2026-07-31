import { isInBounds, oppositePlayer, toIndex } from './board'
import { BOARD_SIZE, type GameState, type MoveResult, type Position } from './types'
import { findWinningLines } from './win'

export function createGame(): GameState {
  return {
    board: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null),
    currentPlayer: 'black',
    status: 'playing',
    winner: null,
    winningLines: [],
    history: [],
  }
}

export function placeStone(state: GameState, position: Position): MoveResult {
  if (state.status !== 'playing') return { ok: false, error: 'game-over', state }
  if (!isInBounds(position)) return { ok: false, error: 'out-of-bounds', state }

  const index = toIndex(position)
  if (state.board[index] !== null) return { ok: false, error: 'occupied', state }

  const board = [...state.board]
  board[index] = state.currentPlayer
  const winningLines = findWinningLines(board, position, state.currentPlayer)
  const history = [...state.history, { ...position, player: state.currentPlayer }]

  if (winningLines.length > 0) {
    return {
      ok: true,
      state: {
        ...state,
        board,
        status: 'won',
        winner: state.currentPlayer,
        winningLines,
        history,
      },
    }
  }

  if (board.every((cell) => cell !== null)) {
    return {
      ok: true,
      state: {
        ...state,
        board,
        status: 'draw',
        winner: null,
        winningLines: [],
        history,
      },
    }
  }

  return {
    ok: true,
    state: {
      ...state,
      board,
      currentPlayer: oppositePlayer(state.currentPlayer),
      history,
    },
  }
}
