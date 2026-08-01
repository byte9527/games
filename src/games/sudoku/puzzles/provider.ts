import type { Difficulty, Digit } from '../core/types'

export interface SudokuPuzzle {
  readonly id: string
  readonly difficulty: Difficulty
  readonly givens: readonly (Digit | null)[]
  readonly solution: readonly Digit[]
}

export interface SudokuPuzzleProvider {
  getById(id: string): SudokuPuzzle | null
  next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle
  all(): readonly SudokuPuzzle[]
}
