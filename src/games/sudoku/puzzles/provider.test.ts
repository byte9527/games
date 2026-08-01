import { isSolvedBoard } from '../core/board'
import type { Difficulty } from '../core/types'
import { builtinSudokuPuzzleData } from './data'
import {
  generateSudokuPuzzleCatalog,
  generationRules,
} from './generator'
import {
  builtinSudokuPuzzleProvider,
  createSudokuPuzzleProvider,
} from './provider'
import { analyzePuzzle } from './solver'

const DIFFICULTIES: readonly Difficulty[] = ['easy', 'medium', 'hard']

const serializeGivens = (givens: readonly (number | null)[]): string =>
  givens.map((value) => value ?? 0).join('')

describe('builtin sudoku puzzle provider', () => {
  it('提供 60 道按难度均分且 ID 稳定唯一的静态离线题目', () => {
    const puzzles = builtinSudokuPuzzleProvider.all()
    const ids = puzzles.map((puzzle) => puzzle.id)

    expect(puzzles).toHaveLength(60)
    expect(new Set(ids).size).toBe(60)

    for (const difficulty of DIFFICULTIES) {
      const matchingPuzzles = puzzles.filter(
        (puzzle) => puzzle.difficulty === difficulty,
      )
      expect(matchingPuzzles).toHaveLength(20)
      expect(matchingPuzzles.map((puzzle) => puzzle.id)).toEqual(
        Array.from(
          { length: 20 },
          (_, index) => `${difficulty}-${String(index + 1).padStart(3, '0')}`,
        ),
      )
    }
  })

  it('每题满足固定线索数、合法终盘和题面一致性', () => {
    for (const puzzle of builtinSudokuPuzzleProvider.all()) {
      expect(
        puzzle.givens.filter((value) => value !== null),
        puzzle.id,
      ).toHaveLength(generationRules[puzzle.difficulty].clues)
      expect(puzzle.solution, puzzle.id).toHaveLength(81)
      expect(isSolvedBoard(puzzle.solution), puzzle.id).toBe(true)

      for (let index = 0; index < puzzle.givens.length; index += 1) {
        const given = puzzle.givens[index]
        if (given !== null) {
          expect(given, `${puzzle.id}:${index}`).toBe(puzzle.solution[index])
        }
      }
    }
  })

  it('每题由 solver 复核为唯一解并满足固定分支门槛', () => {
    for (const puzzle of builtinSudokuPuzzleProvider.all()) {
      const analysis = analyzePuzzle(serializeGivens(puzzle.givens))
      const rule = generationRules[puzzle.difficulty]

      expect(analysis.solutionCount, puzzle.id).toBe(1)
      expect(analysis.solution, puzzle.id).toBe(puzzle.solution.join(''))
      expect(analysis.branchDecisions, puzzle.id).toBeGreaterThanOrEqual(
        rule.minimumBranches,
      )
      expect(analysis.branchDecisions, puzzle.id).toBeLessThanOrEqual(
        rule.maximumBranches,
      )
    }
  })

  it('不同 ID 不复用相同题面', () => {
    const givens = builtinSudokuPuzzleProvider
      .all()
      .map((puzzle) => serializeGivens(puzzle.givens))

    expect(new Set(givens).size).toBe(givens.length)
  })

  it('按 ID 查询已知题目并对未知 ID 返回 null', () => {
    expect(builtinSudokuPuzzleProvider.getById('medium-007')?.difficulty).toBe(
      'medium',
    )
    expect(builtinSudokuPuzzleProvider.getById('unknown-001')).toBeNull()
  })

  it('next 仅在指定难度内按稳定游标轮转且连续不重复', () => {
    const firstProvider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    const secondProvider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    const firstSequence = Array.from({ length: 21 }, () =>
      firstProvider.next('easy', null).id,
    )
    const secondSequence = Array.from({ length: 21 }, () =>
      secondProvider.next('easy', null).id,
    )

    expect(firstSequence).toEqual(secondSequence)
    expect(firstSequence.slice(0, 20)).toEqual(
      Array.from(
        { length: 20 },
        (_, index) => `easy-${String(index + 1).padStart(3, '0')}`,
      ),
    )
    expect(firstSequence[20]).toBe('easy-001')
    expect(firstSequence.every((id) => id.startsWith('easy-'))).toBe(true)
    expect(
      firstSequence.slice(1).every((id, index) => id !== firstSequence[index]),
    ).toBe(true)
  })

  it('next 跳过同难度 previous，未知或其他难度 previous 不改变游标语义', () => {
    const skipProvider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    expect(skipProvider.next('medium', 'medium-001').id).toBe('medium-002')

    const baselineProvider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    const unknownProvider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    const otherDifficultyProvider = createSudokuPuzzleProvider(
      builtinSudokuPuzzleData,
    )

    expect(unknownProvider.next('hard', 'unknown-001').id).toBe(
      baselineProvider.next('hard', null).id,
    )
    expect(otherDifficultyProvider.next('easy', 'hard-001').id).toBe(
      createSudokuPuzzleProvider(builtinSudokuPuzzleData).next('easy', null).id,
    )
  })

  it('all 及题目嵌套数组都是冻结视图，写入不会影响内部目录', () => {
    const provider = createSudokuPuzzleProvider(builtinSudokuPuzzleData)
    const puzzles = provider.all()
    const firstPuzzle = puzzles[0]
    const originalGiven = firstPuzzle.givens[0]
    const originalSolution = firstPuzzle.solution[0]

    expect(Object.isFrozen(puzzles)).toBe(true)
    expect(Object.isFrozen(firstPuzzle)).toBe(true)
    expect(Object.isFrozen(firstPuzzle.givens)).toBe(true)
    expect(Object.isFrozen(firstPuzzle.solution)).toBe(true)
    expect(Reflect.set(puzzles, 0, null)).toBe(false)
    expect(Reflect.set(firstPuzzle.givens, 0, 9)).toBe(false)
    expect(Reflect.set(firstPuzzle.solution, 0, 9)).toBe(false)
    expect(provider.getById(firstPuzzle.id)?.givens[0]).toBe(originalGiven)
    expect(provider.getById(firstPuzzle.id)?.solution[0]).toBe(originalSolution)
  })
})

describe('sudoku puzzle catalog boundaries', () => {
  it('拒绝空目录或缺少任一难度的目录', () => {
    expect(() => createSudokuPuzzleProvider([])).toThrowError(
      'Built-in Sudoku puzzle catalog must not be empty',
    )
    expect(() =>
      createSudokuPuzzleProvider(
        builtinSudokuPuzzleData.filter((puzzle) => puzzle.difficulty !== 'hard'),
      ),
    ).toThrowError(
      'Built-in Sudoku puzzle catalog must contain at least one hard puzzle',
    )
  })

  it('拒绝非法 ID、冲突终盘、题面与解不一致的数据', () => {
    const valid = builtinSudokuPuzzleData[0]

    expect(() =>
      createSudokuPuzzleProvider([
        ...builtinSudokuPuzzleData.slice(1),
        { ...valid, id: 'medium-001' },
      ]),
    ).toThrowError('invalid stable id')
    expect(() =>
      createSudokuPuzzleProvider([
        ...builtinSudokuPuzzleData.slice(1),
        { ...valid, solution: `1${valid.solution.slice(1)}` },
      ]),
    ).toThrowError('solution must be a legal completed board')

    const changedGiven = valid.givens[0] === '1' ? '2' : '1'
    expect(() =>
      createSudokuPuzzleProvider([
        ...builtinSudokuPuzzleData.slice(1),
        { ...valid, givens: `${changedGiven}${valid.givens.slice(1)}` },
      ]),
    ).toThrowError('does not match its solution')
  })

  it('拒绝错误长度、非法字符和运行时不存在的难度', () => {
    const valid = builtinSudokuPuzzleData[0]

    expect(() =>
      createSudokuPuzzleProvider([
        ...builtinSudokuPuzzleData.slice(1),
        { ...valid, solution: valid.solution.slice(1) },
      ]),
    ).toThrowError('must contain exactly 81 characters')
    expect(() =>
      createSudokuPuzzleProvider([
        ...builtinSudokuPuzzleData.slice(1),
        { ...valid, givens: `x${valid.givens.slice(1)}` },
      ]),
    ).toThrowError('may contain only digits 0 through 9')
    expect(() =>
      builtinSudokuPuzzleProvider.next(
        'expert' as unknown as Difficulty,
        null,
      ),
    ).toThrowError(
      'Built-in Sudoku puzzle catalog has no puzzles for difficulty expert',
    )
  })

  it('拒绝不同 ID 的重复题面', () => {
    const duplicate = {
      ...builtinSudokuPuzzleData[0],
      id: 'easy-999',
    }

    expect(() =>
      createSudokuPuzzleProvider([...builtinSudokuPuzzleData, duplicate]),
    ).toThrowError('Built-in Sudoku puzzle givens must be unique')
  })
})

describe('sudoku puzzle generator', () => {
  it('固定规则与产品难度门槛一致', () => {
    expect(generationRules).toEqual({
      easy: { clues: 40, minimumBranches: 0, maximumBranches: 1 },
      medium: { clues: 34, minimumBranches: 2, maximumBranches: 8 },
      hard: {
        clues: 28,
        minimumBranches: 9,
        maximumBranches: Number.POSITIVE_INFINITY,
      },
    })
  })

  it('相同输入两次生成深度相等且序列化逐字节相同', () => {
    const options = { puzzlesPerDifficulty: 1 }
    const first = generateSudokuPuzzleCatalog(options)
    const second = generateSudokuPuzzleCatalog(options)

    expect(second).toEqual(first)
    expect(JSON.stringify(second)).toBe(JSON.stringify(first))
  })

  it('达到确定性 seed 上限后明确失败且不放宽规则', () => {
    expect(() =>
      generateSudokuPuzzleCatalog({
        puzzlesPerDifficulty: 20,
        maximumSeedsPerDifficulty: 1,
      }),
    ).toThrowError(
      'Unable to generate 20 easy Sudoku puzzles after 1 deterministic seeds; fixed generation rules were not relaxed',
    )
  })

  it.each([
    [{ puzzlesPerDifficulty: 0 }, 'puzzlesPerDifficulty'],
    [{ puzzlesPerDifficulty: 21 }, 'puzzlesPerDifficulty'],
    [{ maximumSeedsPerDifficulty: 0 }, 'maximumSeedsPerDifficulty'],
    [{ maximumSeedsPerDifficulty: 10_001 }, 'maximumSeedsPerDifficulty'],
  ] as const)('拒绝非法生成配置 %j', (options, field) => {
    expect(() => generateSudokuPuzzleCatalog(options)).toThrowError(field)
  })
})
