import { createBoardFromString } from './board'
import {
  createSudokuGame,
  enterDigit,
  eraseSelected,
  moveSelection,
  replaySudokuHistory,
  resetSudokuGame,
  selectCell,
  toggleNoteMode,
  undo,
  withElapsedMs,
  type MoveDirection,
} from './game'
import type {
  CandidateMask,
  CellChange,
  CellValue,
  Difficulty,
  Digit,
  HistoryEntry,
  SudokuGameState,
} from './types'

const GIVENS =
  '530070000' +
  '600195000' +
  '098000060' +
  '800060003' +
  '400803001' +
  '700020006' +
  '060000280' +
  '000419005' +
  '000080079'

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

const createGame = (): SudokuGameState =>
  createSudokuGame('easy-001', 'easy', GIVENS)

const requireEntry = (
  history: readonly HistoryEntry[],
  index = history.length - 1,
): HistoryEntry => {
  const entry = history[index]
  if (entry === undefined) throw new Error(`测试历史缺少索引 ${index}`)
  return entry
}

const requireChange = (
  changes: readonly CellChange[],
  index = 0,
): CellChange => {
  const change = changes[index]
  if (change === undefined) throw new Error(`测试 change 缺少索引 ${index}`)
  return change
}

const replaceChange = (
  entry: HistoryEntry,
  patch: Partial<CellChange>,
  index = 0,
): HistoryEntry => ({
  changes: entry.changes.map((change, changeIndex) =>
    changeIndex === index ? { ...change, ...patch } : { ...change },
  ),
})

describe('sudoku game', () => {
  describe('创建与严格输入验证', () => {
    it('从合法题面创建独立且完整的初始状态', () => {
      const game = createGame()

      expect(game).toMatchObject({
        puzzleId: 'easy-001',
        difficulty: 'easy',
        selectedIndex: 0,
        noteMode: false,
        elapsedMs: 0,
        status: 'playing',
      })
      expect(game.givens).toEqual(createBoardFromString(GIVENS))
      expect(game.values).toEqual(game.givens)
      expect(game.values).not.toBe(game.givens)
      expect(game.candidates).toEqual(Array.from({ length: 81 }, () => 0))
      expect(game.history).toEqual([])

      const mutableValues = game.values as CellValue[]
      mutableValues[2] = 9

      const anotherGame = createGame()
      expect(anotherGame.values[2]).toBeNull()
      expect(anotherGame.givens[2]).toBeNull()
    })

    it.each(['', ' ', '\t\n'])('拒绝空白 puzzleId %j', (puzzleId) => {
      expect(() => createSudokuGame(puzzleId, 'easy', GIVENS)).toThrowError(
        'Sudoku puzzle id must not be blank',
      )
    })

    it('拒绝不支持的难度', () => {
      expect(() =>
        createSudokuGame('puzzle', 'expert' as Difficulty, GIVENS),
      ).toThrowError('Sudoku difficulty must be easy, medium, or hard; received expert')
    })

    it('拒绝包含冲突或没有空格的给定题面', () => {
      const conflicting = `55${'0'.repeat(79)}`

      expect(() => createSudokuGame('conflict', 'easy', conflicting)).toThrowError(
        'Sudoku givens must not contain conflicts',
      )
      expect(() => createSudokuGame('solved', 'easy', SOLVED_BOARD)).toThrowError(
        'Sudoku givens must contain at least one empty cell',
      )
    })
  })

  describe('选择与移动', () => {
    it('选择格和候选模式切换不写入历史，无变化时复用原对象', () => {
      const game = createGame()
      const selected = selectCell(game, 40)
      const noteMode = toggleNoteMode(selected)

      expect(selectCell(game, 0)).toBe(game)
      expect(selected.selectedIndex).toBe(40)
      expect(selected.history).toHaveLength(0)
      expect(noteMode.noteMode).toBe(true)
      expect(noteMode.history).toHaveLength(0)
    })

    it.each([
      ['up', 31],
      ['down', 49],
      ['left', 39],
      ['right', 41],
      ['row-start', 36],
      ['row-end', 44],
    ] satisfies readonly (readonly [MoveDirection, number])[])(
      '%s 保持在棋盘或当前行内移动',
      (direction, expectedIndex) => {
        const game = selectCell(createGame(), 40)
        const moved = moveSelection(game, direction)

        expect(moved.selectedIndex).toBe(expectedIndex)
        expect(moved.history).toBe(game.history)
      },
    )

    it('在上下左右和行首行尾边界夹住，且左右不会跨行', () => {
      const first = createGame()
      const last = selectCell(first, 80)
      const rowStart = selectCell(first, 9)
      const rowEnd = selectCell(first, 8)

      for (const direction of ['up', 'left', 'row-start'] as const) {
        expect(moveSelection(first, direction)).toBe(first)
      }
      for (const direction of ['down', 'right', 'row-end'] as const) {
        expect(moveSelection(last, direction)).toBe(last)
      }
      expect(moveSelection(rowStart, 'left')).toBe(rowStart)
      expect(moveSelection(rowEnd, 'right')).toBe(rowEnd)
    })

    it('拒绝非法索引和运行时未知方向', () => {
      const game = createGame()

      for (const index of [-1, 81, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(() => selectCell(game, index)).toThrowError(
          `Cell index must be an integer between 0 and 80; received ${String(index)}`,
        )
      }
      expect(() => moveSelection(game, 'diagonal' as MoveDirection)).toThrowError(
        'Move direction must be up, down, left, right, row-start, or row-end; received diagonal',
      )
    })
  })

  describe('候选数、正式数字和擦除', () => {
    it('在空格上切换同一候选位，第二次输入会删除且各自可撤销', () => {
      const selected = selectCell(createGame(), 2)
      const noteMode = toggleNoteMode(selected)
      const added = enterDigit(noteMode, 4)
      const removed = enterDigit(added, 4)

      expect(added.candidates[2]).toBe(1 << 3)
      expect(added.values[2]).toBeNull()
      expect(added.history).toHaveLength(1)
      expect(removed.candidates[2]).toBe(0)
      expect(removed.history).toHaveLength(2)
      expect(undo(removed).candidates[2]).toBe(1 << 3)
    })

    it('填值格和给定格都不能添加候选，给定格也不能修改或擦除', () => {
      const given = toggleNoteMode(createGame())
      expect(enterDigit(given, 9)).toBe(given)
      expect(eraseSelected(given)).toBe(given)

      let filled = selectCell(createGame(), 2)
      filled = enterDigit(filled, 4)
      filled = toggleNoteMode(filled)

      expect(enterDigit(filled, 9)).toBe(filled)
      expect(filled.history).toHaveLength(1)
    })

    it('输入正式数字会清除关联候选，撤销原子恢复全部变化', () => {
      let game = selectCell(createGame(), 2)
      game = toggleNoteMode(game)
      game = enterDigit(game, 4)
      game = selectCell(game, 3)
      game = enterDigit(game, 4)
      game = toggleNoteMode(game)
      game = selectCell(game, 2)
      const entered = enterDigit(game, 4)

      expect(entered.values[2]).toBe(4)
      expect(entered.candidates[2]).toBe(0)
      expect(entered.candidates[3]).toBe(0)

      const entry = requireEntry(entered.history)
      expect(entry.changes.map(({ index }) => index)).toEqual([2, 3])
      expect(new Set(entry.changes.map(({ index }) => index)).size).toBe(
        entry.changes.length,
      )

      const restored = undo(entered)
      expect(restored.values[2]).toBeNull()
      expect(restored.candidates[2]).toBe(1 << 3)
      expect(restored.candidates[3]).toBe(1 << 3)
      expect(restored.selectedIndex).toBe(2)
      expect(restored.noteMode).toBe(false)
    })

    it('正式数字允许替换，但重复输入相同数字不产生历史', () => {
      const selected = selectCell(createGame(), 2)
      const first = enterDigit(selected, 4)
      const replaced = enterDigit(first, 5)

      expect(replaced.values[2]).toBe(5)
      expect(replaced.history).toHaveLength(2)
      expect(requireEntry(replaced.history).changes).toEqual([
        {
          index: 2,
          beforeValue: 4,
          afterValue: 5,
          beforeCandidates: 0,
          afterCandidates: 0,
        },
      ])
      expect(enterDigit(replaced, 5)).toBe(replaced)
    })

    it('允许保留冲突输入，状态仍为 playing', () => {
      const game = enterDigit(selectCell(createGame(), 2), 5)

      expect(game.values[2]).toBe(5)
      expect(game.status).toBe('playing')
      expect(game.history).toHaveLength(1)
    })

    it('擦除玩家数字或全部候选并记录单格完整变化', () => {
      const selected = selectCell(createGame(), 2)
      const filled = enterDigit(selected, 4)
      const erasedValue = eraseSelected(filled)

      expect(erasedValue.values[2]).toBeNull()
      expect(erasedValue.candidates[2]).toBe(0)
      expect(requireEntry(erasedValue.history).changes).toEqual([
        {
          index: 2,
          beforeValue: 4,
          afterValue: null,
          beforeCandidates: 0,
          afterCandidates: 0,
        },
      ])

      const noted = enterDigit(toggleNoteMode(selected), 4)
      const erasedCandidates = eraseSelected(noted)
      expect(erasedCandidates.candidates[2]).toBe(0)
      expect(requireEntry(erasedCandidates.history).changes).toEqual([
        {
          index: 2,
          beforeValue: null,
          afterValue: null,
          beforeCandidates: 1 << 3,
          afterCandidates: 0,
        },
      ])
      expect(eraseSelected(erasedCandidates)).toBe(erasedCandidates)
    })

    it.each([0, -1, 10, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
      '拒绝非法 digit %s',
      (digit) => {
        expect(() => enterDigit(createGame(), digit as Digit)).toThrowError(
          `Sudoku digit must be an integer between 1 and 9; received ${String(digit)}`,
        )
      },
    )
  })

  describe('完成状态与撤销', () => {
    it('仅在棋盘完整合法时完成，完成后新编辑无效但仍可选择查看', () => {
      const almostSolved = `0${SOLVED_BOARD.slice(1)}`
      const completed = enterDigit(
        createSudokuGame('almost-solved', 'hard', almostSolved),
        5,
      )

      expect(completed.status).toBe('completed')
      expect(enterDigit(completed, 4)).toBe(completed)
      expect(eraseSelected(completed)).toBe(completed)
      expect(toggleNoteMode(completed)).toBe(completed)

      const inspected = moveSelection(selectCell(completed, 1), 'right')
      expect(inspected.selectedIndex).toBe(2)
      expect(inspected.status).toBe('completed')

      const restored = undo(inspected)
      expect(restored.values[0]).toBeNull()
      expect(restored.status).toBe('playing')
      expect(restored.selectedIndex).toBe(2)
    })

    it('历史为空时撤销复用原对象，且撤销不改变模式和用时', () => {
      const initial = createGame()
      expect(undo(initial)).toBe(initial)

      let game = enterDigit(selectCell(initial, 2), 4)
      game = toggleNoteMode(game)
      game = withElapsedMs(game, 1234)
      const restored = undo(game)

      expect(restored.noteMode).toBe(true)
      expect(restored.elapsedMs).toBe(1234)
      expect(restored.history).toHaveLength(0)
    })

    it('撤销拒绝与当前格状态不匹配的历史 change', () => {
      const entered = enterDigit(selectCell(createGame(), 2), 4)
      const entry = requireEntry(entered.history)
      const malformedState: SudokuGameState = {
        ...entered,
        history: [replaceChange(entry, { afterValue: 9 })],
      }

      expect(() => undo(malformedState)).toThrowError(
        'Sudoku history change after state does not match current cell at index 2',
      )
    })
  })

  describe('重置、计时与不可变性', () => {
    it('重置当前题目并清除选择、模式、历史、计时和完成状态', () => {
      let game = enterDigit(selectCell(createGame(), 2), 4)
      game = toggleNoteMode(game)
      game = withElapsedMs(game, 9876)
      const reset = resetSudokuGame(game)

      expect(reset).toEqual(createGame())
      expect(reset.givens).not.toBe(game.givens)
      expect(reset.values).not.toBe(reset.givens)
      expect(reset.candidates).not.toBe(game.candidates)
      expect(reset.history).not.toBe(game.history)
    })

    it('只接受有限非负整数 elapsedMs，相同值复用对象且不修改历史', () => {
      const game = enterDigit(selectCell(createGame(), 2), 4)
      const updated = withElapsedMs(game, 1234)

      expect(updated.elapsedMs).toBe(1234)
      expect(updated.history).toBe(game.history)
      expect(withElapsedMs(updated, 1234)).toBe(updated)

      for (const elapsedMs of [
        -1,
        1234.5,
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
      ]) {
        expect(() => withElapsedMs(game, elapsedMs)).toThrowError(
          `Sudoku elapsed time must be a finite non-negative integer; received ${String(elapsedMs)}`,
        )
      }
    })

    it('状态转换不修改冻结的输入对象或数组', () => {
      const game = createGame()
      Object.freeze(game.givens)
      Object.freeze(game.values)
      Object.freeze(game.candidates)
      Object.freeze(game.history)
      Object.freeze(game)

      const changed = enterDigit(selectCell(game, 2), 4)

      expect(game.values[2]).toBeNull()
      expect(game.history).toEqual([])
      expect(changed.values[2]).toBe(4)
      expect(changed.values).not.toBe(game.values)
      expect(changed.candidates).toBe(game.candidates)
      expect(changed.history).not.toBe(game.history)
    })

    it('公开状态参数拒绝越界候选 mask，replay 的非法 initialState 会抛错', () => {
      const game = createGame()

      for (const mask of [-1, 512, 1.5, Number.NaN]) {
        const candidates = [...game.candidates]
        candidates[2] = mask as CandidateMask
        const malformed = { ...game, candidates }

        expect(() => selectCell(malformed, 2)).toThrowError(
          `Sudoku candidate mask at index 2 must be an integer between 0 and 511; received ${String(mask)}`,
        )
        expect(() => replaySudokuHistory(malformed, [])).toThrowError(
          `Sudoku candidate mask at index 2 must be an integer between 0 and 511; received ${String(mask)}`,
        )
      }
    })
  })

  describe('历史回放与防篡改', () => {
    const createReplayFixture = (): {
      readonly initial: SudokuGameState
      readonly final: SudokuGameState
      readonly firstEntry: HistoryEntry
    } => {
      const initial = createGame()
      let final = enterDigit(toggleNoteMode(selectCell(initial, 2)), 4)
      final = enterDigit(toggleNoteMode(final), 5)
      return { initial, final, firstEntry: requireEntry(final.history, 0) }
    }

    it('逐条回放合法历史并返回不共享可变历史数组的最终状态', () => {
      const { initial, final } = createReplayFixture()
      const externalHistory = final.history.map((entry) => ({
        changes: entry.changes.map((change) => ({ ...change })),
      }))
      const replayed = replaySudokuHistory(initial, externalHistory)

      expect(replayed).not.toBeNull()
      expect(replayed?.values).toEqual(final.values)
      expect(replayed?.candidates).toEqual(final.candidates)
      expect(replayed?.history).toEqual(externalHistory)
      expect(replayed?.history).not.toBe(externalHistory)
      expect(replayed?.history[0]).not.toBe(externalHistory[0])
      expect(replayed?.history[0]?.changes).not.toBe(externalHistory[0]?.changes)

      externalHistory.splice(0, externalHistory.length)
      expect(replayed?.history).toHaveLength(2)
    })

    it('拒绝空 changes、稀疏 changes、重复索引和非升序索引', () => {
      const { initial, final, firstEntry } = createReplayFixture()
      const secondEntry = requireEntry(final.history, 1)
      const firstChange = requireChange(firstEntry.changes)
      const secondChange = requireChange(secondEntry.changes)
      const sparseChanges = Array<CellChange>(1)

      expect(replaySudokuHistory(initial, [{ changes: [] }])).toBeNull()
      expect(replaySudokuHistory(initial, [{ changes: sparseChanges }])).toBeNull()
      expect(
        replaySudokuHistory(initial, [
          { changes: [{ ...firstChange }, { ...firstChange }] },
        ]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [
          { changes: [{ ...secondChange, index: 3 }, { ...firstChange }] },
        ]),
      ).toBeNull()
    })

    it('拒绝非法索引、before 不匹配、给定格变化和无效 no-op change', () => {
      const { initial, firstEntry } = createReplayFixture()
      const firstChange = requireChange(firstEntry.changes)

      expect(
        replaySudokuHistory(initial, [replaceChange(firstEntry, { index: 81 })]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [replaceChange(firstEntry, { beforeCandidates: 1 })]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [
          {
            changes: [
              {
                index: 0,
                beforeValue: 5,
                afterValue: 4,
                beforeCandidates: 0,
                afterCandidates: 0,
              },
            ],
          },
        ]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [
          {
            changes: [
              {
                ...firstChange,
                afterValue: firstChange.beforeValue,
                afterCandidates: firstChange.beforeCandidates,
              },
            ],
          },
        ]),
      ).toBeNull()
    })

    it('拒绝非法 value、非法 mask，以及有正式值却保留候选的 after 状态', () => {
      const { initial, firstEntry } = createReplayFixture()

      expect(
        replaySudokuHistory(initial, [
          replaceChange(firstEntry, { afterValue: 0 as CellValue }),
        ]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [replaceChange(firstEntry, { afterCandidates: 512 })]),
      ).toBeNull()
      expect(
        replaySudokuHistory(initial, [
          replaceChange(firstEntry, { afterValue: 4, afterCandidates: 1 }),
        ]),
      ).toBeNull()
    })

    it('拒绝在某条历史完成棋局后继续追加编辑', () => {
      const almostSolved = `0${SOLVED_BOARD.slice(1)}`
      const initial = createSudokuGame('almost-solved', 'hard', almostSolved)
      const completed = enterDigit(initial, 5)
      const tamperedHistory: readonly HistoryEntry[] = [
        ...completed.history,
        {
          changes: [
            {
              index: 0,
              beforeValue: 5,
              afterValue: 4,
              beforeCandidates: 0,
              afterCandidates: 0,
            },
          ],
        },
      ]

      expect(replaySudokuHistory(initial, completed.history)?.status).toBe('completed')
      expect(replaySudokuHistory(initial, tamperedHistory)).toBeNull()
    })
  })
})
