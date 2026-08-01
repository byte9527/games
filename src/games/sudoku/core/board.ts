import { CELL_COUNT, SUDOKU_SIZE, type CellValue, type Digit } from './types'

const BOX_SIZE = 3

const formatValue = (value: unknown): string => String(value)

const parseCellCharacter = (character: string, index: number): CellValue => {
  switch (character) {
    case '0':
      return null
    case '1':
      return 1
    case '2':
      return 2
    case '3':
      return 3
    case '4':
      return 4
    case '5':
      return 5
    case '6':
      return 6
    case '7':
      return 7
    case '8':
      return 8
    case '9':
      return 9
    default:
      throw new Error(
        `Sudoku board string may contain only digits 0 through 9; received ${JSON.stringify(character)} at index ${index}`,
      )
  }
}

const isDigit = (value: unknown): value is Digit =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 9

const assertBoard = (board: readonly CellValue[]): void => {
  if (board.length !== CELL_COUNT) {
    throw new Error(
      `Sudoku board must contain exactly 81 cells; received ${board.length}`,
    )
  }

  for (let index = 0; index < CELL_COUNT; index += 1) {
    if (!Object.hasOwn(board, index)) {
      throw new Error(`Sudoku board must be dense; missing cell at index ${index}`)
    }

    const value: unknown = board[index]
    if (value !== null && !isDigit(value)) {
      throw new Error(
        `Sudoku board cell at index ${index} must be null or an integer between 1 and 9; received ${formatValue(value)}`,
      )
    }
  }
}

const addUnitConflicts = (
  board: readonly CellValue[],
  unitIndices: readonly number[],
  conflicts: Set<number>,
): void => {
  const indicesByDigit = new Map<Digit, number[]>()

  for (const index of unitIndices) {
    const value = board[index]
    if (value === null) continue

    const existingIndices = indicesByDigit.get(value)
    if (existingIndices) existingIndices.push(index)
    else indicesByDigit.set(value, [index])
  }

  for (const indices of indicesByDigit.values()) {
    if (indices.length < 2) continue
    for (const index of indices) conflicts.add(index)
  }
}

const collectConflictIndices = (board: readonly CellValue[]): number[] => {
  const conflicts = new Set<number>()

  for (let unit = 0; unit < SUDOKU_SIZE; unit += 1) {
    const rowIndices: number[] = []
    const colIndices: number[] = []
    const boxIndices: number[] = []
    const boxStartRow = Math.floor(unit / BOX_SIZE) * BOX_SIZE
    const boxStartCol = (unit % BOX_SIZE) * BOX_SIZE

    for (let offset = 0; offset < SUDOKU_SIZE; offset += 1) {
      rowIndices.push(unit * SUDOKU_SIZE + offset)
      colIndices.push(offset * SUDOKU_SIZE + unit)

      const boxRow = boxStartRow + Math.floor(offset / BOX_SIZE)
      const boxCol = boxStartCol + (offset % BOX_SIZE)
      boxIndices.push(boxRow * SUDOKU_SIZE + boxCol)
    }

    addUnitConflicts(board, rowIndices, conflicts)
    addUnitConflicts(board, colIndices, conflicts)
    addUnitConflicts(board, boxIndices, conflicts)
  }

  return [...conflicts].sort((left, right) => left - right)
}

export const assertCellIndex = (index: number): void => {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
    throw new Error(
      `Cell index must be an integer between 0 and 80; received ${formatValue(index)}`,
    )
  }
}

export const rowOf = (index: number): number => {
  assertCellIndex(index)
  return Math.floor(index / SUDOKU_SIZE)
}

export const colOf = (index: number): number => {
  assertCellIndex(index)
  return index % SUDOKU_SIZE
}

export const boxOf = (index: number): number => {
  const row = rowOf(index)
  const col = colOf(index)
  return Math.floor(row / BOX_SIZE) * BOX_SIZE + Math.floor(col / BOX_SIZE)
}

export const peerIndices = (index: number): number[] => {
  assertCellIndex(index)

  const peers = new Set<number>()
  const row = Math.floor(index / SUDOKU_SIZE)
  const col = index % SUDOKU_SIZE
  const boxStartRow = Math.floor(row / BOX_SIZE) * BOX_SIZE
  const boxStartCol = Math.floor(col / BOX_SIZE) * BOX_SIZE

  for (let offset = 0; offset < SUDOKU_SIZE; offset += 1) {
    peers.add(row * SUDOKU_SIZE + offset)
    peers.add(offset * SUDOKU_SIZE + col)
  }

  for (let rowOffset = 0; rowOffset < BOX_SIZE; rowOffset += 1) {
    for (let colOffset = 0; colOffset < BOX_SIZE; colOffset += 1) {
      peers.add((boxStartRow + rowOffset) * SUDOKU_SIZE + boxStartCol + colOffset)
    }
  }

  peers.delete(index)
  return [...peers].sort((left, right) => left - right)
}

export const createBoardFromString = (input: string): CellValue[] => {
  if (input.length !== CELL_COUNT) {
    throw new Error(
      `Sudoku board string must contain exactly 81 characters; received ${input.length}`,
    )
  }

  return [...input].map(parseCellCharacter)
}

export const conflictIndices = (board: readonly CellValue[]): number[] => {
  assertBoard(board)
  return collectConflictIndices(board)
}

export const isSolvedBoard = (board: readonly CellValue[]): boolean => {
  assertBoard(board)
  return board.every((value) => value !== null) && collectConflictIndices(board).length === 0
}
