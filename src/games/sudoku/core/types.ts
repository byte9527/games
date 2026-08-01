export const SUDOKU_SIZE = 9

export const CELL_COUNT = SUDOKU_SIZE * SUDOKU_SIZE

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export type CellValue = Digit | null

export type Difficulty = 'easy' | 'medium' | 'hard'

export type GameStatus = 'playing' | 'completed'

export type CandidateMask = number

export interface CellChange {
  readonly index: number
  readonly beforeValue: CellValue
  readonly afterValue: CellValue
  readonly beforeCandidates: CandidateMask
  readonly afterCandidates: CandidateMask
}

export interface HistoryEntry {
  readonly changes: readonly CellChange[]
}

export interface SudokuGameState {
  readonly puzzleId: string
  readonly difficulty: Difficulty
  readonly givens: readonly CellValue[]
  readonly values: readonly CellValue[]
  readonly candidates: readonly CandidateMask[]
  readonly selectedIndex: number
  readonly noteMode: boolean
  readonly history: readonly HistoryEntry[]
  readonly elapsedMs: number
  readonly status: GameStatus
}
