import {
  assertCellIndex,
  boxOf,
  colOf,
  conflictIndices,
  createBoardFromString,
  isSolvedBoard,
  peerIndices,
  rowOf,
} from './board'
import {
  CELL_COUNT,
  SUDOKU_SIZE,
  type CellValue,
  type SudokuGameState,
} from './types'

const SOLVED_BOARD =
  '534678912' +
  '672195348' +
  '198342567' +
  '859761423' +
  '426853791' +
  '713924856' +
  '961537284' +
  '287419635' +
  '345286179'

const THREE_WAY_CONFLICT_BOARD =
  '120000001' +
  '030000000' +
  '003000000' +
  '000000000' +
  '000000000' +
  '000000000' +
  '000000000' +
  '000000000' +
  '020000000'

const boardConsumers = [
  { name: 'conflictIndices', run: conflictIndices },
  { name: 'isSolvedBoard', run: isSolvedBoard },
]

describe('sudoku board', () => {
  it('定义 9×9 棋盘常量和只读游戏状态结构', () => {
    const state = {
      puzzleId: 'easy-1',
      difficulty: 'easy',
      givens: createBoardFromString('0'.repeat(CELL_COUNT)),
      values: createBoardFromString('0'.repeat(CELL_COUNT)),
      candidates: Array.from({ length: CELL_COUNT }, () => 0),
      selectedIndex: null,
      noteMode: false,
      history: [],
      elapsedMs: 0,
      status: 'playing',
    } satisfies SudokuGameState

    expect(SUDOKU_SIZE).toBe(9)
    expect(CELL_COUNT).toBe(81)
    expect(state.givens).toHaveLength(CELL_COUNT)
  })

  describe('坐标和关联格', () => {
    it('把中间格索引转换为行、列和宫', () => {
      expect(rowOf(40)).toBe(4)
      expect(colOf(40)).toBe(4)
      expect(boxOf(40)).toBe(4)
    })

    it('返回同行、同列、同宫共 20 个唯一关联格', () => {
      const peers = peerIndices(40)

      expect(peers).toHaveLength(20)
      expect(new Set(peers).size).toBe(20)
      expect(peers).toEqual([...peers].sort((left, right) => left - right))
      expect(peers).toEqual(expect.arrayContaining([36, 4, 30]))
      expect(peers).not.toContain(40)
    })

    it('每次返回新的关联格数组，不泄露可变内部状态', () => {
      const first = peerIndices(40)
      const expected = [...first]

      first.splice(0, first.length, 80)

      expect(peerIndices(40)).toEqual(expected)
      expect(peerIndices(40)).not.toBe(peerIndices(40))
    })

    it.each([-1, 81, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
      '拒绝非法索引 %s',
      (index) => {
        const operations = [assertCellIndex, rowOf, colOf, boxOf, peerIndices]

        for (const operation of operations) {
          expect(() => operation(index)).toThrowError(
            `Cell index must be an integer between 0 and 80; received ${String(index)}`,
          )
        }
      },
    )
  })

  describe('棋盘解析', () => {
    it('把恰好 81 个 0..9 字符解析为棋盘，0 转换为空格', () => {
      const board = createBoardFromString(`123456789${'0'.repeat(72)}`)

      expect(board).toHaveLength(CELL_COUNT)
      expect(board.slice(0, 10)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, null])
    })

    it.each(['0'.repeat(80), '0'.repeat(82)])('拒绝长度不是 81 的字符串', (input) => {
      expect(() => createBoardFromString(input)).toThrowError(
        `Sudoku board string must contain exactly 81 characters; received ${input.length}`,
      )
    })

    it.each(['.', 'a', '-', ' '])('拒绝非法字符 %s', (character) => {
      const input = `${'0'.repeat(40)}${character}${'0'.repeat(40)}`

      expect(() => createBoardFromString(input)).toThrowError(
        `Sudoku board string may contain only digits 0 through 9; received ${JSON.stringify(character)} at index 40`,
      )
    })
  })

  describe('冲突检测', () => {
    it('同时标记同行、同列、同宫中全部重复数字', () => {
      const board = createBoardFromString(THREE_WAY_CONFLICT_BOARD)

      expect(conflictIndices(board)).toEqual([0, 1, 8, 10, 20, 73])
    })

    it('不修改输入棋盘', () => {
      const board = Object.freeze(createBoardFromString(THREE_WAY_CONFLICT_BOARD))
      const snapshot = [...board]

      conflictIndices(board)
      isSolvedBoard(board)

      expect(board).toEqual(snapshot)
    })
  })

  describe('完成判定', () => {
    it('只有 81 格填满且无冲突时才完成', () => {
      expect(isSolvedBoard(createBoardFromString(SOLVED_BOARD))).toBe(true)
    })

    it('存在空格时未完成', () => {
      expect(isSolvedBoard(createBoardFromString(`0${SOLVED_BOARD.slice(1)}`))).toBe(false)
    })

    it('全部填满但存在重复时未完成', () => {
      expect(isSolvedBoard(createBoardFromString(`3${SOLVED_BOARD.slice(1)}`))).toBe(false)
    })
  })

  describe.each(boardConsumers)('$name 输入验证', ({ run }) => {
    it.each([80, 82])('拒绝长度为 %i 的棋盘', (length) => {
      const board = Array.from({ length }, () => null)

      expect(() => run(board)).toThrowError(
        `Sudoku board must contain exactly 81 cells; received ${length}`,
      )
    })

    it('拒绝稀疏棋盘', () => {
      const board = Array<CellValue>(CELL_COUNT)

      expect(() => run(board)).toThrowError('Sudoku board must be dense; missing cell at index 0')
    })

    it.each([0, -1, 10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, '1', undefined])(
      '拒绝非法格值 %s',
      (value) => {
        const board: unknown[] = Array.from({ length: CELL_COUNT }, () => null)
        board[40] = value

        expect(() => run(board as readonly CellValue[])).toThrowError(
          `Sudoku board cell at index 40 must be null or an integer between 1 and 9; received ${String(value)}`,
        )
      },
    )
  })
})
