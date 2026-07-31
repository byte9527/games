import { isInBounds, oppositePlayer, toIndex } from './board'
import { BOARD_SIZE, type GameState, type Move, type MoveResult, type Position } from './types'
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

function positionsEqual(left: Position, right: Position): boolean {
  return left.row === right.row && left.col === right.col
}

function movesEqual(left: Move, right: Move): boolean {
  return left.player === right.player && positionsEqual(left, right)
}

function statesEqual(left: GameState, right: GameState): boolean {
  return (
    left.currentPlayer === right.currentPlayer &&
    left.status === right.status &&
    left.winner === right.winner &&
    left.board.length === right.board.length &&
    left.board.every((cell, index) => cell === right.board[index]) &&
    left.history.length === right.history.length &&
    left.history.every((move, index) => {
      const otherMove = right.history[index]
      return otherMove !== undefined && movesEqual(move, otherMove)
    }) &&
    left.winningLines.length === right.winningLines.length &&
    left.winningLines.every((line, lineIndex) => {
      const otherLine = right.winningLines[lineIndex]
      return (
        otherLine !== undefined &&
        line.length === otherLine.length &&
        line.every((position, positionIndex) => {
          const otherPosition = otherLine[positionIndex]
          return otherPosition !== undefined && positionsEqual(position, otherPosition)
        })
      )
    })
  )
}

export function replayMoves(moves: readonly Move[]): GameState | null {
  let state = createGame()

  for (const move of moves) {
    if (move.player !== state.currentPlayer) return null

    const result = placeStone(state, { row: move.row, col: move.col })
    if (!result.ok) return null
    state = result.state
  }

  return state
}

export function undoLastMove(state: GameState): GameState {
  if (state.history.length === 0) return state

  const replayedState = replayMoves(state.history)
  if (replayedState === null || !statesEqual(replayedState, state)) return state

  const previousState = replayMoves(state.history.slice(0, -1))
  return previousState === null ? state : previousState
}

export function resetGame(): GameState {
  return createGame()
}
