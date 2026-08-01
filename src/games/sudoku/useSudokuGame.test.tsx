import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'
import { vi } from 'vitest'

import { createSudokuGame, enterDigit, selectCell } from './core/game'
import type { Difficulty, SudokuGameState } from './core/types'
import type { SudokuPuzzle, SudokuPuzzleProvider } from './puzzles/provider'
import type { SudokuLoadResult, SudokuStoragePort } from './storage/storage'
import { useSudokuGame, type SudokuClock } from './useSudokuGame'

const EASY_PUZZLE: SudokuPuzzle = {
  id: 'easy-test-1',
  difficulty: 'easy',
  givens: [
    5, 3, null, null, 7, null, null, null, null,
    6, null, null, 1, 9, 5, null, null, null,
    null, 9, 8, null, null, null, null, 6, null,
    8, null, null, null, 6, null, null, null, 3,
    4, null, null, 8, null, 3, null, null, 1,
    7, null, null, null, 2, null, null, null, 6,
    null, 6, null, null, null, null, 2, 8, null,
    null, null, null, 4, 1, 9, null, null, 5,
    null, null, null, null, 8, null, null, 7, 9,
  ],
  solution: [
    5, 3, 4, 6, 7, 8, 9, 1, 2,
    6, 7, 2, 1, 9, 5, 3, 4, 8,
    1, 9, 8, 3, 4, 2, 5, 6, 7,
    8, 5, 9, 7, 6, 1, 4, 2, 3,
    4, 2, 6, 8, 5, 3, 7, 9, 1,
    7, 1, 3, 9, 2, 4, 8, 5, 6,
    9, 6, 1, 5, 3, 7, 2, 8, 4,
    2, 8, 7, 4, 1, 9, 6, 3, 5,
    3, 4, 5, 2, 8, 6, 1, 7, 9,
  ],
}

const SECOND_EASY_PUZZLE: SudokuPuzzle = {
  ...EASY_PUZZLE,
  id: 'easy-test-2',
}

const MEDIUM_PUZZLE: SudokuPuzzle = {
  ...EASY_PUZZLE,
  id: 'medium-test-1',
  difficulty: 'medium',
}

class FakeStorage implements SudokuStoragePort {
  loadCalls = 0
  clearCalls = 0
  readonly saved: Array<{ readonly game: SudokuGameState; readonly savedAt: number }> = []
  readonly recentLoaded: Difficulty[] = []
  readonly recentSaved: Array<{ readonly difficulty: Difficulty; readonly puzzleId: string }> = []
  saveOk = true
  clearOk = true
  recentSaveOk = true

  constructor(
    readonly loadResult: SudokuLoadResult = { kind: 'empty' },
    readonly recent: Partial<Record<Difficulty, string | null>> = {},
  ) {}

  load(): SudokuLoadResult {
    this.loadCalls += 1
    return this.loadResult
  }

  save(game: SudokuGameState, savedAt: number): { readonly ok: boolean } {
    this.saved.push({ game, savedAt })
    return { ok: this.saveOk }
  }

  clear(): { readonly ok: boolean } {
    this.clearCalls += 1
    return { ok: this.clearOk }
  }

  loadPreviousPuzzleId(difficulty: Difficulty): string | null {
    this.recentLoaded.push(difficulty)
    return this.recent[difficulty] ?? null
  }

  savePreviousPuzzleId(
    difficulty: Difficulty,
    puzzleId: string,
  ): { readonly ok: boolean } {
    this.recentSaved.push({ difficulty, puzzleId })
    return { ok: this.recentSaveOk }
  }
}

class FakePuzzles implements SudokuPuzzleProvider {
  readonly nextCalls: Array<{
    readonly difficulty: Difficulty
    readonly previousId: string | null
  }> = []

  constructor(private readonly puzzle: SudokuPuzzle = EASY_PUZZLE) {}

  getById(): SudokuPuzzle | null {
    return EASY_PUZZLE
  }

  next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle {
    this.nextCalls.push({ difficulty, previousId })
    return this.puzzle
  }

  all(): readonly SudokuPuzzle[] {
    return [EASY_PUZZLE]
  }
}

class QueuePuzzles implements SudokuPuzzleProvider {
  readonly nextCalls: Array<{
    readonly difficulty: Difficulty
    readonly previousId: string | null
  }> = []
  private nextIndex = 0

  constructor(private readonly puzzles: readonly SudokuPuzzle[]) {}

  getById(id: string): SudokuPuzzle | null {
    return this.puzzles.find((puzzle) => puzzle.id === id) ?? null
  }

  next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle {
    this.nextCalls.push({ difficulty, previousId })
    const puzzle = this.puzzles[this.nextIndex]
    if (puzzle === undefined) throw new Error('测试题目队列已耗尽')
    this.nextIndex += 1
    return puzzle
  }

  all(): readonly SudokuPuzzle[] {
    return this.puzzles
  }
}

const idleClock: SudokuClock = {
  now: () => 0,
  setInterval: () => 1,
  clearInterval: () => undefined,
}

class FakeClock implements SudokuClock {
  private currentNow = 0
  private nextTimerId = 1
  private readonly timers = new Map<number, {
    readonly callback: () => void
    readonly intervalMs: number
    nextAt: number
  }>()
  readonly createdTimerIds: number[] = []
  readonly clearedTimerIds: number[] = []

  now(): number {
    return this.currentNow
  }

  setInterval(callback: () => void, intervalMs: number): number {
    const timerId = this.nextTimerId
    this.nextTimerId += 1
    this.timers.set(timerId, {
      callback,
      intervalMs,
      nextAt: this.currentNow + intervalMs,
    })
    this.createdTimerIds.push(timerId)
    return timerId
  }

  clearInterval(timerId: number): void {
    this.timers.delete(timerId)
    this.clearedTimerIds.push(timerId)
  }

  advance(ms: number): void {
    const target = this.currentNow + ms
    while (true) {
      let dueAt = Number.POSITIVE_INFINITY
      for (const timer of this.timers.values()) dueAt = Math.min(dueAt, timer.nextAt)
      if (dueAt > target) break

      this.currentNow = dueAt
      const dueTimers = [...this.timers.entries()]
        .filter(([, timer]) => timer.nextAt === dueAt)
      for (const [timerId, timer] of dueTimers) {
        timer.callback()
        const activeTimer = this.timers.get(timerId)
        if (activeTimer !== undefined) activeTimer.nextAt += activeTimer.intervalMs
      }
    }
    this.currentNow = target
  }

  jump(ms: number): void {
    this.currentNow += ms
  }

  setNow(now: number): void {
    this.currentNow = now
  }

  fireIntervalsOnce(): void {
    for (const timer of [...this.timers.values()]) timer.callback()
  }

  get activeTimerCount(): number {
    return this.timers.size
  }
}

function installVisibility(initial: DocumentVisibilityState): {
  readonly set: (visibility: DocumentVisibilityState) => void
  readonly restore: () => void
} {
  const original = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  let visibility = initial
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  })
  return {
    set(nextVisibility): void {
      visibility = nextVisibility
      document.dispatchEvent(new Event('visibilitychange'))
    },
    restore(): void {
      if (original === undefined) Reflect.deleteProperty(document, 'visibilityState')
      else Object.defineProperty(document, 'visibilityState', original)
    },
  }
}

describe('useSudokuGame', () => {
  it('无存档时只初始化一次 easy 新题并记录最近题目', () => {
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()

    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    expect(result.current.game.puzzleId).toBe(EASY_PUZZLE.id)
    expect(result.current.game.difficulty).toBe('easy')
    expect(result.current.elapsedMs).toBe(0)
    expect(result.current.notice).toBeNull()
    expect(storage.loadCalls).toBe(1)
    expect(puzzles.nextCalls).toEqual([{ difficulty: 'easy', previousId: null }])
    expect(storage.recentSaved).toEqual([
      { difficulty: 'easy', puzzleId: EASY_PUZZLE.id },
    ])
  })

  it('有效存档直接恢复且不抽取新题', () => {
    let savedGame = createSudokuGame(
      EASY_PUZZLE.id,
      'easy',
      EASY_PUZZLE.givens.map((value) => value ?? 0).join(''),
    )
    savedGame = enterDigit(selectCell(savedGame, 2), 4)
    const storage = new FakeStorage({ kind: 'loaded', game: savedGame, savedAt: 100 })
    const puzzles = new FakePuzzles()

    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    expect(result.current.game).toBe(savedGame)
    expect(storage.loadCalls).toBe(1)
    expect(storage.recentLoaded).toEqual([])
    expect(storage.recentSaved).toEqual([])
    expect(puzzles.nextCalls).toEqual([])
  })

  it.each([
    ['invalid', '旧数独进度无法恢复，已开始新题。'],
    ['unavailable', '自动保存不可用，本局仍可继续。'],
  ] as const)('%s 时开始 easy 新题并显示稳定提示', (kind, notice) => {
    const storage = new FakeStorage({ kind })

    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    expect(result.current.game.puzzleId).toBe(EASY_PUZZLE.id)
    expect(result.current.notice).toBe(notice)
  })

  it('初始 recent 保存失败时优先显示自动保存不可用提示', () => {
    const storage = new FakeStorage({ kind: 'invalid' })
    storage.recentSaveOk = false

    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })

  it('StrictMode effect replay 不重复 load、抽题或保存 recent', () => {
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )

    renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }), { wrapper })

    expect(storage.loadCalls).toBe(1)
    expect(puzzles.nextCalls).toHaveLength(1)
    expect(storage.recentSaved).toHaveLength(1)
  })

  it('真实卸载后重挂的实例各初始化一次', () => {
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()
    const first = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    first.unmount()
    renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    expect(storage.loadCalls).toBe(2)
    expect(puzzles.nextCalls).toHaveLength(2)
    expect(storage.recentSaved).toHaveLength(2)
  })

  it('选择与移动只在发生变化时更新并保存', () => {
    const storage = new FakeStorage()
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    act(() => result.current.select(2))
    expect(result.current.game.selectedIndex).toBe(2)
    expect(storage.saved).toHaveLength(1)

    act(() => result.current.select(2))
    expect(storage.saved).toHaveLength(1)

    act(() => result.current.move('right'))
    expect(result.current.game.selectedIndex).toBe(3)
    expect(storage.saved).toHaveLength(2)
  })

  it('给定格输入是 no-op，普通输入、擦除与撤销复用核心状态机', () => {
    const storage = new FakeStorage()
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    act(() => result.current.enter(9))
    expect(result.current.game.values[0]).toBe(5)
    expect(storage.saved).toHaveLength(0)

    act(() => {
      result.current.select(2)
      result.current.enter(4)
    })
    expect(result.current.game.values[2]).toBe(4)
    expect(result.current.hasProgress).toBe(true)

    act(() => result.current.erase())
    expect(result.current.game.values[2]).toBeNull()

    act(() => result.current.undo())
    expect(result.current.game.values[2]).toBe(4)
  })

  it('候选模式输入与撤销由核心规则处理', () => {
    const storage = new FakeStorage()
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    act(() => {
      result.current.select(2)
      result.current.toggleNotes()
      result.current.enter(4)
    })
    expect(result.current.game.noteMode).toBe(true)
    expect(result.current.game.candidates[2]).toBe(1 << 3)

    act(() => result.current.undo())
    expect(result.current.game.candidates[2]).toBe(0)
  })

  it('保存失败不回滚内存状态并显示可关闭提示', () => {
    const storage = new FakeStorage()
    storage.saveOk = false
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    act(() => result.current.select(2))
    expect(result.current.game.selectedIndex).toBe(2)
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')

    act(() => result.current.dismissNotice())
    expect(result.current.notice).toBeNull()
  })

  it('完成动作清除活动存档且不保存 completed 状态', () => {
    const almostSolved: SudokuPuzzle = {
      ...EASY_PUZZLE,
      id: 'easy-almost-solved',
      givens: EASY_PUZZLE.solution.map((digit, index) => index === 2 ? null : digit),
    }
    const initial = createSudokuGame(
      almostSolved.id,
      'easy',
      almostSolved.givens.map((value) => value ?? 0).join(''),
    )
    const storage = new FakeStorage({ kind: 'loaded', game: initial, savedAt: 0 })
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(almostSolved),
      clock: idleClock,
    }))

    act(() => {
      result.current.select(2)
      result.current.enter(4)
    })

    expect(result.current.game.status).toBe('completed')
    expect(storage.saved).toHaveLength(1)
    expect(storage.saved[0]?.game.status).toBe('playing')
    expect(storage.clearCalls).toBe(1)
  })

  it('完成时 clear 失败仍保留 completed 内存状态并显示提示', () => {
    const almostSolved: SudokuPuzzle = {
      ...EASY_PUZZLE,
      id: 'easy-clear-failure',
      givens: EASY_PUZZLE.solution.map((digit, index) => index === 2 ? null : digit),
    }
    const initial = createSudokuGame(
      almostSolved.id,
      'easy',
      almostSolved.givens.map((value) => value ?? 0).join(''),
    )
    const storage = new FakeStorage({ kind: 'loaded', game: initial, savedAt: 0 })
    storage.clearOk = false
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(almostSolved),
      clock: idleClock,
    }))

    act(() => {
      result.current.select(2)
      result.current.enter(4)
    })

    expect(result.current.game.status).toBe('completed')
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })

  it('冲突集合与实质进度从规范 game 派生', () => {
    const storage = new FakeStorage()
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    act(() => result.current.select(2))
    expect(result.current.hasProgress).toBe(false)

    act(() => result.current.enter(5))
    expect(result.current.conflicts).toEqual(new Set([0, 2]))
    expect(result.current.hasProgress).toBe(true)
  })

  it('依赖更新后动作使用最新 storage，但不重新 load', () => {
    const first = new FakeStorage()
    const second = new FakeStorage({ kind: 'invalid' })
    const { result, rerender } = renderHook(
      ({ storage }: { readonly storage: SudokuStoragePort }) => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock: idleClock,
      }),
      { initialProps: { storage: first } },
    )

    rerender({ storage: second })
    act(() => result.current.select(2))

    expect(first.loadCalls).toBe(1)
    expect(second.loadCalls).toBe(0)
    expect(first.saved).toHaveLength(0)
    expect(second.saved).toHaveLength(1)
  })

  it('仅累计可见 playing 片段，hidden 时精确物化并保存', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))

      act(() => clock.advance(2_500))
      expect(result.current.elapsedMs).toBe(2_500)
      expect(result.current.game.elapsedMs).toBe(0)

      act(() => visibility.set('hidden'))
      expect(result.current.elapsedMs).toBe(2_500)
      expect(result.current.game.elapsedMs).toBe(2_500)
      expect(storage.saved.at(-1)?.game.elapsedMs).toBe(2_500)
      expect(clock.activeTimerCount).toBe(0)

      act(() => clock.advance(5_000))
      expect(result.current.elapsedMs).toBe(2_500)

      act(() => visibility.set('visible'))
      act(() => clock.advance(1_500))
      expect(result.current.elapsedMs).toBe(4_000)
      expect(clock.activeTimerCount).toBe(1)
    } finally {
      visibility.restore()
    }
  })

  it('interval 节流后按真实 now 差值累计而不漂移', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const { result } = renderHook(() => useSudokuGame({
        storage: new FakeStorage(),
        puzzles: new FakePuzzles(),
        clock,
      }))

      clock.jump(5_500)
      act(() => clock.fireIntervalsOnce())

      expect(result.current.elapsedMs).toBe(5_500)
      expect(result.current.game.elapsedMs).toBe(0)
    } finally {
      visibility.restore()
    }
  })

  it('动作发生时才把当前可见片段物化到 core game 与存档', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))

      act(() => clock.advance(2_500))
      expect(result.current.game.elapsedMs).toBe(0)

      act(() => result.current.select(2))
      expect(result.current.game.elapsedMs).toBe(2_500)
      expect(storage.saved.at(-1)?.game.elapsedMs).toBe(2_500)
    } finally {
      visibility.restore()
    }
  })

  it('初始 hidden 不启动 interval，重复 visibility 事件也不创建双 timer', () => {
    const visibility = installVisibility('hidden')
    try {
      const clock = new FakeClock()
      renderHook(() => useSudokuGame({
        storage: new FakeStorage(),
        puzzles: new FakePuzzles(),
        clock,
      }))
      expect(clock.activeTimerCount).toBe(0)

      act(() => visibility.set('visible'))
      act(() => visibility.set('visible'))
      expect(clock.activeTimerCount).toBe(1)

      act(() => visibility.set('hidden'))
      act(() => visibility.set('hidden'))
      expect(clock.activeTimerCount).toBe(0)
    } finally {
      visibility.restore()
    }
  })

  it('完成动作物化最后可见片段并停止 timer', () => {
    const visibility = installVisibility('visible')
    try {
      const almostSolved: SudokuPuzzle = {
        ...EASY_PUZZLE,
        id: 'easy-timed-completion',
        givens: EASY_PUZZLE.solution.map((digit, index) => index === 2 ? null : digit),
      }
      const initial = createSudokuGame(
        almostSolved.id,
        'easy',
        almostSolved.givens.map((value) => value ?? 0).join(''),
      )
      const clock = new FakeClock()
      const storage = new FakeStorage({ kind: 'loaded', game: initial, savedAt: 0 })
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(almostSolved),
        clock,
      }))

      clock.jump(2_500)
      act(() => {
        result.current.select(2)
        result.current.enter(4)
      })

      expect(result.current.game.status).toBe('completed')
      expect(result.current.elapsedMs).toBe(2_500)
      expect(clock.activeTimerCount).toBe(0)
    } finally {
      visibility.restore()
    }
  })

  it('restart 重置当前题全部交互与计时、清档并重新开始可见计时', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))
      act(() => {
        clock.advance(1_500)
        result.current.select(2)
        result.current.enter(4)
        result.current.restart()
      })

      expect(result.current.game.puzzleId).toBe(EASY_PUZZLE.id)
      expect(result.current.game.values).toEqual(EASY_PUZZLE.givens)
      expect(result.current.game.history).toEqual([])
      expect(result.current.game.selectedIndex).toBe(0)
      expect(result.current.game.noteMode).toBe(false)
      expect(result.current.elapsedMs).toBe(0)
      expect(storage.clearCalls).toBe(1)
      expect(clock.activeTimerCount).toBe(1)

      act(() => clock.advance(1_000))
      expect(result.current.elapsedMs).toBe(1_000)
    } finally {
      visibility.restore()
    }
  })

  it('同难度换题跳过当前 ID，先保存 recent 再清活动存档', () => {
    const storage = new FakeStorage()
    const puzzles = new QueuePuzzles([EASY_PUZZLE, SECOND_EASY_PUZZLE])
    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    act(() => result.current.newPuzzle('easy'))

    expect(puzzles.nextCalls).toEqual([
      { difficulty: 'easy', previousId: null },
      { difficulty: 'easy', previousId: EASY_PUZZLE.id },
    ])
    expect(storage.recentLoaded).toEqual(['easy'])
    expect(storage.recentSaved).toEqual([
      { difficulty: 'easy', puzzleId: EASY_PUZZLE.id },
      { difficulty: 'easy', puzzleId: SECOND_EASY_PUZZLE.id },
    ])
    expect(storage.clearCalls).toBe(1)
    expect(result.current.game.puzzleId).toBe(SECOND_EASY_PUZZLE.id)
  })

  it('切换难度使用该难度 recent 作为 previous', () => {
    const storage = new FakeStorage(
      { kind: 'empty' },
      { medium: 'medium-previous' },
    )
    const puzzles = new QueuePuzzles([EASY_PUZZLE, MEDIUM_PUZZLE])
    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    act(() => result.current.newPuzzle('medium'))

    expect(puzzles.nextCalls.at(-1)).toEqual({
      difficulty: 'medium',
      previousId: 'medium-previous',
    })
    expect(result.current.game.difficulty).toBe('medium')
  })

  it('recent 或 clear 失败不回滚新题并保留自动保存提示', () => {
    const storage = new FakeStorage()
    storage.recentSaveOk = false
    storage.clearOk = false
    const puzzles = new QueuePuzzles([EASY_PUZZLE, SECOND_EASY_PUZZLE])
    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    act(() => result.current.newPuzzle('easy'))

    expect(result.current.game.puzzleId).toBe(SECOND_EASY_PUZZLE.id)
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })

  it('provider 返回 previous ID 时暴露开发错误且不切换棋局', () => {
    const storage = new FakeStorage()
    const puzzles = new QueuePuzzles([EASY_PUZZLE, EASY_PUZZLE])
    const { result } = renderHook(() => useSudokuGame({ storage, puzzles, clock: idleClock }))

    expect(() => {
      act(() => result.current.newPuzzle('easy'))
    }).toThrow('Sudoku puzzle provider must not repeat the previous puzzle id')
    expect(result.current.game.puzzleId).toBe(EASY_PUZZLE.id)
    expect(storage.clearCalls).toBe(0)
  })

  it('替换 puzzles 后换题使用最新 provider，初始 provider 不再前进', () => {
    const storage = new FakeStorage()
    const first = new QueuePuzzles([EASY_PUZZLE])
    const second = new QueuePuzzles([MEDIUM_PUZZLE])
    const { result, rerender } = renderHook(
      ({ puzzles }: { readonly puzzles: SudokuPuzzleProvider }) => useSudokuGame({
        storage,
        puzzles,
        clock: idleClock,
      }),
      { initialProps: { puzzles: first } },
    )

    rerender({ puzzles: second })
    act(() => result.current.newPuzzle('medium'))

    expect(first.nextCalls).toHaveLength(1)
    expect(second.nextCalls).toEqual([{ difficulty: 'medium', previousId: null }])
    expect(result.current.game.puzzleId).toBe(MEDIUM_PUZZLE.id)
  })

  it('StrictMode replay 的 listener 与 interval 成对清理且从不双活', () => {
    const visibility = installVisibility('visible')
    const addDocumentListener = vi.spyOn(document, 'addEventListener')
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener')
    const addWindowListener = vi.spyOn(window, 'addEventListener')
    const removeWindowListener = vi.spyOn(window, 'removeEventListener')
    try {
      const clock = new FakeClock()
      const wrapper = ({ children }: { readonly children: ReactNode }) => (
        <StrictMode>{children}</StrictMode>
      )
      const hook = renderHook(() => useSudokuGame({
        storage: new FakeStorage(),
        puzzles: new FakePuzzles(),
        clock,
      }), { wrapper })

      expect(clock.createdTimerIds.length).toBeGreaterThanOrEqual(1)
      expect(clock.clearedTimerIds).toHaveLength(clock.createdTimerIds.length - 1)
      expect(clock.activeTimerCount).toBe(1)
      const documentAdds = addDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange').length
      const documentRemoves = removeDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange').length
      const pagehideAdds = addWindowListener.mock.calls.filter(([type]) => type === 'pagehide').length
      const pagehideRemoves = removeWindowListener.mock.calls.filter(([type]) => type === 'pagehide').length
      const pageshowAdds = addWindowListener.mock.calls.filter(([type]) => type === 'pageshow').length
      const pageshowRemoves = removeWindowListener.mock.calls.filter(([type]) => type === 'pageshow').length
      expect(documentAdds).toBe(documentRemoves + 1)
      expect(pagehideAdds).toBe(pagehideRemoves + 1)
      expect(pageshowAdds).toBe(pageshowRemoves + 1)

      hook.unmount()
      expect(clock.clearedTimerIds).toHaveLength(clock.createdTimerIds.length)
      expect(clock.activeTimerCount).toBe(0)
      expect(removeDocumentListener.mock.calls.filter(([type]) => type === 'visibilitychange')).toHaveLength(documentAdds)
      expect(removeWindowListener.mock.calls.filter(([type]) => type === 'pagehide')).toHaveLength(pagehideAdds)
      expect(removeWindowListener.mock.calls.filter(([type]) => type === 'pageshow')).toHaveLength(pageshowAdds)
    } finally {
      addDocumentListener.mockRestore()
      removeDocumentListener.mockRestore()
      addWindowListener.mockRestore()
      removeWindowListener.mockRestore()
      visibility.restore()
    }
  })

  it('真实卸载同步保存尚未 tick 的最新 playing elapsed', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const hook = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))

      clock.jump(2_500)
      hook.unmount()

      expect(storage.saved.at(-1)?.game.elapsedMs).toBe(2_500)
      expect(storage.saved.at(-1)?.savedAt).toBe(2_500)
      expect(clock.activeTimerCount).toBe(0)
    } finally {
      visibility.restore()
    }
  })

  it('pagehide 保存并停止计时，pageshow 后从唯一新起点恢复', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))

      clock.jump(1_700)
      act(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))

      expect(storage.saved.at(-1)?.game.elapsedMs).toBe(1_700)
      expect(storage.saved).toHaveLength(1)
      expect(clock.activeTimerCount).toBe(0)
      expect(result.current.game.elapsedMs).toBe(0)
      const pagehideElapsed = result.current.elapsedMs

      act(() => clock.advance(1_000))
      expect(result.current.elapsedMs).toBe(pagehideElapsed)
      expect(result.current.game.elapsedMs).toBe(0)
      expect(storage.saved).toHaveLength(1)

      act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
      act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
      act(() => visibility.set('visible'))
      expect(clock.activeTimerCount).toBe(1)
      expect(result.current.game.elapsedMs).toBe(1_700)

      act(() => clock.advance(1_000))
      expect(result.current.elapsedMs).toBe(2_700)
    } finally {
      visibility.restore()
    }
  })

  it('重复 hidden 及 hidden 后 pagehide 不重复保存，恢复后新片段可再次保存', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      const storage = new FakeStorage()
      const { result } = renderHook(() => useSudokuGame({
        storage,
        puzzles: new FakePuzzles(),
        clock,
      }))

      act(() => clock.advance(2_500))
      act(() => visibility.set('hidden'))
      act(() => visibility.set('hidden'))
      act(() => window.dispatchEvent(new PageTransitionEvent('pagehide')))
      expect(storage.saved).toHaveLength(1)
      expect(storage.saved[0]?.game.elapsedMs).toBe(2_500)

      act(() => visibility.set('visible'))
      expect(clock.activeTimerCount).toBe(0)
      act(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
      expect(clock.activeTimerCount).toBe(1)

      act(() => clock.advance(1_000))
      act(() => visibility.set('hidden'))
      expect(storage.saved).toHaveLength(2)
      expect(storage.saved[1]?.game.elapsedMs).toBe(3_500)
      expect(result.current.elapsedMs).toBe(3_500)
    } finally {
      visibility.restore()
    }
  })

  it('替换 clock 时用旧 clock 结算后迁移到新 clock 的唯一 timer', () => {
    const visibility = installVisibility('visible')
    try {
      const first = new FakeClock()
      const second = new FakeClock()
      const { result, rerender } = renderHook(
        ({ clock }: { readonly clock: SudokuClock }) => useSudokuGame({
          storage: new FakeStorage(),
          puzzles: new FakePuzzles(),
          clock,
        }),
        { initialProps: { clock: first } },
      )

      act(() => first.advance(1_500))
      rerender({ clock: second })
      expect(result.current.elapsedMs).toBe(1_500)
      expect(first.activeTimerCount).toBe(0)
      expect(second.activeTimerCount).toBe(1)

      act(() => second.advance(1_000))
      expect(result.current.elapsedMs).toBe(2_500)
    } finally {
      visibility.restore()
    }
  })

  it('clock 返回非法 now 时直接暴露开发错误', () => {
    const visibility = installVisibility('visible')
    try {
      const clock = new FakeClock()
      clock.setNow(Number.NaN)

      expect(() => renderHook(() => useSudokuGame({
        storage: new FakeStorage(),
        puzzles: new FakePuzzles(),
        clock,
      }))).toThrow('Sudoku clock now must be a finite non-negative integer')
    } finally {
      visibility.restore()
    }
  })

  it('成功保存不会自动清除尚未 dismiss 的历史 notice', () => {
    const storage = new FakeStorage({ kind: 'unavailable' })
    const { result } = renderHook(() => useSudokuGame({
      storage,
      puzzles: new FakePuzzles(),
      clock: idleClock,
    }))

    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
    act(() => result.current.select(2))
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })
})
