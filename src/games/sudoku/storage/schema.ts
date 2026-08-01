import {
  createSudokuGame,
  replaySudokuHistory,
  selectCell,
  toggleNoteMode,
  withElapsedMs,
} from '../core/game'
import {
  CELL_COUNT,
  type CandidateMask,
  type CellChange,
  type CellValue,
  type Difficulty,
  type HistoryEntry,
  type SudokuGameState,
} from '../core/types'
import type { SudokuPuzzleProvider } from '../puzzles/provider'

export const SUDOKU_STORAGE_VERSION = 1

interface StoredSudokuChangeV1 {
  readonly index: number
  readonly beforeValue: CellValue
  readonly afterValue: CellValue
  readonly beforeCandidates: CandidateMask
  readonly afterCandidates: CandidateMask
}

interface StoredSudokuHistoryEntryV1 {
  readonly changes: readonly StoredSudokuChangeV1[]
}

export interface StoredSudokuV1 {
  readonly version: 1
  readonly puzzleId: string
  readonly difficulty: Difficulty
  readonly values: readonly CellValue[]
  readonly candidates: readonly CandidateMask[]
  readonly selectedIndex: number
  readonly noteMode: boolean
  readonly history: readonly StoredSudokuHistoryEntryV1[]
  readonly elapsedMs: number
  readonly savedAt: number
}

const STORED_KEYS = [
  'version',
  'puzzleId',
  'difficulty',
  'values',
  'candidates',
  'selectedIndex',
  'noteMode',
  'history',
  'elapsedMs',
  'savedAt',
] as const
const HISTORY_ENTRY_KEYS = ['changes'] as const
const CHANGE_KEYS = [
  'index',
  'beforeValue',
  'afterValue',
  'beforeCandidates',
  'afterCandidates',
] as const
const MAX_CANDIDATE_MASK = 511

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactKeys(value: object, expected: readonly string[]): boolean {
  const actual = Reflect.ownKeys(value)
  return (
    actual.length === expected.length &&
    expected.every((key) => Object.hasOwn(value, key)) &&
    actual.every((key) => typeof key === 'string' && expected.includes(key))
  )
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

function isCellValue(value: unknown): value is CellValue {
  return (
    value === null ||
    (typeof value === 'number' &&
      Number.isInteger(value) &&
      value >= 1 &&
      value <= 9)
  )
}

function isCandidateMask(value: unknown): value is CandidateMask {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= MAX_CANDIDATE_MASK
  )
}

function isCellIndex(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < CELL_COUNT
  )
}

function isFiniteNonNegativeInteger(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 0
  )
}

function decodeDenseArray<T>(
  value: unknown,
  expectedLength: number | null,
  decodeItem: (item: unknown) => T | null,
): T[] | null {
  if (!Array.isArray(value)) return null

  const length = value.length
  if (expectedLength !== null && length !== expectedLength) return null

  const decoded: T[] = []
  for (let index = 0; index < length; index += 1) {
    if (!Object.hasOwn(value, index)) return null
    const item = decodeItem(value[index])
    if (item === null) return null
    decoded.push(item)
  }
  return decoded
}

function decodeCellValue(value: unknown): CellValue | null | undefined {
  return isCellValue(value) ? value : undefined
}

function decodeCellValues(value: unknown): CellValue[] | null {
  if (!Array.isArray(value) || value.length !== CELL_COUNT) return null

  const decoded: CellValue[] = []
  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!Object.hasOwn(value, index)) return null
    const cell = decodeCellValue(value[index])
    if (cell === undefined) return null
    decoded.push(cell)
  }
  return decoded
}

function decodeCandidateMasks(value: unknown): CandidateMask[] | null {
  return decodeDenseArray(
    value,
    CELL_COUNT,
    (item): CandidateMask | null => (isCandidateMask(item) ? item : null),
  )
}

function decodeChange(value: unknown): CellChange | null {
  if (!isRecord(value) || !hasExactKeys(value, CHANGE_KEYS)) return null

  const index = value.index
  const beforeValue = value.beforeValue
  const afterValue = value.afterValue
  const beforeCandidates = value.beforeCandidates
  const afterCandidates = value.afterCandidates

  if (
    !isCellIndex(index) ||
    !isCellValue(beforeValue) ||
    !isCellValue(afterValue) ||
    !isCandidateMask(beforeCandidates) ||
    !isCandidateMask(afterCandidates) ||
    (beforeValue !== null && beforeCandidates !== 0) ||
    (afterValue !== null && afterCandidates !== 0) ||
    (beforeValue === afterValue && beforeCandidates === afterCandidates)
  ) {
    return null
  }

  return {
    index,
    beforeValue,
    afterValue,
    beforeCandidates,
    afterCandidates,
  }
}

function decodeHistoryEntry(value: unknown): HistoryEntry | null {
  if (!isRecord(value) || !hasExactKeys(value, HISTORY_ENTRY_KEYS)) return null

  const changes = decodeDenseArray(value.changes, null, decodeChange)
  return changes === null || changes.length === 0 ? null : { changes }
}

function decodeHistory(value: unknown): HistoryEntry[] | null {
  return decodeDenseArray(value, null, decodeHistoryEntry)
}

function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  return (
    left.length === right.length &&
    left.every((item, index) => item === right[index])
  )
}

function serializeGivens(givens: readonly CellValue[]): string {
  return givens.map((value) => value ?? 0).join('')
}

function encodeChange(change: CellChange): StoredSudokuChangeV1 {
  return {
    index: change.index,
    beforeValue: change.beforeValue,
    afterValue: change.afterValue,
    beforeCandidates: change.beforeCandidates,
    afterCandidates: change.afterCandidates,
  }
}

function encodeHistoryEntry(entry: HistoryEntry): StoredSudokuHistoryEntryV1 {
  return { changes: Array.from(entry.changes, encodeChange) }
}

export function encodeStoredSudoku(
  game: SudokuGameState,
  savedAt: number,
): StoredSudokuV1 {
  if (!isFiniteNonNegativeInteger(savedAt)) {
    throw new Error('Sudoku savedAt must be a finite non-negative integer')
  }

  // 现有公开 API 会执行完整状态与 history 一致性校验，不在存储层另建平行规则。
  selectCell(game, game.selectedIndex)
  if (game.status !== 'playing') {
    throw new Error('Sudoku active storage requires a playing game')
  }

  return {
    version: SUDOKU_STORAGE_VERSION,
    puzzleId: game.puzzleId,
    difficulty: game.difficulty,
    values: Array.from(game.values),
    candidates: Array.from(game.candidates),
    selectedIndex: game.selectedIndex,
    noteMode: game.noteMode,
    history: Array.from(game.history, encodeHistoryEntry),
    elapsedMs: game.elapsedMs,
    savedAt,
  }
}

export function decodeStoredSudoku(
  value: unknown,
  provider: SudokuPuzzleProvider,
): { readonly game: SudokuGameState; readonly savedAt: number } | null {
  if (!isRecord(value) || !hasExactKeys(value, STORED_KEYS)) return null

  const {
    version,
    puzzleId,
    difficulty,
    selectedIndex,
    noteMode,
    elapsedMs,
    savedAt,
  } = value
  if (
    version !== SUDOKU_STORAGE_VERSION ||
    typeof puzzleId !== 'string' ||
    puzzleId.trim().length === 0 ||
    !isDifficulty(difficulty) ||
    !isCellIndex(selectedIndex) ||
    typeof noteMode !== 'boolean' ||
    !isFiniteNonNegativeInteger(elapsedMs) ||
    !isFiniteNonNegativeInteger(savedAt)
  ) {
    return null
  }

  const values = decodeCellValues(value.values)
  const candidates = decodeCandidateMasks(value.candidates)
  const history = decodeHistory(value.history)
  if (values === null || candidates === null || history === null) return null

  const puzzle = provider.getById(puzzleId)
  if (puzzle === null || puzzle.difficulty !== difficulty) return null

  const initial = createSudokuGame(
    puzzle.id,
    puzzle.difficulty,
    serializeGivens(puzzle.givens),
  )
  const replayed = replaySudokuHistory(initial, history)
  if (
    replayed === null ||
    replayed.status !== 'playing' ||
    !arraysEqual(replayed.values, values) ||
    !arraysEqual(replayed.candidates, candidates)
  ) {
    return null
  }

  let game = selectCell(replayed, selectedIndex)
  if (noteMode) game = toggleNoteMode(game)
  game = withElapsedMs(game, elapsedMs)

  return { game, savedAt }
}
