import { createBoardFromString, isSolvedBoard } from '../core/board'
import type { CellValue, Difficulty, Digit } from '../core/types'
import { builtinSudokuPuzzleData } from './data'

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

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
const STABLE_ID_PATTERN = /^(easy|medium|hard)-(\d{3})$/

type RawPuzzleRecord = Readonly<Record<string, unknown>>

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 'easy' || value === 'medium' || value === 'hard'

const assertRecord = (value: unknown, index: number): RawPuzzleRecord => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(
      `Built-in Sudoku puzzle at index ${index} must be an object record`,
    )
  }

  return value as RawPuzzleRecord
}

const readString = (
  record: RawPuzzleRecord,
  field: 'id' | 'givens' | 'solution',
  index: number,
): string => {
  const value = record[field]
  if (typeof value !== 'string') {
    throw new Error(
      `Built-in Sudoku puzzle at index ${index} must have a string ${field}`,
    )
  }

  return value
}

const readDifficulty = (
  record: RawPuzzleRecord,
  index: number,
): Difficulty => {
  const difficulty = record.difficulty
  if (!isDifficulty(difficulty)) {
    throw new Error(
      `Built-in Sudoku puzzle at index ${index} has invalid difficulty ${JSON.stringify(difficulty)}`,
    )
  }

  return difficulty
}

const parseSolution = (serialized: string, id: string): readonly Digit[] => {
  const board = createBoardFromString(serialized)
  if (!isSolvedBoard(board)) {
    throw new Error(
      `Built-in Sudoku puzzle ${id} solution must be a legal completed board`,
    )
  }

  const solution: Digit[] = []
  for (const value of board) {
    if (value === null) {
      throw new Error(
        `Built-in Sudoku puzzle ${id} solution must contain only digits 1 through 9`,
      )
    }
    solution.push(value)
  }

  return Object.freeze(solution)
}

const parseGivens = (
  serialized: string,
  solution: readonly Digit[],
  id: string,
): readonly CellValue[] => {
  const givens = createBoardFromString(serialized)

  for (let index = 0; index < givens.length; index += 1) {
    const given = givens[index]
    if (given !== null && given !== solution[index]) {
      throw new Error(
        `Built-in Sudoku puzzle ${id} given at index ${index} does not match its solution`,
      )
    }
  }

  return Object.freeze([...givens])
}

const parsePuzzle = (value: unknown, index: number): SudokuPuzzle => {
  const record = assertRecord(value, index)
  const id = readString(record, 'id', index)
  const difficulty = readDifficulty(record, index)
  const idMatch = STABLE_ID_PATTERN.exec(id)

  if (
    idMatch === null ||
    idMatch[1] !== difficulty ||
    Number(idMatch[2]) === 0
  ) {
    throw new Error(
      `Built-in Sudoku puzzle at index ${index} has invalid stable id ${JSON.stringify(id)} for difficulty ${difficulty}`,
    )
  }

  const solution = parseSolution(readString(record, 'solution', index), id)
  const givens = parseGivens(
    readString(record, 'givens', index),
    solution,
    id,
  )

  return Object.freeze({ id, difficulty, givens, solution })
}

export const createSudokuPuzzleProvider = (
  records: readonly unknown[],
): SudokuPuzzleProvider => {
  if (records.length === 0) {
    throw new Error('Built-in Sudoku puzzle catalog must not be empty')
  }

  const puzzles = records.map(parsePuzzle)
  const puzzlesById = new Map<string, SudokuPuzzle>()
  const puzzlesByDifficulty = new Map<Difficulty, readonly SudokuPuzzle[]>()
  const seenGivens = new Set<string>()

  for (const puzzle of puzzles) {
    if (puzzlesById.has(puzzle.id)) {
      throw new Error(
        `Built-in Sudoku puzzle id must be unique; received ${puzzle.id}`,
      )
    }

    const serializedGivens = puzzle.givens
      .map((value) => value ?? 0)
      .join('')
    if (seenGivens.has(serializedGivens)) {
      throw new Error(
        `Built-in Sudoku puzzle givens must be unique; duplicate found at ${puzzle.id}`,
      )
    }

    puzzlesById.set(puzzle.id, puzzle)
    seenGivens.add(serializedGivens)
  }

  for (const difficulty of DIFFICULTIES) {
    const matchingPuzzles = puzzles.filter(
      (puzzle) => puzzle.difficulty === difficulty,
    )
    if (matchingPuzzles.length === 0) {
      throw new Error(
        `Built-in Sudoku puzzle catalog must contain at least one ${difficulty} puzzle`,
      )
    }
    puzzlesByDifficulty.set(difficulty, Object.freeze(matchingPuzzles))
  }

  const readonlyPuzzles = Object.freeze(puzzles)
  const nextIndices = new Map<Difficulty, number>(
    DIFFICULTIES.map((difficulty) => [difficulty, 0]),
  )

  return Object.freeze({
    getById(id: string): SudokuPuzzle | null {
      return puzzlesById.get(id) ?? null
    },

    next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle {
      const matchingPuzzles = puzzlesByDifficulty.get(difficulty)
      if (matchingPuzzles === undefined || matchingPuzzles.length === 0) {
        throw new Error(
          `Built-in Sudoku puzzle catalog has no puzzles for difficulty ${difficulty}`,
        )
      }

      const currentIndex = nextIndices.get(difficulty)
      if (currentIndex === undefined) {
        throw new Error(
          `Built-in Sudoku puzzle cursor is missing for difficulty ${difficulty}`,
        )
      }

      let selectedIndex = currentIndex
      if (
        matchingPuzzles.length > 1 &&
        matchingPuzzles[selectedIndex].id === previousId
      ) {
        selectedIndex = (selectedIndex + 1) % matchingPuzzles.length
      }

      const selected = matchingPuzzles[selectedIndex]
      nextIndices.set(difficulty, (selectedIndex + 1) % matchingPuzzles.length)
      return selected
    },

    all(): readonly SudokuPuzzle[] {
      return readonlyPuzzles
    },
  })
}

export const builtinSudokuPuzzleProvider = createSudokuPuzzleProvider(
  builtinSudokuPuzzleData,
)
