import {
  createSudokuGame,
  enterDigit,
  selectCell,
  toggleNoteMode,
  withElapsedMs,
} from '../core/game'
import type { Difficulty, SudokuGameState } from '../core/types'
import {
  builtinSudokuPuzzleProvider,
  type SudokuPuzzleProvider,
} from '../puzzles/provider'
import { decodeStoredSudoku, encodeStoredSudoku } from './schema'
import {
  ACTIVE_SUDOKU_STORAGE_KEY,
  RECENT_SUDOKU_STORAGE_KEY,
  SudokuStorage,
  createBrowserSudokuStorage,
  type StorageLike,
} from './storage'

interface MutableStoredChange {
  index: unknown
  beforeValue: unknown
  afterValue: unknown
  beforeCandidates: unknown
  afterCandidates: unknown
  unexpected?: unknown
}

interface MutableStoredEntry {
  changes: MutableStoredChange[]
  unexpected?: unknown
}

interface MutableStoredSudoku {
  version: unknown
  puzzleId: unknown
  difficulty: unknown
  values: unknown[]
  candidates: unknown[]
  selectedIndex: unknown
  noteMode: unknown
  history: MutableStoredEntry[]
  elapsedMs: unknown
  savedAt: unknown
  unexpected?: unknown
}

const serializeGivens = (givens: readonly (number | null)[]): string =>
  givens.map((value) => value ?? 0).join('')

function initialGame(difficulty: Difficulty = 'easy'): SudokuGameState {
  const puzzle = builtinSudokuPuzzleProvider
    .all()
    .find((candidate) => candidate.difficulty === difficulty)
  if (puzzle === undefined) throw new Error(`测试题库缺少 ${difficulty} 题目`)

  return createSudokuGame(
    puzzle.id,
    puzzle.difficulty,
    serializeGivens(puzzle.givens),
  )
}

function activeGame(difficulty: Difficulty = 'easy'): SudokuGameState {
  const puzzle = builtinSudokuPuzzleProvider
    .all()
    .find((candidate) => candidate.difficulty === difficulty)
  if (puzzle === undefined) throw new Error(`测试题库缺少 ${difficulty} 题目`)

  const emptyIndex = puzzle.givens.findIndex((value) => value === null)
  if (emptyIndex < 0) throw new Error('测试题目必须包含空格')

  let game = selectCell(
    createSudokuGame(
      puzzle.id,
      puzzle.difficulty,
      serializeGivens(puzzle.givens),
    ),
    emptyIndex,
  )
  game = enterDigit(game, puzzle.solution[emptyIndex] ?? 1)
  game = toggleNoteMode(game)
  return withElapsedMs(game, 12_345)
}

function completedGame(): SudokuGameState {
  const puzzle = builtinSudokuPuzzleProvider.all()[0]
  if (puzzle === undefined) throw new Error('测试题库不能为空')

  let game = createSudokuGame(
    puzzle.id,
    puzzle.difficulty,
    serializeGivens(puzzle.givens),
  )
  for (let index = 0; index < puzzle.givens.length; index += 1) {
    if (puzzle.givens[index] !== null) continue
    game = selectCell(game, index)
    game = enterDigit(game, puzzle.solution[index] ?? 1)
  }
  if (game.status !== 'completed') throw new Error('测试棋局应当完成')
  return game
}

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  getError: unknown = null
  setError: unknown = null
  removeError: unknown = null
  getCalls = 0
  setCalls = 0
  removeCalls = 0

  getItem(key: string): string | null {
    this.getCalls += 1
    if (this.getError !== null) throw this.getError
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1
    if (this.setError !== null) throw this.setError
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.removeCalls += 1
    if (this.removeError !== null) throw this.removeError
    this.values.delete(key)
  }
}

function mutableStored(game: SudokuGameState = activeGame()): MutableStoredSudoku {
  return structuredClone(encodeStoredSudoku(game, 98_765)) as MutableStoredSudoku
}

function deleteOwn(record: object, key: PropertyKey): void {
  if (!Reflect.deleteProperty(record, key)) {
    throw new Error(`测试无法删除字段 ${String(key)}`)
  }
}

describe('sudoku storage schema', () => {
  it('严格编码并从 provider 重建、重放有效活动棋局', () => {
    const game = activeGame()
    const encoded = encodeStoredSudoku(game, 98_765)

    expect(encoded).toEqual({
      version: 1,
      puzzleId: game.puzzleId,
      difficulty: game.difficulty,
      values: game.values,
      candidates: game.candidates,
      selectedIndex: game.selectedIndex,
      noteMode: game.noteMode,
      history: game.history,
      elapsedMs: game.elapsedMs,
      savedAt: 98_765,
    })
    expect(encoded.values).not.toBe(game.values)
    expect(encoded.candidates).not.toBe(game.candidates)
    expect(encoded.history).not.toBe(game.history)
    expect(encoded.history[0]).not.toBe(game.history[0])
    expect(encoded.history[0]?.changes).not.toBe(game.history[0]?.changes)

    const decoded = decodeStoredSudoku(encoded, builtinSudokuPuzzleProvider)
    expect(decoded).toEqual({ game, savedAt: 98_765 })
    expect(decoded?.game).not.toBe(game)
    expect(decoded?.game.givens).not.toBe(game.givens)
    expect(decoded?.game.values).not.toBe(encoded.values)
    expect(decoded?.game.candidates).not.toBe(encoded.candidates)
    expect(decoded?.game.history).not.toBe(encoded.history)
    expect(decoded?.game.history[0]).not.toBe(encoded.history[0])
    expect(decoded?.game.history[0]?.changes).not.toBe(encoded.history[0]?.changes)
  })

  it.each([
    { level: '顶层', mutate: (stored: MutableStoredSudoku) => (stored.unexpected = true) },
    {
      level: 'history entry',
      mutate: (stored: MutableStoredSudoku) => (stored.history[0] = { ...stored.history[0], unexpected: true }),
    },
    {
      level: 'history change',
      mutate: (stored: MutableStoredSudoku) => {
        const entry = stored.history[0]
        if (entry === undefined) throw new Error('活动存档必须包含历史')
        entry.changes[0] = { ...entry.changes[0], unexpected: true }
      },
    },
  ])('拒绝 $level 未知字段', ({ mutate }) => {
    const stored = mutableStored()
    mutate(stored)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { field: '顶层 savedAt', mutate: (stored: MutableStoredSudoku) => deleteOwn(stored, 'savedAt') },
    {
      field: 'entry changes',
      mutate: (stored: MutableStoredSudoku) => {
        const entry = stored.history[0]
        if (entry === undefined) throw new Error('活动存档必须包含历史')
        deleteOwn(entry, 'changes')
      },
    },
    {
      field: 'change afterCandidates',
      mutate: (stored: MutableStoredSudoku) => {
        const change = stored.history[0]?.changes[0]
        if (change === undefined) throw new Error('活动存档必须包含变更')
        deleteOwn(change, 'afterCandidates')
      },
    },
  ])('拒绝缺少 $field', ({ mutate }) => {
    const stored = mutableStored()
    mutate(stored)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { name: 'null 顶层', value: null },
    { name: '数组顶层', value: [] },
    { name: 'null entry', value: null },
    { name: '数组 entry', value: [] },
    { name: 'null change', value: null },
    { name: '数组 change', value: [] },
  ])('拒绝 $name', ({ name, value }) => {
    if (name.includes('顶层')) {
      expect(decodeStoredSudoku(value, builtinSudokuPuzzleProvider)).toBeNull()
      return
    }

    const stored = mutableStored()
    if (name.includes('entry')) Reflect.set(stored.history, 0, value)
    else {
      const entry = stored.history[0]
      if (entry === undefined) throw new Error('活动存档必须包含历史')
      Reflect.set(entry.changes, 0, value)
    }
    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each(['values', 'candidates', 'history'] as const)('拒绝稀疏 $field', (field) => {
    const stored = mutableStored()
    deleteOwn(stored[field], 0)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it('拒绝稀疏 changes', () => {
    const stored = mutableStored()
    const changes = stored.history[0]?.changes
    if (changes === undefined) throw new Error('活动存档必须包含变更')
    deleteOwn(changes, 0)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { name: 'values 长度错误', mutate: (stored: MutableStoredSudoku) => stored.values.pop() },
    { name: 'candidates 长度错误', mutate: (stored: MutableStoredSudoku) => stored.candidates.push(0) },
    { name: '空 history', mutate: (stored: MutableStoredSudoku) => (stored.history = []) },
    {
      name: '空 changes',
      mutate: (stored: MutableStoredSudoku) => {
        const entry = stored.history[0]
        if (entry === undefined) throw new Error('活动存档必须包含历史')
        entry.changes = []
      },
    },
  ])('拒绝 $name', ({ mutate }) => {
    const stored = mutableStored()
    mutate(stored)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { name: 'version', field: 'version', value: 2 },
    { name: '空 puzzleId', field: 'puzzleId', value: '' },
    { name: 'difficulty', field: 'difficulty', value: 'expert' },
    { name: 'selectedIndex', field: 'selectedIndex', value: 81 },
    { name: 'noteMode', field: 'noteMode', value: 1 },
    { name: 'elapsedMs 小数', field: 'elapsedMs', value: 1.5 },
    { name: 'elapsedMs Infinity', field: 'elapsedMs', value: Number.POSITIVE_INFINITY },
    { name: 'savedAt 负数', field: 'savedAt', value: -1 },
    { name: 'savedAt NaN', field: 'savedAt', value: Number.NaN },
  ])('拒绝非法 $name', ({ field, value }) => {
    const stored = mutableStored()
    Reflect.set(stored, field, value)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { name: 'value=0', field: 'values', value: 0 },
    { name: 'value=10', field: 'values', value: 10 },
    { name: 'value=1.5', field: 'values', value: 1.5 },
    { name: 'mask=-1', field: 'candidates', value: -1 },
    { name: 'mask=512', field: 'candidates', value: 512 },
    { name: 'mask=1.5', field: 'candidates', value: 1.5 },
  ])('拒绝非法 $name', ({ field, value }) => {
    const stored = mutableStored()
    const target = field === 'values' ? stored.values : stored.candidates
    target[0] = value

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it.each([
    { name: 'change index', field: 'index', value: 81 },
    { name: 'change beforeValue', field: 'beforeValue', value: 0 },
    { name: 'change afterValue', field: 'afterValue', value: 10 },
    { name: 'change beforeCandidates', field: 'beforeCandidates', value: -1 },
    { name: 'change afterCandidates', field: 'afterCandidates', value: 512 },
  ])('拒绝非法 $name', ({ field, value }) => {
    const stored = mutableStored()
    const change = stored.history[0]?.changes[0]
    if (change === undefined) throw new Error('活动存档必须包含变更')
    Reflect.set(change, field, value)

    expect(decodeStoredSudoku(stored, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it('拒绝未知 puzzleId 与 provider 难度不匹配', () => {
    const unknown = mutableStored()
    unknown.puzzleId = 'easy-999'
    expect(decodeStoredSudoku(unknown, builtinSudokuPuzzleProvider)).toBeNull()

    const mismatch = mutableStored()
    mismatch.difficulty = 'hard'
    expect(decodeStoredSudoku(mismatch, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it('拒绝 before 不符、非法语义、快照不符及 history 与快照共同篡改', () => {
    const beforeMismatch = mutableStored()
    const beforeChange = beforeMismatch.history[0]?.changes[0]
    if (beforeChange === undefined) throw new Error('活动存档必须包含变更')
    beforeChange.beforeValue = 9
    expect(decodeStoredSudoku(beforeMismatch, builtinSudokuPuzzleProvider)).toBeNull()

    const semanticForgery = mutableStored()
    const semanticChange = semanticForgery.history[0]?.changes[0]
    if (semanticChange === undefined || typeof semanticChange.index !== 'number') {
      throw new Error('活动存档必须包含变更')
    }
    semanticChange.afterValue = null
    semanticChange.afterCandidates = 3
    semanticForgery.values[semanticChange.index] = null
    semanticForgery.candidates[semanticChange.index] = 3
    expect(decodeStoredSudoku(semanticForgery, builtinSudokuPuzzleProvider)).toBeNull()

    const snapshotMismatch = mutableStored()
    const changedIndex = snapshotMismatch.history[0]?.changes[0]?.index
    if (typeof changedIndex !== 'number') throw new Error('活动存档必须包含数值索引')
    snapshotMismatch.values[changedIndex] = null
    expect(decodeStoredSudoku(snapshotMismatch, builtinSudokuPuzzleProvider)).toBeNull()

    const jointlyForged = mutableStored()
    const forgedEntry = jointlyForged.history[0]
    const forgedChange = forgedEntry?.changes[0]
    if (forgedEntry === undefined || forgedChange === undefined) {
      throw new Error('活动存档必须包含变更')
    }
    const puzzle = builtinSudokuPuzzleProvider.getById(String(jointlyForged.puzzleId))
    if (puzzle === null) throw new Error('活动存档题目必须存在')
    const secondIndex = puzzle.givens.findIndex(
      (value, index) => value === null && index !== forgedChange.index,
    )
    const secondDigit = puzzle.solution[secondIndex]
    if (secondIndex < 0 || secondDigit === undefined) {
      throw new Error('测试题目必须包含第二个空格')
    }
    forgedEntry.changes.push({
      index: secondIndex,
      beforeValue: null,
      afterValue: secondDigit,
      beforeCandidates: 0,
      afterCandidates: 0,
    })
    forgedEntry.changes.sort((left, right) => Number(left.index) - Number(right.index))
    jointlyForged.values[secondIndex] = secondDigit
    expect(decodeStoredSudoku(jointlyForged, builtinSudokuPuzzleProvider)).toBeNull()
  })

  it('拒绝回放完成态但接受无历史的进行中初态', () => {
    const completed = completedGame()

    const completedStored = {
      version: 1,
      puzzleId: completed.puzzleId,
      difficulty: completed.difficulty,
      values: completed.values,
      candidates: completed.candidates,
      selectedIndex: completed.selectedIndex,
      noteMode: completed.noteMode,
      history: completed.history,
      elapsedMs: completed.elapsedMs,
      savedAt: 1,
    }
    expect(decodeStoredSudoku(completedStored, builtinSudokuPuzzleProvider)).toBeNull()

    const initial = initialGame()
    const initialStored = {
      version: 1,
      puzzleId: initial.puzzleId,
      difficulty: initial.difficulty,
      values: initial.values,
      candidates: initial.candidates,
      selectedIndex: initial.selectedIndex,
      noteMode: initial.noteMode,
      history: initial.history,
      elapsedMs: initial.elapsedMs,
      savedAt: 1,
    }
    expect(decodeStoredSudoku(initialStored, builtinSudokuPuzzleProvider)).toEqual({
      game: initial,
      savedAt: 1,
    })

    const forgedValues = [...initial.values]
    const emptyIndex = forgedValues.findIndex((value) => value === null)
    if (emptyIndex < 0) throw new Error('测试初态必须包含空格')
    forgedValues[emptyIndex] = 1
    expect(decodeStoredSudoku(
      { ...initialStored, values: forgedValues },
      builtinSudokuPuzzleProvider,
    )).toBeNull()
  })

  it('encode 接受进行中初态，并对非法 savedAt、完成态和被篡改状态抛出清晰错误', () => {
    expect(() => encodeStoredSudoku(activeGame(), -1)).toThrow(/savedAt/)
    expect(encodeStoredSudoku(initialGame(), 1)).toMatchObject({ history: [] })
    expect(() => encodeStoredSudoku(completedGame(), 1)).toThrow(/active/)

    const invalid = { ...activeGame(), elapsedMs: -1 }
    expect(() => encodeStoredSudoku(invalid, 1)).toThrow(/elapsed/i)

    const provider: SudokuPuzzleProvider = {
      getById: () => null,
      next: (difficulty) => builtinSudokuPuzzleProvider.next(difficulty, null),
      all: () => [],
    }
    expect(decodeStoredSudoku(encodeStoredSudoku(activeGame(), 1), provider)).toBeNull()
  })
})

describe('SudokuStorage active game', () => {
  it('无活动记录时返回 empty', () => {
    const backing = new MemoryStorage()

    expect(new SudokuStorage(backing).load()).toEqual({ kind: 'empty' })
    expect(backing.getCalls).toBe(1)
  })

  it('以固定 key 保存并加载有效活动棋局及 savedAt', () => {
    const backing = new MemoryStorage()
    const storage = new SudokuStorage(backing)
    const game = activeGame()

    expect(storage.save(game, 88_000)).toEqual({ ok: true })
    expect(backing.setCalls).toBe(1)
    expect(backing.values.has(ACTIVE_SUDOKU_STORAGE_KEY)).toBe(true)
    expect(storage.load()).toEqual({ kind: 'loaded', game, savedAt: 88_000 })
  })

  it('保存并加载无历史的进行中初态以保留当前题目标识', () => {
    const backing = new MemoryStorage()
    const storage = new SudokuStorage(backing)
    const game = initialGame()

    expect(storage.save(game, 77_000)).toEqual({ ok: true })
    expect(backing.setCalls).toBe(1)
    expect(backing.removeCalls).toBe(0)
    expect(storage.load()).toEqual({ kind: 'loaded', game, savedAt: 77_000 })
  })

  it.each([
    { name: '损坏 JSON', serialized: '{' },
    { name: 'schema invalid', serialized: JSON.stringify({ version: 1 }) },
  ])('$name 会清除活动键并返回 invalid', ({ serialized }) => {
    const backing = new MemoryStorage()
    backing.values.set(ACTIVE_SUDOKU_STORAGE_KEY, serialized)

    expect(new SudokuStorage(backing).load()).toEqual({ kind: 'invalid' })
    expect(backing.removeCalls).toBe(1)
    expect(backing.values.has(ACTIVE_SUDOKU_STORAGE_KEY)).toBe(false)
  })

  it.each([
    { name: '损坏 JSON', serialized: '{' },
    { name: 'schema invalid', serialized: JSON.stringify({ version: 1 }) },
  ])('$name 清除失败时返回 unavailable', ({ serialized }) => {
    const backing = new MemoryStorage()
    backing.values.set(ACTIVE_SUDOKU_STORAGE_KEY, serialized)
    backing.removeError = new Error('blocked')

    expect(new SudokuStorage(backing).load()).toEqual({ kind: 'unavailable' })
    expect(backing.removeCalls).toBe(1)
  })

  it('getItem 抛错时 load 返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.getError = new Error('blocked')

    expect(new SudokuStorage(backing).load()).toEqual({ kind: 'unavailable' })
  })

  it('setItem 抛错时 save 返回 ok=false', () => {
    const backing = new MemoryStorage()
    backing.setError = new Error('blocked')

    expect(new SudokuStorage(backing).save(activeGame(), 1)).toEqual({ ok: false })
  })

  it('完成棋局的 save 只清除活动键且不 set', () => {
    const backing = new MemoryStorage()
    backing.values.set(ACTIVE_SUDOKU_STORAGE_KEY, 'old')

    expect(new SudokuStorage(backing).save(completedGame(), 1)).toEqual({ ok: true })
    expect(backing.removeCalls).toBe(1)
    expect(backing.setCalls).toBe(0)
    expect(backing.values.has(ACTIVE_SUDOKU_STORAGE_KEY)).toBe(false)
  })

  it('完成棋局清理型 save 的 removeItem 失败时返回 ok=false', () => {
    const backing = new MemoryStorage()
    backing.removeError = new Error('blocked')

    expect(new SudokuStorage(backing).save(completedGame(), 1)).toEqual({ ok: false })
    expect(backing.setCalls).toBe(0)
  })

  it('clear 删除固定 key，removeItem 异常时返回 ok=false', () => {
    const backing = new MemoryStorage()
    backing.values.set(ACTIVE_SUDOKU_STORAGE_KEY, 'old')
    const storage = new SudokuStorage(backing)

    expect(storage.clear()).toEqual({ ok: true })
    expect(backing.values.has(ACTIVE_SUDOKU_STORAGE_KEY)).toBe(false)

    backing.removeError = new Error('blocked')
    expect(storage.clear()).toEqual({ ok: false })
  })

  it('非法活动状态的程序员错误不会被 storage 吞掉', () => {
    const backing = new MemoryStorage()
    const invalid = { ...activeGame(), elapsedMs: -1 }

    expect(() => new SudokuStorage(backing).save(invalid, 1)).toThrow(/elapsed/i)
    expect(backing.setCalls).toBe(0)
  })
})

describe('SudokuStorage recent puzzles', () => {
  it('三种难度独立保存并保留其他难度记录', () => {
    const backing = new MemoryStorage()
    const storage = new SudokuStorage(backing)
    const ids = Object.fromEntries(
      (['easy', 'medium', 'hard'] as const).map((difficulty) => {
        const puzzle = builtinSudokuPuzzleProvider
          .all()
          .find((candidate) => candidate.difficulty === difficulty)
        if (puzzle === undefined) throw new Error(`测试题库缺少 ${difficulty} 题目`)
        return [difficulty, puzzle.id]
      }),
    )

    expect(storage.savePreviousPuzzleId('easy', ids.easy)).toEqual({ ok: true })
    expect(storage.savePreviousPuzzleId('medium', ids.medium)).toEqual({ ok: true })
    expect(storage.savePreviousPuzzleId('hard', ids.hard)).toEqual({ ok: true })

    expect(JSON.parse(backing.values.get(RECENT_SUDOKU_STORAGE_KEY) ?? 'null')).toEqual({
      version: 1,
      easy: ids.easy,
      medium: ids.medium,
      hard: ids.hard,
    })
    expect(storage.loadPreviousPuzzleId('easy')).toBe(ids.easy)
    expect(storage.loadPreviousPuzzleId('medium')).toBe(ids.medium)
    expect(storage.loadPreviousPuzzleId('hard')).toBe(ids.hard)
  })

  it('无 recent 记录或对应难度为 null 时返回 null', () => {
    const backing = new MemoryStorage()
    const storage = new SudokuStorage(backing)

    expect(storage.loadPreviousPuzzleId('easy')).toBeNull()
    backing.values.set(
      RECENT_SUDOKU_STORAGE_KEY,
      JSON.stringify({ version: 1, easy: null, medium: null, hard: null }),
    )
    expect(storage.loadPreviousPuzzleId('hard')).toBeNull()
  })

  it.each([
    { name: '损坏 JSON', value: '{' },
    { name: 'null', value: 'null' },
    {
      name: '未知字段',
      value: JSON.stringify({ version: 1, easy: null, medium: null, hard: null, extra: true }),
    },
    {
      name: '缺少字段',
      value: JSON.stringify({ version: 1, easy: null, medium: null }),
    },
    {
      name: '非法 ID',
      value: JSON.stringify({ version: 1, easy: '', medium: null, hard: null }),
    },
    {
      name: '未知 ID',
      value: JSON.stringify({ version: 1, easy: 'easy-999', medium: null, hard: null }),
    },
    {
      name: '难度不匹配',
      value: JSON.stringify({ version: 1, easy: initialGame('hard').puzzleId, medium: null, hard: null }),
    },
  ])('$name 返回 null 并尝试清理 recent key', ({ value }) => {
    const backing = new MemoryStorage()
    backing.values.set(RECENT_SUDOKU_STORAGE_KEY, value)

    expect(new SudokuStorage(backing).loadPreviousPuzzleId('easy')).toBeNull()
    expect(backing.removeCalls).toBe(1)
    expect(backing.values.has(RECENT_SUDOKU_STORAGE_KEY)).toBe(false)
  })

  it('recent 损坏后的 removeItem 失败仍只返回 null', () => {
    const backing = new MemoryStorage()
    backing.values.set(RECENT_SUDOKU_STORAGE_KEY, '{')
    backing.removeError = new Error('blocked')

    expect(new SudokuStorage(backing).loadPreviousPuzzleId('easy')).toBeNull()
    expect(backing.removeCalls).toBe(1)
  })

  it('保存时拒绝 provider 未知或难度不匹配的 puzzleId', () => {
    const backing = new MemoryStorage()
    const storage = new SudokuStorage(backing)

    expect(storage.savePreviousPuzzleId('easy', 'easy-999')).toEqual({ ok: false })
    expect(storage.savePreviousPuzzleId('easy', initialGame('hard').puzzleId)).toEqual({ ok: false })
    expect(backing.getCalls).toBe(0)
    expect(backing.setCalls).toBe(0)
  })

  it('保存遇到损坏旧记录时以空的严格记录重建', () => {
    const backing = new MemoryStorage()
    backing.values.set(RECENT_SUDOKU_STORAGE_KEY, '{')
    const mediumId = initialGame('medium').puzzleId

    expect(new SudokuStorage(backing).savePreviousPuzzleId('medium', mediumId)).toEqual({ ok: true })
    expect(JSON.parse(backing.values.get(RECENT_SUDOKU_STORAGE_KEY) ?? 'null')).toEqual({
      version: 1,
      easy: null,
      medium: mediumId,
      hard: null,
    })
  })

  it('recent getItem 抛错时 load 返回 null、save 返回 ok=false', () => {
    const backing = new MemoryStorage()
    backing.getError = new Error('blocked')
    const storage = new SudokuStorage(backing)

    expect(storage.loadPreviousPuzzleId('easy')).toBeNull()
    expect(storage.savePreviousPuzzleId('easy', initialGame().puzzleId)).toEqual({ ok: false })
  })

  it('recent setItem 抛错时 save 返回 ok=false', () => {
    const backing = new MemoryStorage()
    backing.setError = new Error('blocked')

    expect(
      new SudokuStorage(backing).savePreviousPuzzleId('easy', initialGame().puzzleId),
    ).toEqual({ ok: false })
  })
})

function withLocalStorageDescriptor(
  getter: () => StorageLike | null | undefined,
  action: () => void,
): void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  if (descriptor !== undefined && !descriptor.configurable) {
    throw new Error('NEEDS_CONTEXT: window.localStorage 自有属性不可配置')
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get: getter,
  })

  try {
    action()
  } finally {
    if (descriptor !== undefined) {
      Object.defineProperty(window, 'localStorage', descriptor)
    } else if (!Reflect.deleteProperty(window, 'localStorage')) {
      throw new Error('无法恢复 window.localStorage')
    }
  }
}

function expectUnavailablePort(storage: ReturnType<typeof createBrowserSudokuStorage>): void {
  expect(storage.load()).toEqual({ kind: 'unavailable' })
  expect(storage.save(activeGame(), 1)).toEqual({ ok: false })
  expect(storage.clear()).toEqual({ ok: false })
  expect(storage.loadPreviousPuzzleId('easy')).toBeNull()
  expect(storage.savePreviousPuzzleId('easy', initialGame().puzzleId)).toEqual({ ok: false })
}

describe('createBrowserSudokuStorage', () => {
  it('SSR 中 window 不存在时返回稳定 unavailable port', () => {
    vi.stubGlobal('window', undefined)
    try {
      const storage = createBrowserSudokuStorage()
      expectUnavailablePort(storage)
      expectUnavailablePort(storage)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('window.localStorage getter 抛错时只访问一次并返回稳定 unavailable port', () => {
    let reads = 0
    withLocalStorageDescriptor(
      () => {
        reads += 1
        throw new Error('blocked')
      },
      () => {
        const storage = createBrowserSudokuStorage()
        expectUnavailablePort(storage)
        expectUnavailablePort(storage)
      },
    )
    expect(reads).toBe(1)
  })

  it('window.localStorage 不存在时返回稳定 unavailable port', () => {
    let reads = 0
    withLocalStorageDescriptor(
      () => {
        reads += 1
        return undefined
      },
      () => expectUnavailablePort(createBrowserSudokuStorage()),
    )
    expect(reads).toBe(1)
  })

  it('正常浏览器环境只读取一次 getter 并创建可用端口', () => {
    const backing = new MemoryStorage()
    let reads = 0
    withLocalStorageDescriptor(
      () => {
        reads += 1
        return backing
      },
      () => {
        const storage = createBrowserSudokuStorage()
        expect(storage.save(activeGame(), 123)).toEqual({ ok: true })
        expect(storage.load()).toMatchObject({ kind: 'loaded', savedAt: 123 })
      },
    )
    expect(reads).toBe(1)
  })
})
