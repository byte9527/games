import { analyzePuzzle, countSolutions, solvePuzzle } from './solver'
import { conflictIndices, createBoardFromString } from '../core/board'
import type { Difficulty, Digit } from '../core/types'
import type { SudokuPuzzle, SudokuPuzzleProvider } from './provider'

const STANDARD_PUZZLE =
  '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

const STANDARD_SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

const EMPTY_BOARD = '0'.repeat(81)

const EMPTY_BOARD_FIRST_SOLUTION =
  '123456789456789123789123456231674895875912364694538217317265948542897631968341572'

const UNSOLVABLE_WITHOUT_INITIAL_CONFLICT =
  '531070000600195000098000060800060003400803001700020006060000280000419005000080079'

const serializedConsumers = [
  { name: 'solvePuzzle', run: solvePuzzle },
  { name: 'countSolutions', run: (serialized: string) => countSolutions(serialized, 2) },
  { name: 'analyzePuzzle', run: analyzePuzzle },
]

describe('sudoku puzzle solver', () => {
  it('定义只读题目数据和 provider 接口', () => {
    expectTypeOf<
      Pick<SudokuPuzzle, 'id' | 'difficulty' | 'givens' | 'solution'>
    >().toEqualTypeOf<{
      readonly id: string
      readonly difficulty: Difficulty
      readonly givens: readonly (Digit | null)[]
      readonly solution: readonly Digit[]
    }>()
    expectTypeOf<SudokuPuzzleProvider['getById']>().toEqualTypeOf<
      (id: string) => SudokuPuzzle | null
    >()
    expectTypeOf<SudokuPuzzleProvider['next']>().toEqualTypeOf<
      (difficulty: Difficulty, previousId: string | null) => SudokuPuzzle
    >()
    expectTypeOf<SudokuPuzzleProvider['all']>().toEqualTypeOf<
      () => readonly SudokuPuzzle[]
    >()
  })

  it('求解标准题并确认唯一解', () => {
    expect(solvePuzzle(STANDARD_PUZZLE)).toBe(STANDARD_SOLUTION)
    expect(countSolutions(STANDARD_PUZZLE, 2)).toBe(1)
  })

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY, Number.NaN])(
    '拒绝非法解数上限 %s',
    (limit) => {
      expect(() => countSolutions(STANDARD_PUZZLE, limit)).toThrowError(
        `Sudoku solution limit must be a finite positive integer; received ${String(limit)}`,
      )
    },
  )

  it('一次分析返回首个解、至多两个解的计数和实际多候选分支次数', () => {
    const analysis = analyzePuzzle(STANDARD_PUZZLE)

    expect(analysis.solution).toBe(STANDARD_SOLUTION)
    expect(analysis.solutionCount).toBe(1)
    expect(Number.isInteger(analysis.branchDecisions)).toBe(true)
    expect(analysis.branchDecisions).toBe(0)
  })

  it('输入已有冲突时立即报告无解', () => {
    const conflict = `55${'0'.repeat(79)}`

    expect(solvePuzzle(conflict)).toBeNull()
    expect(countSolutions(conflict, 2)).toBe(0)
    expect(analyzePuzzle(conflict)).toEqual({
      solution: null,
      solutionCount: 0,
      branchDecisions: 0,
    })
  })

  it('空盘找到两个解后按上限停止，并保持固定候选顺序', () => {
    expect(countSolutions(EMPTY_BOARD, 2)).toBe(2)
    expect(solvePuzzle(EMPTY_BOARD)).toBe(EMPTY_BOARD_FIRST_SOLUTION)
    expect(solvePuzzle(EMPTY_BOARD)).toBe(EMPTY_BOARD_FIRST_SOLUTION)
    expect(analyzePuzzle(EMPTY_BOARD)).toEqual({
      solution: EMPTY_BOARD_FIRST_SOLUTION,
      solutionCount: 2,
      branchDecisions: 47,
    })
  })

  it('接受已填满合法盘，且不把确定填值计为分支', () => {
    expect(solvePuzzle(STANDARD_SOLUTION)).toBe(STANDARD_SOLUTION)
    expect(countSolutions(STANDARD_SOLUTION, 2)).toBe(1)
    expect(analyzePuzzle(STANDARD_SOLUTION)).toEqual({
      solution: STANDARD_SOLUTION,
      solutionCount: 1,
      branchDecisions: 0,
    })
  })

  it('拒绝已填满冲突盘', () => {
    const conflictingSolution = `3${STANDARD_SOLUTION.slice(1)}`

    expect(solvePuzzle(conflictingSolution)).toBeNull()
    expect(countSolutions(conflictingSolution, 2)).toBe(0)
  })

  it('识别没有初始重复但无法完成的题面', () => {
    expect(
      conflictIndices(createBoardFromString(UNSOLVABLE_WITHOUT_INITIAL_CONFLICT)).size,
    ).toBe(0)
    expect(solvePuzzle(UNSOLVABLE_WITHOUT_INITIAL_CONFLICT)).toBeNull()
    expect(countSolutions(UNSOLVABLE_WITHOUT_INITIAL_CONFLICT, 2)).toBe(0)
    expect(analyzePuzzle(UNSOLVABLE_WITHOUT_INITIAL_CONFLICT)).toEqual({
      solution: null,
      solutionCount: 0,
      branchDecisions: 0,
    })
  })

  describe.each(serializedConsumers)('$name 严格题面校验', ({ run }) => {
    it.each([EMPTY_BOARD.slice(1), `${EMPTY_BOARD}0`])(
      '拒绝长度不是 81 的字符串',
      (serialized) => {
        expect(() => run(serialized)).toThrowError(
          `Sudoku board string must contain exactly 81 characters; received ${serialized.length}`,
        )
      },
    )

    it.each([' ', '.', 'a', '１'])(
      '拒绝非 ASCII 数字字符 %j',
      (character) => {
        const serialized = `${'0'.repeat(40)}${character}${'0'.repeat(40)}`

        expect(() => run(serialized)).toThrowError(
          `Sudoku board string may contain only digits 0 through 9; received ${JSON.stringify(character)} at index 40`,
        )
      },
    )
  })
})
