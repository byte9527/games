import { replayMoves } from '../core/game'
import { BOARD_SIZE, type Cell, type GameState, type Move, type Player } from '../core/types'

export const STORAGE_VERSION = 1

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isPlayer(value: unknown): value is Player {
  return value === 'black' || value === 'white'
}

function isCell(value: unknown): value is Cell {
  return value === null || isPlayer(value)
}

function isBoard(value: unknown): value is Cell[] {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE * BOARD_SIZE) return false

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    if (!Object.hasOwn(value, index) || !isCell(value[index])) return false
  }

  return true
}

function decodeMove(value: unknown): Move | null {
  if (!isRecord(value)) return null

  const { row, col, player } = value
  if (typeof row !== 'number' || !Number.isInteger(row)) return null
  if (typeof col !== 'number' || !Number.isInteger(col)) return null
  if (!isPlayer(player)) return null

  return { row, col, player }
}

export function encodeStoredGame(state: GameState): { version: 1; state: GameState } {
  return { version: STORAGE_VERSION, state }
}

export function decodeStoredGame(value: unknown): GameState | null {
  if (!isRecord(value) || value.version !== STORAGE_VERSION || !isRecord(value.state)) {
    return null
  }

  const { board, currentPlayer, status, winner, winningLines, history } = value.state
  if (
    !isBoard(board) ||
    !isPlayer(currentPlayer) ||
    status !== 'playing' ||
    winner !== null ||
    !Array.isArray(winningLines) ||
    winningLines.length !== 0 ||
    !Array.isArray(history) ||
    history.length === 0
  ) {
    return null
  }

  const moves: Move[] = []
  for (const value of history) {
    const move = decodeMove(value)
    if (move === null) return null
    moves.push(move)
  }

  const replayed = replayMoves(moves)
  if (replayed === null || replayed.status !== 'playing') return null
  if (replayed.currentPlayer !== currentPlayer) return null
  if (!replayed.board.every((cell, index) => cell === board[index])) return null

  return replayed
}
