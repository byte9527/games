import { createBoardFromString } from '../core/board'
import { CELL_COUNT, SUDOKU_SIZE } from '../core/types'

const BOX_SIZE = 3
const ALL_DIGITS_MASK = (1 << SUDOKU_SIZE) - 1

export interface PuzzleAnalysis {
  readonly solution: string | null
  /** 0 表示无解，1 表示唯一解，2 表示至少有两个解。 */
  readonly solutionCount: number
  /** 搜索实际展开过的多候选节点数量。 */
  readonly branchDecisions: number
}

interface SearchState {
  readonly board: number[]
  readonly rowMasks: number[]
  readonly colMasks: number[]
  readonly boxMasks: number[]
  readonly limit: number
  solutionCount: number
  firstSolution: string | null
  branchDecisions: number
}

const boxOf = (index: number): number => {
  const row = Math.floor(index / SUDOKU_SIZE)
  const col = index % SUDOKU_SIZE
  return Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(col / BOX_SIZE)
}

const digitBit = (digit: number): number => 1 << (digit - 1)

const countBits = (mask: number): number => {
  let remaining = mask
  let count = 0

  while (remaining !== 0) {
    remaining &= remaining - 1
    count += 1
  }

  return count
}

const serializeBoard = (board: readonly number[]): string => board.join('')

const assertSolutionLimit = (limit: number): void => {
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new Error(
      `Sudoku solution limit must be a finite positive integer; received ${String(limit)}`,
    )
  }
}

const search = (state: SearchState): void => {
  if (state.solutionCount >= state.limit) return

  let selectedIndex = -1
  let selectedCandidates = 0
  let minimumCandidateCount = SUDOKU_SIZE + 1

  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (state.board[index] !== 0) continue

    const row = Math.floor(index / SUDOKU_SIZE)
    const col = index % SUDOKU_SIZE
    const box = boxOf(index)
    const candidates =
      ALL_DIGITS_MASK &
      ~(state.rowMasks[row] | state.colMasks[col] | state.boxMasks[box])
    const candidateCount = countBits(candidates)

    if (candidateCount === 0) return
    if (candidateCount >= minimumCandidateCount) continue

    selectedIndex = index
    selectedCandidates = candidates
    minimumCandidateCount = candidateCount
    if (candidateCount === 1) break
  }

  if (selectedIndex === -1) {
    state.solutionCount += 1
    state.firstSolution ??= serializeBoard(state.board)
    return
  }

  const row = Math.floor(selectedIndex / SUDOKU_SIZE)
  const col = selectedIndex % SUDOKU_SIZE
  const box = boxOf(selectedIndex)

  // 只有实际展开两个及以上候选的搜索节点才计为一次分支决策。
  if (minimumCandidateCount > 1) state.branchDecisions += 1

  for (let digit = 1; digit <= SUDOKU_SIZE; digit += 1) {
    const bit = digitBit(digit)
    if ((selectedCandidates & bit) === 0) continue

    state.board[selectedIndex] = digit
    state.rowMasks[row] |= bit
    state.colMasks[col] |= bit
    state.boxMasks[box] |= bit

    search(state)

    state.board[selectedIndex] = 0
    state.rowMasks[row] &= ~bit
    state.colMasks[col] &= ~bit
    state.boxMasks[box] &= ~bit

    if (state.solutionCount >= state.limit) return
  }
}

const createSearchState = (
  serialized: string,
  limit: number,
): SearchState | null => {
  const board = createBoardFromString(serialized).map((value) => value ?? 0)
  const rowMasks = Array.from({ length: SUDOKU_SIZE }, () => 0)
  const colMasks = Array.from({ length: SUDOKU_SIZE }, () => 0)
  const boxMasks = Array.from({ length: SUDOKU_SIZE }, () => 0)

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const digit = board[index]
    if (digit === 0) continue

    const row = Math.floor(index / SUDOKU_SIZE)
    const col = index % SUDOKU_SIZE
    const box = boxOf(index)
    const bit = digitBit(digit)

    if (
      (rowMasks[row] & bit) !== 0 ||
      (colMasks[col] & bit) !== 0 ||
      (boxMasks[box] & bit) !== 0
    ) {
      return null
    }

    rowMasks[row] |= bit
    colMasks[col] |= bit
    boxMasks[box] |= bit
  }

  return {
    board,
    rowMasks,
    colMasks,
    boxMasks,
    limit,
    solutionCount: 0,
    firstSolution: null,
    branchDecisions: 0,
  }
}

const runSearch = (serialized: string, limit: number): SearchState | null => {
  const state = createSearchState(serialized, limit)
  if (state !== null) search(state)
  return state
}

export function solvePuzzle(serialized: string): string | null {
  return runSearch(serialized, 1)?.firstSolution ?? null
}

export function countSolutions(serialized: string, limit: number): number {
  assertSolutionLimit(limit)
  return runSearch(serialized, limit)?.solutionCount ?? 0
}

export function analyzePuzzle(serialized: string): PuzzleAnalysis {
  const state = runSearch(serialized, 2)

  return {
    solution: state?.firstSolution ?? null,
    solutionCount: state?.solutionCount ?? 0,
    branchDecisions: state?.branchDecisions ?? 0,
  }
}
