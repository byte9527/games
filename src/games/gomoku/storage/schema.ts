import { replayMoves } from '../core/game'
import {
  BOARD_SIZE,
  type Cell,
  type GameState,
  type GameStatus,
  type Move,
  type Player,
  type Position,
} from '../core/types'

export const STORAGE_VERSION = 1

interface StoredPositionV1 {
  readonly row: number
  readonly col: number
}

interface StoredMoveV1 extends StoredPositionV1 {
  readonly player: Player
}

interface StoredGameStateV1 {
  readonly board: readonly Cell[]
  readonly currentPlayer: Player
  readonly status: GameStatus
  readonly winner: Player | null
  readonly winningLines: readonly (readonly StoredPositionV1[])[]
  readonly history: readonly StoredMoveV1[]
}

export interface StoredGameV1 {
  readonly version: 1
  readonly state: StoredGameStateV1
}

const STORED_GAME_KEYS = ['version', 'state'] as const
const GAME_STATE_KEYS = [
  'board',
  'currentPlayer',
  'status',
  'winner',
  'winningLines',
  'history',
] as const
const MOVE_KEYS = ['row', 'col', 'player'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasOwn(value: object, key: PropertyKey): boolean {
  return Object.hasOwn(value, key)
}

function hasRequiredKeys(value: object, keys: readonly PropertyKey[]): boolean {
  for (const key of keys) {
    if (!hasOwn(value, key)) return false
  }

  return true
}

function isPlayer(value: unknown): value is Player {
  return value === 'black' || value === 'white'
}

function isCell(value: unknown): value is Cell {
  return value === null || isPlayer(value)
}

function decodeBoard(value: unknown): Cell[] | null {
  if (!Array.isArray(value) || value.length !== BOARD_SIZE * BOARD_SIZE) return null

  const board: Cell[] = []

  for (let index = 0; index < BOARD_SIZE * BOARD_SIZE; index += 1) {
    if (!hasOwn(value, index)) return null
    const cell = value[index]
    if (!isCell(cell)) return null
    board.push(cell)
  }

  return board
}

function decodeMove(value: unknown): Move | null {
  if (!isRecord(value) || !hasRequiredKeys(value, MOVE_KEYS)) return null

  const { row, col, player } = value
  if (typeof row !== 'number' || !Number.isInteger(row)) return null
  if (typeof col !== 'number' || !Number.isInteger(col)) return null
  if (!isPlayer(player)) return null

  return { row, col, player }
}

function encodePosition(position: Position): StoredPositionV1 {
  return { row: position.row, col: position.col }
}

function encodeMove(move: Move): StoredMoveV1 {
  return { row: move.row, col: move.col, player: move.player }
}

export function encodeStoredGame(state: GameState): StoredGameV1 {
  return {
    version: STORAGE_VERSION,
    state: {
      board: Array.from(state.board, (cell) => cell),
      currentPlayer: state.currentPlayer,
      status: state.status,
      winner: state.winner,
      winningLines: Array.from(state.winningLines, (line) =>
        Array.from(line, encodePosition),
      ),
      history: Array.from(state.history, encodeMove),
    },
  }
}

export function decodeStoredGame(value: unknown): GameState | null {
  if (
    !isRecord(value) ||
    !hasRequiredKeys(value, STORED_GAME_KEYS) ||
    value.version !== STORAGE_VERSION
  ) {
    return null
  }

  const candidate = value.state
  if (!isRecord(candidate) || !hasRequiredKeys(candidate, GAME_STATE_KEYS)) return null

  const {
    board: boardValue,
    currentPlayer,
    status,
    winner,
    winningLines,
    history,
  } = candidate
  const board = decodeBoard(boardValue)
  if (
    board === null ||
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
  for (let index = 0; index < history.length; index += 1) {
    if (!hasOwn(history, index)) return null
    const move = decodeMove(history[index])
    if (move === null) return null
    moves.push(move)
  }

  const replayed = replayMoves(moves)
  if (replayed === null || replayed.status !== 'playing') return null
  if (replayed.currentPlayer !== currentPlayer) return null
  if (!replayed.board.every((cell, index) => cell === board[index])) return null

  return replayed
}
