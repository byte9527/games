import type { Difficulty } from '../core/types'
import { analyzePuzzle, countSolutions } from './solver'

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']
const DEFAULT_PUZZLES_PER_DIFFICULTY = 20
const MAXIMUM_SEEDS_PER_DIFFICULTY = 10_000
const BASE_SOLUTION =
  '123456789456789123789123456234567891567891234891234567345678912678912345912345678'

const difficultySeedBases: Readonly<Record<Difficulty, number>> = {
  easy: 0x1357_9bdf,
  medium: 0x2468_ace0,
  hard: 0xfdb9_7531,
}

export const generationRules = {
  easy: { clues: 40, minimumBranches: 0, maximumBranches: 1 },
  medium: { clues: 34, minimumBranches: 2, maximumBranches: 8 },
  hard: {
    clues: 28,
    minimumBranches: 9,
    maximumBranches: Number.POSITIVE_INFINITY,
  },
} as const

export interface GeneratedSudokuPuzzle {
  readonly id: string
  readonly difficulty: Difficulty
  readonly givens: string
  readonly solution: string
}

export interface DifficultyGenerationStatistics {
  readonly difficulty: Difficulty
  readonly attemptedSeeds: number
  readonly acceptedPuzzles: number
}

export interface GeneratedSudokuCatalog {
  readonly puzzles: readonly GeneratedSudokuPuzzle[]
  readonly statistics: readonly DifficultyGenerationStatistics[]
}

export interface SudokuGenerationOptions {
  readonly puzzlesPerDifficulty?: number
  readonly maximumSeedsPerDifficulty?: number
}

interface GenerationRule {
  readonly clues: number
  readonly minimumBranches: number
  readonly maximumBranches: number
}

type RandomSource = () => number

const assertIntegerInRange = (
  name: string,
  value: number,
  minimum: number,
  maximum: number,
): void => {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(
      `${name} must be an integer between ${minimum} and ${maximum}; received ${String(value)}`,
    )
  }
}

const createRandom = (seed: number): RandomSource => {
  let state = (seed ^ 0xa5a5_5a5a) >>> 0

  return () => {
    state = (state + 0x6d2b_79f5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 0x1_0000_0000
  }
}

const shuffled = <T>(values: readonly T[], random: RandomSource): T[] => {
  const result = [...values]

  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = result[index]
    result[index] = result[swapIndex]
    result[swapIndex] = current
  }

  return result
}

const shuffledGroups = (random: RandomSource): number[] => {
  const groupOrder = shuffled([0, 1, 2], random)
  const result: number[] = []

  for (const group of groupOrder) {
    for (const offset of shuffled([0, 1, 2], random)) {
      result.push(group * 3 + offset)
    }
  }

  return result
}

const createTransformedSolution = (random: RandomSource): string => {
  const digitOrder = shuffled(
    ['1', '2', '3', '4', '5', '6', '7', '8', '9'],
    random,
  )
  const rowOrder = shuffledGroups(random)
  const columnOrder = shuffledGroups(random)
  let solution = ''

  for (const row of rowOrder) {
    for (const column of columnOrder) {
      const baseDigit = Number(BASE_SOLUTION[row * 9 + column])
      solution += digitOrder[baseDigit - 1]
    }
  }

  return solution
}

const removeClues = (
  solution: string,
  targetClues: number,
  random: RandomSource,
): string | null => {
  const cells = [...solution]
  const deletionOrder = shuffled(
    Array.from({ length: solution.length }, (_, index) => index),
    random,
  )
  let clues = solution.length

  for (const index of deletionOrder) {
    if (clues === targetClues) break

    const digit = cells[index]
    cells[index] = '0'
    const candidate = cells.join('')

    if (countSolutions(candidate, 2) === 1) clues -= 1
    else cells[index] = digit
  }

  return clues === targetClues ? cells.join('') : null
}

const createCandidate = (
  difficulty: Difficulty,
  seed: number,
  rule: GenerationRule,
): Omit<GeneratedSudokuPuzzle, 'id'> | null => {
  const random = createRandom(seed)
  const solution = createTransformedSolution(random)
  const givens = removeClues(solution, rule.clues, random)
  if (givens === null) return null

  const analysis = analyzePuzzle(givens)
  if (
    analysis.solutionCount !== 1 ||
    analysis.solution !== solution ||
    analysis.branchDecisions < rule.minimumBranches ||
    analysis.branchDecisions > rule.maximumBranches
  ) {
    return null
  }

  return { difficulty, givens, solution }
}

const formatId = (difficulty: Difficulty, index: number): string =>
  `${difficulty}-${String(index).padStart(3, '0')}`

export function generateSudokuPuzzleCatalog(
  options: SudokuGenerationOptions = {},
): GeneratedSudokuCatalog {
  const puzzlesPerDifficulty =
    options.puzzlesPerDifficulty ?? DEFAULT_PUZZLES_PER_DIFFICULTY
  const maximumSeedsPerDifficulty =
    options.maximumSeedsPerDifficulty ?? MAXIMUM_SEEDS_PER_DIFFICULTY

  assertIntegerInRange(
    'puzzlesPerDifficulty',
    puzzlesPerDifficulty,
    1,
    DEFAULT_PUZZLES_PER_DIFFICULTY,
  )
  assertIntegerInRange(
    'maximumSeedsPerDifficulty',
    maximumSeedsPerDifficulty,
    1,
    MAXIMUM_SEEDS_PER_DIFFICULTY,
  )

  const puzzles: GeneratedSudokuPuzzle[] = []
  const statistics: DifficultyGenerationStatistics[] = []
  const seenGivens = new Set<string>()

  for (const difficulty of DIFFICULTIES) {
    const rule = generationRules[difficulty]
    let attemptedSeeds = 0
    let acceptedPuzzles = 0

    while (
      acceptedPuzzles < puzzlesPerDifficulty &&
      attemptedSeeds < maximumSeedsPerDifficulty
    ) {
      const seed = (difficultySeedBases[difficulty] + attemptedSeeds) >>> 0
      attemptedSeeds += 1
      const candidate = createCandidate(difficulty, seed, rule)

      if (candidate === null || seenGivens.has(candidate.givens)) continue

      acceptedPuzzles += 1
      seenGivens.add(candidate.givens)
      puzzles.push({
        id: formatId(difficulty, acceptedPuzzles),
        ...candidate,
      })
    }

    if (acceptedPuzzles !== puzzlesPerDifficulty) {
      throw new Error(
        `Unable to generate ${puzzlesPerDifficulty} ${difficulty} Sudoku puzzles after ${attemptedSeeds} deterministic seeds; fixed generation rules were not relaxed`,
      )
    }

    statistics.push({ difficulty, attemptedSeeds, acceptedPuzzles })
  }

  return { puzzles, statistics }
}
