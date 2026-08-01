import {
  assertCellIndex,
  conflictIndices,
  createBoardFromString,
  isSolvedBoard,
  peerIndices,
} from './board'
import {
  CELL_COUNT,
  SUDOKU_SIZE,
  type CandidateMask,
  type CellChange,
  type CellValue,
  type Difficulty,
  type Digit,
  type GameStatus,
  type HistoryEntry,
  type SudokuGameState,
} from './types'

export type MoveDirection =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'row-start'
  | 'row-end'

const MAX_CANDIDATE_MASK = (1 << SUDOKU_SIZE) - 1

const formatValue = (value: unknown): string => String(value)

const isDifficulty = (value: unknown): value is Difficulty =>
  value === 'easy' || value === 'medium' || value === 'hard'

const isDigit = (value: unknown): value is Digit =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9

const isCellValue = (value: unknown): value is CellValue =>
  value === null || isDigit(value)

const isCandidateMask = (value: unknown): value is CandidateMask =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  value >= 0 &&
  value <= MAX_CANDIDATE_MASK

const isRecord = (value: unknown): value is Record<PropertyKey, unknown> =>
  typeof value === 'object' && value !== null

const assertPuzzleId = (puzzleId: string): void => {
  if (typeof puzzleId !== 'string' || puzzleId.trim().length === 0) {
    throw new Error('Sudoku puzzle id must not be blank')
  }
}

const assertDifficulty = (difficulty: Difficulty): void => {
  if (!isDifficulty(difficulty)) {
    throw new Error(
      `Sudoku difficulty must be easy, medium, or hard; received ${formatValue(difficulty)}`,
    )
  }
}

const assertDigit = (digit: Digit): void => {
  if (!isDigit(digit)) {
    throw new Error(
      `Sudoku digit must be an integer between 1 and 9; received ${formatValue(digit)}`,
    )
  }
}

const assertElapsedMs = (elapsedMs: number): void => {
  if (
    typeof elapsedMs !== 'number' ||
    !Number.isFinite(elapsedMs) ||
    !Number.isInteger(elapsedMs) ||
    elapsedMs < 0
  ) {
    throw new Error(
      `Sudoku elapsed time must be a finite non-negative integer; received ${formatValue(elapsedMs)}`,
    )
  }
}

const assertCandidateArray = (
  candidates: readonly CandidateMask[],
  values: readonly CellValue[],
): void => {
  if (!Array.isArray(candidates) || candidates.length !== CELL_COUNT) {
    const length = Array.isArray(candidates) ? candidates.length : undefined
    throw new Error(
      `Sudoku candidates must contain exactly 81 cells; received ${formatValue(length)}`,
    )
  }

  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!Object.hasOwn(candidates, index)) {
      throw new Error(`Sudoku candidates must be dense; missing cell at index ${index}`)
    }

    const mask: unknown = candidates[index]
    if (!isCandidateMask(mask)) {
      throw new Error(
        `Sudoku candidate mask at index ${index} must be an integer between 0 and 511; received ${formatValue(mask)}`,
      )
    }
    if (values[index] !== null && mask !== 0) {
      throw new Error(
        `Sudoku filled cell at index ${index} must not contain candidates`,
      )
    }
  }
}

const parseCellChange = (value: unknown): CellChange | null => {
  if (!isRecord(value)) return null

  const index = value.index
  const beforeValue = value.beforeValue
  const afterValue = value.afterValue
  const beforeCandidates = value.beforeCandidates
  const afterCandidates = value.afterCandidates

  if (
    typeof index !== 'number' ||
    !Number.isInteger(index) ||
    index < 0 ||
    index >= CELL_COUNT ||
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

const parseHistoryEntry = (value: unknown): HistoryEntry | null => {
  if (!isRecord(value) || !Array.isArray(value.changes) || value.changes.length === 0) {
    return null
  }

  const changes: CellChange[] = []
  let previousIndex = -1

  for (let position = 0; position < value.changes.length; position += 1) {
    if (!Object.hasOwn(value.changes, position)) return null

    const change = parseCellChange(value.changes[position])
    if (change === null || change.index <= previousIndex) return null

    changes.push(change)
    previousIndex = change.index
  }

  return { changes }
}

const assertHistoryStructure = (
  history: readonly HistoryEntry[],
  givens: readonly CellValue[],
): void => {
  if (!Array.isArray(history)) {
    throw new Error('Sudoku history must be an array')
  }

  for (let entryIndex = 0; entryIndex < history.length; entryIndex += 1) {
    if (!Object.hasOwn(history, entryIndex)) {
      throw new Error(`Sudoku history must be dense; missing entry at index ${entryIndex}`)
    }

    const entry = parseHistoryEntry(history[entryIndex])
    if (entry === null) {
      throw new Error(`Sudoku history entry at index ${entryIndex} is invalid`)
    }

    for (const change of entry.changes) {
      const given = givens[change.index]
      if (
        given !== null &&
        (change.beforeValue !== given ||
          change.afterValue !== given ||
          change.beforeCandidates !== 0 ||
          change.afterCandidates !== 0)
      ) {
        throw new Error(`Sudoku history must not change given cell at index ${change.index}`)
      }
    }
  }
}

const statusFor = (values: readonly CellValue[]): GameStatus =>
  isSolvedBoard(values) ? 'completed' : 'playing'

interface ReplayResult {
  readonly values: readonly CellValue[]
  readonly candidates: readonly CandidateMask[]
  readonly history: readonly HistoryEntry[]
  readonly status: GameStatus
}

const arraysEqual = <T>(left: readonly T[], right: readonly T[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index])

const changesEqual = (
  left: readonly CellChange[],
  right: readonly CellChange[],
): boolean =>
  left.length === right.length &&
  left.every((change, index) => {
    const other = right[index]
    return (
      other !== undefined &&
      change.index === other.index &&
      change.beforeValue === other.beforeValue &&
      change.afterValue === other.afterValue &&
      change.beforeCandidates === other.beforeCandidates &&
      change.afterCandidates === other.afterCandidates
    )
  })

const isSingleCandidateBit = (mask: number): boolean =>
  mask > 0 && (mask & (mask - 1)) === 0

const expectedFormalChanges = (
  values: readonly CellValue[],
  candidates: readonly CandidateMask[],
  index: number,
  digit: Digit,
): readonly CellChange[] => {
  const digitMask = 1 << (digit - 1)
  const changes: CellChange[] = [
    {
      index,
      beforeValue: values[index],
      afterValue: digit,
      beforeCandidates: candidates[index],
      afterCandidates: 0,
    },
  ]

  for (const peerIndex of peerIndices(index)) {
    const beforeCandidates = candidates[peerIndex]
    if (values[peerIndex] !== null || (beforeCandidates & digitMask) === 0) continue

    changes.push({
      index: peerIndex,
      beforeValue: null,
      afterValue: null,
      beforeCandidates,
      afterCandidates: beforeCandidates & ~digitMask,
    })
  }

  return changes.sort((left, right) => left.index - right.index)
}

const applySemanticEntry = (
  givens: readonly CellValue[],
  values: readonly CellValue[],
  candidates: readonly CandidateMask[],
  entry: HistoryEntry,
): Pick<ReplayResult, 'values' | 'candidates' | 'status'> | null => {
  for (const change of entry.changes) {
    if (
      givens[change.index] !== null ||
      values[change.index] !== change.beforeValue ||
      candidates[change.index] !== change.beforeCandidates
    ) {
      return null
    }
  }

  const valueChanges = entry.changes.filter(
    ({ beforeValue, afterValue }) => beforeValue !== afterValue,
  )
  let matchesLegalAction = false

  if (valueChanges.length === 1) {
    const primaryChange = valueChanges[0]
    if (primaryChange === undefined) return null

    if (primaryChange.afterValue !== null) {
      const expected = expectedFormalChanges(
        values,
        candidates,
        primaryChange.index,
        primaryChange.afterValue,
      )
      matchesLegalAction = changesEqual(entry.changes, expected)
    } else {
      matchesLegalAction =
        entry.changes.length === 1 &&
        primaryChange.beforeValue !== null &&
        primaryChange.beforeCandidates === 0 &&
        primaryChange.afterCandidates === 0
    }
  } else if (valueChanges.length === 0 && entry.changes.length === 1) {
    const change = entry.changes[0]
    if (change === undefined) return null

    const toggledBits = change.beforeCandidates ^ change.afterCandidates
    const isCandidateToggle =
      change.beforeValue === null &&
      change.afterValue === null &&
      isSingleCandidateBit(toggledBits)
    const isCandidateErase =
      change.beforeValue === null &&
      change.afterValue === null &&
      change.beforeCandidates > 0 &&
      change.afterCandidates === 0
    matchesLegalAction = isCandidateToggle || isCandidateErase
  }

  if (!matchesLegalAction) return null

  let nextValues: CellValue[] | null = null
  let nextCandidates: CandidateMask[] | null = null

  for (const change of entry.changes) {
    if (change.beforeValue !== change.afterValue) {
      nextValues ??= [...values]
      nextValues[change.index] = change.afterValue
    }
    if (change.beforeCandidates !== change.afterCandidates) {
      nextCandidates ??= [...candidates]
      nextCandidates[change.index] = change.afterCandidates
    }
  }

  const appliedValues = nextValues ?? values
  return {
    values: appliedValues,
    candidates: nextCandidates ?? candidates,
    status: statusFor(appliedValues),
  }
}

const replaySemanticHistory = (
  givens: readonly CellValue[],
  initialValues: readonly CellValue[],
  initialCandidates: readonly CandidateMask[],
  history: readonly HistoryEntry[],
): ReplayResult | null => {
  if (!Array.isArray(history)) return null

  let values = initialValues
  let candidates = initialCandidates
  let status = statusFor(values)
  const replayedHistory: HistoryEntry[] = []

  for (let entryIndex = 0; entryIndex < history.length; entryIndex += 1) {
    if (status === 'completed' || !Object.hasOwn(history, entryIndex)) return null

    const entry = parseHistoryEntry(history[entryIndex])
    if (entry === null) return null

    const applied = applySemanticEntry(givens, values, candidates, entry)
    if (applied === null) return null

    values = applied.values
    candidates = applied.candidates
    status = applied.status
    replayedHistory.push(entry)
  }

  return { values, candidates, history: replayedHistory, status }
}

const assertStateStructure = (state: SudokuGameState): void => {
  if (!isRecord(state)) throw new Error('Sudoku game state must be an object')

  assertPuzzleId(state.puzzleId)
  assertDifficulty(state.difficulty)
  const givenConflicts = conflictIndices(state.givens)
  conflictIndices(state.values)

  if (givenConflicts.size > 0) {
    throw new Error('Sudoku givens must not contain conflicts')
  }
  if (!state.givens.some((value) => value === null)) {
    throw new Error('Sudoku givens must contain at least one empty cell')
  }

  for (let index = 0; index < CELL_COUNT; index += 1) {
    const given = state.givens[index]
    if (given !== null && state.values[index] !== given) {
      throw new Error(`Sudoku given cell at index ${index} must remain unchanged`)
    }
  }

  assertCandidateArray(state.candidates, state.values)
  assertCellIndex(state.selectedIndex)

  if (typeof state.noteMode !== 'boolean') {
    throw new Error('Sudoku note mode must be a boolean')
  }

  assertHistoryStructure(state.history, state.givens)
  assertElapsedMs(state.elapsedMs)

  if (state.status !== 'playing' && state.status !== 'completed') {
    throw new Error(
      `Sudoku status must be playing or completed; received ${formatValue(state.status)}`,
    )
  }
}

const assertState = (state: SudokuGameState): void => {
  assertStateStructure(state)

  const initialCandidates = Array.from({ length: CELL_COUNT }, () => 0)
  const replayed = replaySemanticHistory(
    state.givens,
    state.givens,
    initialCandidates,
    state.history,
  )

  if (
    replayed !== null &&
    arraysEqual(replayed.values, state.values) &&
    arraysEqual(replayed.candidates, state.candidates) &&
    replayed.status === state.status
  ) {
    return
  }

  throw new Error(
    'Sudoku game state history does not match values, candidates, and status',
  )
}

const appendEdit = (
  state: SudokuGameState,
  values: readonly CellValue[],
  candidates: readonly CandidateMask[],
  changes: readonly CellChange[],
): SudokuGameState => ({
  ...state,
  values,
  candidates,
  history: [...state.history, { changes }],
  status: statusFor(values),
})

export const createSudokuGame = (
  puzzleId: string,
  difficulty: Difficulty,
  serializedGivens: string,
): SudokuGameState => {
  assertPuzzleId(puzzleId)
  assertDifficulty(difficulty)

  const parsedGivens = createBoardFromString(serializedGivens)
  if (conflictIndices(parsedGivens).size > 0) {
    throw new Error('Sudoku givens must not contain conflicts')
  }
  if (!parsedGivens.some((value) => value === null)) {
    throw new Error('Sudoku givens must contain at least one empty cell')
  }

  return {
    puzzleId,
    difficulty,
    givens: [...parsedGivens],
    values: [...parsedGivens],
    candidates: Array.from({ length: CELL_COUNT }, () => 0),
    selectedIndex: 0,
    noteMode: false,
    history: [],
    elapsedMs: 0,
    status: 'playing',
  }
}

export const selectCell = (
  state: SudokuGameState,
  index: number,
): SudokuGameState => {
  assertState(state)
  assertCellIndex(index)
  return state.selectedIndex === index ? state : { ...state, selectedIndex: index }
}

export const moveSelection = (
  state: SudokuGameState,
  direction: MoveDirection,
): SudokuGameState => {
  assertState(state)

  const row = Math.floor(state.selectedIndex / SUDOKU_SIZE)
  const col = state.selectedIndex % SUDOKU_SIZE
  let nextIndex: number

  switch (direction) {
    case 'up':
      nextIndex = Math.max(0, row - 1) * SUDOKU_SIZE + col
      break
    case 'down':
      nextIndex = Math.min(SUDOKU_SIZE - 1, row + 1) * SUDOKU_SIZE + col
      break
    case 'left':
      nextIndex = row * SUDOKU_SIZE + Math.max(0, col - 1)
      break
    case 'right':
      nextIndex = row * SUDOKU_SIZE + Math.min(SUDOKU_SIZE - 1, col + 1)
      break
    case 'row-start':
      nextIndex = row * SUDOKU_SIZE
      break
    case 'row-end':
      nextIndex = row * SUDOKU_SIZE + SUDOKU_SIZE - 1
      break
    default:
      throw new Error(
        `Move direction must be up, down, left, right, row-start, or row-end; received ${formatValue(direction)}`,
      )
  }

  return nextIndex === state.selectedIndex ? state : { ...state, selectedIndex: nextIndex }
}

export const toggleNoteMode = (state: SudokuGameState): SudokuGameState => {
  assertState(state)
  return state.status === 'completed' ? state : { ...state, noteMode: !state.noteMode }
}

export const enterDigit = (
  state: SudokuGameState,
  digit: Digit,
): SudokuGameState => {
  assertState(state)
  assertDigit(digit)

  if (state.status === 'completed' || state.givens[state.selectedIndex] !== null) {
    return state
  }

  const index = state.selectedIndex
  const beforeValue = state.values[index]
  const beforeCandidates = state.candidates[index]
  const digitMask = 1 << (digit - 1)

  if (state.noteMode) {
    if (beforeValue !== null) return state

    const afterCandidates = beforeCandidates ^ digitMask
    const candidates = [...state.candidates]
    candidates[index] = afterCandidates

    return appendEdit(state, state.values, candidates, [
      {
        index,
        beforeValue,
        afterValue: beforeValue,
        beforeCandidates,
        afterCandidates,
      },
    ])
  }

  if (beforeValue === digit) return state

  const values = [...state.values]
  values[index] = digit
  const changes: CellChange[] = [
    {
      index,
      beforeValue,
      afterValue: digit,
      beforeCandidates,
      afterCandidates: 0,
    },
  ]
  let candidates: readonly CandidateMask[] = state.candidates

  const candidateChanges = beforeCandidates !== 0
    ? new Map<number, CandidateMask>([[index, 0]])
    : new Map<number, CandidateMask>()

  for (const peerIndex of peerIndices(index)) {
    const peerCandidates = state.candidates[peerIndex]
    if (state.values[peerIndex] !== null || (peerCandidates & digitMask) === 0) continue

    const afterCandidates = peerCandidates & ~digitMask
    candidateChanges.set(peerIndex, afterCandidates)
    changes.push({
      index: peerIndex,
      beforeValue: null,
      afterValue: null,
      beforeCandidates: peerCandidates,
      afterCandidates,
    })
  }

  if (candidateChanges.size > 0) {
    const nextCandidates = [...state.candidates]
    for (const [changedIndex, mask] of candidateChanges) {
      nextCandidates[changedIndex] = mask
    }
    candidates = nextCandidates
  }

  changes.sort((left, right) => left.index - right.index)
  return appendEdit(state, values, candidates, changes)
}

export const eraseSelected = (state: SudokuGameState): SudokuGameState => {
  assertState(state)

  const index = state.selectedIndex
  if (state.status === 'completed' || state.givens[index] !== null) return state

  const beforeValue = state.values[index]
  const beforeCandidates = state.candidates[index]
  if (beforeValue === null && beforeCandidates === 0) return state

  let values: readonly CellValue[] = state.values
  let candidates: readonly CandidateMask[] = state.candidates

  if (beforeValue !== null) {
    const nextValues = [...state.values]
    nextValues[index] = null
    values = nextValues
  }
  if (beforeCandidates !== 0) {
    const nextCandidates = [...state.candidates]
    nextCandidates[index] = 0
    candidates = nextCandidates
  }

  return appendEdit(state, values, candidates, [
    {
      index,
      beforeValue,
      afterValue: null,
      beforeCandidates,
      afterCandidates: 0,
    },
  ])
}

export const undo = (state: SudokuGameState): SudokuGameState => {
  assertState(state)
  if (state.history.length === 0) return state

  const entry = state.history[state.history.length - 1]
  if (entry === undefined) {
    throw new Error('Sudoku history must be dense')
  }

  let values: readonly CellValue[] = state.values
  let candidates: readonly CandidateMask[] = state.candidates
  let nextValues: CellValue[] | null = null
  let nextCandidates: CandidateMask[] | null = null

  for (let position = entry.changes.length - 1; position >= 0; position -= 1) {
    const change = entry.changes[position]
    if (change === undefined) throw new Error('Sudoku history changes must be dense')

    if (
      state.values[change.index] !== change.afterValue ||
      state.candidates[change.index] !== change.afterCandidates
    ) {
      throw new Error(
        `Sudoku history change after state does not match current cell at index ${change.index}`,
      )
    }

    if (change.beforeValue !== change.afterValue) {
      nextValues ??= [...state.values]
      nextValues[change.index] = change.beforeValue
    }
    if (change.beforeCandidates !== change.afterCandidates) {
      nextCandidates ??= [...state.candidates]
      nextCandidates[change.index] = change.beforeCandidates
    }
  }

  if (nextValues !== null) values = nextValues
  if (nextCandidates !== null) candidates = nextCandidates

  return {
    ...state,
    values,
    candidates,
    history: state.history.slice(0, -1),
    status: statusFor(values),
  }
}

export const resetSudokuGame = (state: SudokuGameState): SudokuGameState => {
  assertState(state)

  return {
    puzzleId: state.puzzleId,
    difficulty: state.difficulty,
    givens: [...state.givens],
    values: [...state.givens],
    candidates: Array.from({ length: CELL_COUNT }, () => 0),
    selectedIndex: 0,
    noteMode: false,
    history: [],
    elapsedMs: 0,
    status: 'playing',
  }
}

export const withElapsedMs = (
  state: SudokuGameState,
  elapsedMs: number,
): SudokuGameState => {
  assertState(state)
  assertElapsedMs(elapsedMs)
  return state.elapsedMs === elapsedMs ? state : { ...state, elapsedMs }
}

export const replaySudokuHistory = (
  initialState: SudokuGameState,
  history: readonly HistoryEntry[],
): SudokuGameState | null => {
  assertStateStructure(initialState)

  const isTrueInitialState =
    arraysEqual(initialState.values, initialState.givens) &&
    initialState.candidates.every((mask) => mask === 0) &&
    initialState.history.length === 0 &&
    initialState.selectedIndex === 0 &&
    initialState.noteMode === false &&
    initialState.elapsedMs === 0 &&
    initialState.status === 'playing'
  if (!isTrueInitialState) return null

  const replayed = replaySemanticHistory(
    initialState.givens,
    initialState.values,
    initialState.candidates,
    history,
  )
  if (replayed === null) return null

  return {
    ...initialState,
    givens: initialState.givens,
    values: replayed.values,
    candidates: replayed.candidates,
    history: replayed.history,
    status: replayed.status,
  }
}
