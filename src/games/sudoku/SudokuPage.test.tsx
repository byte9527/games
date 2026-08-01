import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, type ReactElement } from 'react'

import { AudioProvider } from '../../audio/AudioProvider'
import type { MusicEnginePort } from '../../audio/core/MusicEnginePort'
import type { MusicPreferenceStoragePort } from '../../audio/storage/musicPreferenceStorage'
import type { Difficulty, Digit, SudokuGameState } from './core/types'
import type { SudokuPuzzle, SudokuPuzzleProvider } from './puzzles/provider'
import {
  ACTIVE_SUDOKU_STORAGE_KEY,
  type SudokuLoadResult,
  type SudokuStoragePort,
} from './storage/storage'
import type { SudokuClock } from './useSudokuGame'
import { SudokuPage } from './SudokuPage'
import sudokuCss from './sudoku.css?raw'

const SOLUTION: readonly Digit[] = [
  5, 3, 4, 6, 7, 8, 9, 1, 2,
  6, 7, 2, 1, 9, 5, 3, 4, 8,
  1, 9, 8, 3, 4, 2, 5, 6, 7,
  8, 5, 9, 7, 6, 1, 4, 2, 3,
  4, 2, 6, 8, 5, 3, 7, 9, 1,
  7, 1, 3, 9, 2, 4, 8, 5, 6,
  9, 6, 1, 5, 3, 7, 2, 8, 4,
  2, 8, 7, 4, 1, 9, 6, 3, 5,
  3, 4, 5, 2, 8, 6, 1, 7, 9,
]

function puzzle(
  id: string,
  difficulty: Difficulty,
  emptyIndices: readonly number[],
): SudokuPuzzle {
  return {
    id,
    difficulty,
    givens: SOLUTION.map((digit, index) => emptyIndices.includes(index) ? null : digit),
    solution: SOLUTION,
  }
}

const TEST_PUZZLES: readonly SudokuPuzzle[] = [
  puzzle('easy-page-1', 'easy', [2, 3, 10]),
  puzzle('easy-page-2', 'easy', [0, 1, 2]),
  puzzle('medium-page-1', 'medium', [3, 4, 5]),
  puzzle('medium-page-2', 'medium', [6, 7, 8]),
  puzzle('hard-page-1', 'hard', [9, 10, 11]),
  puzzle('hard-page-2', 'hard', [12, 13, 14]),
]

class FakePuzzles implements SudokuPuzzleProvider {
  readonly nextCalls: Array<{
    readonly difficulty: Difficulty
    readonly previousId: string | null
  }> = []

  constructor(private readonly catalog: readonly SudokuPuzzle[] = TEST_PUZZLES) {}

  getById(id: string): SudokuPuzzle | null {
    return this.catalog.find((candidate) => candidate.id === id) ?? null
  }

  next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle {
    this.nextCalls.push({ difficulty, previousId })
    const matching = this.catalog.filter((candidate) => candidate.difficulty === difficulty)
    const selected = matching.find((candidate) => candidate.id !== previousId)
    if (selected === undefined) throw new Error(`测试缺少可轮换的 ${difficulty} 数独题`)
    return selected
  }

  all(): readonly SudokuPuzzle[] {
    return this.catalog
  }
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

  constructor(readonly loadResult: SudokuLoadResult = { kind: 'empty' }) {}

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
    return null
  }

  savePreviousPuzzleId(
    difficulty: Difficulty,
    puzzleId: string,
  ): { readonly ok: boolean } {
    this.recentSaved.push({ difficulty, puzzleId })
    return { ok: this.recentSaveOk }
  }
}

class FakeClock implements SudokuClock {
  private nowMs = 0
  private nextTimerId = 1
  private readonly callbacks = new Map<number, () => void>()

  now(): number {
    return this.nowMs
  }

  setInterval(callback: () => void): number {
    const id = this.nextTimerId
    this.nextTimerId += 1
    this.callbacks.set(id, callback)
    return id
  }

  clearInterval(timerId: number): void {
    this.callbacks.delete(timerId)
  }

  advance(ms: number): void {
    this.nowMs += ms
    for (const callback of [...this.callbacks.values()]) callback()
  }
}

const audioEngine = {
  unlock: vi.fn<MusicEnginePort['unlock']>().mockResolvedValue({ ok: true }),
  play: vi.fn<MusicEnginePort['play']>(),
  pause: vi.fn<MusicEnginePort['pause']>(),
  stop: vi.fn<MusicEnginePort['stop']>(),
  dispose: vi.fn<MusicEnginePort['dispose']>().mockResolvedValue(undefined),
} satisfies MusicEnginePort

const audioStorage = {
  load: vi.fn<MusicPreferenceStoragePort['load']>().mockReturnValue({
    kind: 'loaded',
    enabled: true,
  }),
  save: vi.fn<MusicPreferenceStoragePort['save']>().mockReturnValue({ ok: true }),
} satisfies MusicPreferenceStoragePort

function withAudio(ui: ReactElement): ReactElement {
  return (
    <AudioProvider engineFactory={() => audioEngine} storage={audioStorage}>
      {ui}
    </AudioProvider>
  )
}

function renderPage({
  storage = new FakeStorage(),
  puzzles = new FakePuzzles(),
  clock = new FakeClock(),
}: {
  readonly storage?: SudokuStoragePort
  readonly puzzles?: SudokuPuzzleProvider
  readonly clock?: SudokuClock
} = {}) {
  return render(withAudio(
    <SudokuPage clock={clock} puzzles={puzzles} storage={storage} />,
  ))
}

describe('SudokuPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    window.localStorage.clear()
    audioEngine.unlock.mockResolvedValue({ ok: true })
    audioEngine.dispose.mockResolvedValue(undefined)
    audioStorage.load.mockReturnValue({ kind: 'loaded', enabled: true })
    audioStorage.save.mockReturnValue({ ok: true })
  })

  it('默认组装标题、元信息、81 格棋盘、数字键盘和全部控制', () => {
    renderPage()

    expect(screen.getByRole('heading', { level: 1, name: '数独' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '返回小游戏' })).toHaveAttribute('href', '#/')
    expect(screen.getByText('难度：简单')).toBeInTheDocument()
    expect(screen.getByText('用时：0:00')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '音乐' })).toBeEnabled()
    expect(within(screen.getByRole('grid', { name: '九乘九数独棋盘' }))
      .getAllByRole('button')).toHaveLength(81)
    expect(within(screen.getByRole('group', { name: '数独数字键盘' }))
      .getAllByRole('button')).toHaveLength(11)
    expect(screen.getByRole('group', { name: '数独控制区' })).toBeInTheDocument()
    expect(screen.getByRole('group', { name: '选择难度' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: '棋盘冲突' }))
      .toHaveTextContent('当前有 0 个冲突格')
  })

  it('未注入端口时使用浏览器存储与内置题库完成页面 smoke', () => {
    render(withAudio(<SudokuPage />))

    expect(screen.getByRole('heading', { level: 1, name: '数独' })).toBeInTheDocument()
    expect(within(screen.getByRole('grid', { name: '九乘九数独棋盘' }))
      .getAllByRole('button')).toHaveLength(81)
    expect(screen.getByText('难度：简单')).toBeInTheDocument()
  })

  it('仅注入自定义题库时使用同一题库校验浏览器存储', async () => {
    const user = userEvent.setup()
    const puzzles = new FakePuzzles()
    render(withAudio(<SudokuPage clock={new FakeClock()} puzzles={puzzles} />))

    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))

    expect(screen.getByRole('button', { name: '第 1 行第 3 列，玩家数字 4' }))
      .toBeInTheDocument()
    expect(window.localStorage.getItem(ACTIVE_SUDOKU_STORAGE_KEY)).not.toBeNull()
  })

  it('选择空格后支持候选输入，并可撤销候选变更', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '候选模式' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))

    expect(screen.getByRole('button', {
      name: '第 1 行第 3 列，空格，候选数 4',
    })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: '撤销' }))

    expect(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
      .toBeInTheDocument()
  })

  it('有进度重新开始可取消或确认，并在关闭后恢复触发按钮焦点', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage()
    renderPage({ storage })
    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))
    const restartButton = screen.getByRole('button', { name: '重新开始' })
    const savedBeforeCancel = storage.saved.length

    await user.click(restartButton)

    const content = document.querySelector('.sudoku-page .game-content')
    expect(content).toHaveAttribute('inert')
    expect(content).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第 1 行第 3 列，玩家数字 4' }))
      .toBeInTheDocument()
    expect(storage.saved).toHaveLength(savedBeforeCancel)
    expect(storage.clearCalls).toBe(0)
    expect(storage.recentSaved).toHaveLength(1)
    expect(screen.getByText('用时：0:00')).toBeInTheDocument()
    await waitFor(() => expect(restartButton).toHaveFocus())

    await user.click(restartButton)
    await user.click(screen.getByRole('button', { name: '确认重新开始' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
      .toBeInTheDocument()
    expect(storage.clearCalls).toBe(1)
    await waitFor(() => expect(restartButton).toHaveFocus())
  })

  it('无进度操作直接执行，当前难度点击严格不换题', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()
    renderPage({ puzzles, storage })

    await user.click(screen.getByRole('button', { name: '简单' }))
    expect(puzzles.nextCalls).toHaveLength(1)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(storage.clearCalls).toBe(0)
    expect(storage.recentSaved).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '重新开始' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(storage.clearCalls).toBe(1)

    await user.click(screen.getByRole('button', { name: '换一题' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(puzzles.nextCalls.at(-1)).toEqual({
      difficulty: 'easy',
      previousId: 'easy-page-1',
    })

    await user.click(screen.getByRole('button', { name: '中等' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(puzzles.nextCalls.at(-1)).toEqual({ difficulty: 'medium', previousId: null })
    expect(screen.getByText('难度：中等')).toBeInTheDocument()
  })

  it('换题与切换难度共用单层确认并执行准确动作', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()
    renderPage({ puzzles, storage })
    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))

    const newPuzzleButton = screen.getByRole('button', { name: '换一题' })
    await user.click(newPuzzleButton)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '换一道新题？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认换题' }))

    expect(puzzles.nextCalls.at(-1)).toEqual({
      difficulty: 'easy',
      previousId: 'easy-page-1',
    })
    expect(storage.recentSaved.at(-1)).toEqual({
      difficulty: 'easy',
      puzzleId: 'easy-page-2',
    })
    expect(storage.clearCalls).toBe(1)
    expect(screen.getByRole('button', { name: '第 1 行第 1 列，空格' }))
      .toBeInTheDocument()
    await waitFor(() => expect(newPuzzleButton).toHaveFocus())

    await user.click(screen.getByRole('button', { name: '第 1 行第 1 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 5' }))
    const mediumButton = screen.getByRole('button', { name: '中等' })
    await user.click(mediumButton)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '切换难度？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '确认切换难度' }))

    expect(puzzles.nextCalls.at(-1)).toEqual({ difficulty: 'medium', previousId: null })
    expect(screen.getByText('难度：中等')).toBeInTheDocument()
    expect(storage.recentLoaded).toContain('medium')
    expect(storage.recentSaved.at(-1)).toEqual({
      difficulty: 'medium',
      puzzleId: 'medium-page-1',
    })
    expect(storage.clearCalls).toBe(2)
    await waitFor(() => expect(mediumButton).toHaveFocus())
  })

  it('真实 interval 回调刷新页面用时文本', () => {
    const clock = new FakeClock()
    renderPage({ clock })

    act(() => clock.advance(1_000))

    expect(screen.getByText('用时：0:01')).toBeInTheDocument()
  })

  it('游戏存储提示优先于音频提示，并按优先级逐条关闭', async () => {
    const user = userEvent.setup()
    audioStorage.load.mockReturnValue({ kind: 'invalid' })
    renderPage({ storage: new FakeStorage({ kind: 'invalid' }) })

    expect(screen.getByRole('status', { name: '' }))
      .toHaveTextContent('旧数独进度无法恢复，已开始新题。')
    expect(screen.queryByText('音乐设置已失效，本次使用默认开启。'))
      .not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.getByRole('status', { name: '' }))
      .toHaveTextContent('音乐设置已失效，本次使用默认开启。')

    await user.click(screen.getByRole('button', { name: '关闭提示' }))
    expect(screen.queryByText('音乐设置已失效，本次使用默认开启。'))
      .not.toBeInTheDocument()
  })

  it('存储不可用或保存失败时仍可继续输入，音乐开关不注册页面曲目', async () => {
    const user = userEvent.setup()
    const unavailableStorage = new FakeStorage({ kind: 'unavailable' })
    renderPage({ storage: unavailableStorage })

    expect(screen.getByText('自动保存不可用，本局仍可继续。')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    unavailableStorage.saveOk = false
    await user.click(screen.getByRole('button', { name: '数字 4' }))
    expect(screen.getByRole('button', { name: '第 1 行第 3 列，玩家数字 4' }))
      .toBeInTheDocument()

    const musicToggle = screen.getByRole('button', { name: '音乐' })
    await user.click(musicToggle)
    expect(musicToggle).toHaveAttribute('aria-pressed', 'false')
    expect(audioEngine.play).not.toHaveBeenCalled()
  })

  it('首次保存失败时显示提示并保留内存中的输入', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage()
    storage.saveOk = false
    renderPage({ storage })

    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))

    expect(screen.getByText('自动保存不可用，本局仍可继续。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '第 1 行第 3 列，玩家数字 4' }))
      .toBeInTheDocument()
  })

  it('冲突状态只显示准确冲突格数量', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 5' }))

    expect(screen.getByRole('status', { name: '棋盘冲突' }))
      .toHaveTextContent('当前有 3 个冲突格')
    expect(screen.getAllByRole('button', { name: /存在冲突/ })).toHaveLength(3)
  })

  it('键盘完成后只显示顶层完成弹窗，并在再来一题后恢复棋盘焦点', async () => {
    const user = userEvent.setup()
    const clock = new FakeClock()
    const completionPuzzles = new FakePuzzles([
      puzzle('easy-complete-1', 'easy', [2]),
      puzzle('easy-complete-2', 'easy', [3]),
    ])
    renderPage({ clock, puzzles: completionPuzzles })
    const completingCell = screen.getByRole('button', { name: '第 1 行第 3 列，空格' })
    await user.click(completingCell)
    act(() => clock.advance(2_500))

    await user.keyboard('4')

    const dialog = screen.getByRole('dialog', { name: '数独完成' })
    expect(within(dialog).getByText('难度：简单')).toBeInTheDocument()
    expect(within(dialog).getByText('用时：0:02')).toBeInTheDocument()
    expect(document.querySelector('.sudoku-page .game-content')).toHaveAttribute('inert')
    expect(document.querySelector('.sudoku-page .game-content'))
      .toHaveAttribute('aria-hidden', 'true')
    expect(screen.queryByRole('button', { name: '撤销' })).not.toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: '再来一题' })).toHaveFocus()
    expect(within(dialog).getAllByRole('button')).toHaveLength(1)
    expect(within(dialog).getAllByRole('link')).toHaveLength(1)
    expect(within(dialog).getByRole('link', { name: '返回小游戏' }))
      .toHaveAttribute('href', '#/')

    expect(fireEvent.keyDown(dialog, { key: 'Escape' })).toBe(true)
    expect(screen.getByRole('dialog', { name: '数独完成' })).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: '再来一题' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: '撤销' })).toBeDisabled()
    await waitFor(() => expect(completingCell).toHaveFocus())
  })

  it('确认打开后程序化棋盘输入不穿透且不会叠加弹窗', async () => {
    const user = userEvent.setup()
    renderPage()
    const cell = screen.getByRole('button', { name: '第 1 行第 3 列，空格' })
    await user.click(cell)
    await user.click(screen.getByRole('button', { name: '数字 4' }))
    const restartButton = screen.getByRole('button', { name: '重新开始' })
    await user.click(restartButton)

    fireEvent.keyDown(cell, { key: '5' })
    fireEvent.click(restartButton)

    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('dialog', { name: '重新开始这道题？' })).toBeInTheDocument()
    expect(cell).toHaveAccessibleName('第 1 行第 3 列，玩家数字 4')
  })

  it.each([
    ['重新开始', '取消'],
    ['重新开始', '确认重新开始'],
    ['换一题', '取消'],
    ['换一题', '确认换题'],
    ['中等', '取消'],
    ['中等', '确认切换难度'],
  ] as const)(
    '即使 %s 不是 activeElement，%s 后仍恢复真实触发按钮',
    async (triggerName, closeName) => {
      const user = userEvent.setup()
      renderPage()
      await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
      await user.click(screen.getByRole('button', { name: '数字 4' }))
      const trigger = screen.getByRole('button', { name: triggerName })
      const distractor = screen.getByRole('link', { name: '返回小游戏' })
      distractor.focus()
      expect(distractor).toHaveFocus()

      fireEvent.click(trigger)
      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()

      fireEvent.click(screen.getByRole('button', { name: closeName }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      await waitFor(() => expect(trigger).toHaveFocus())
    },
  )

  it('StrictMode 不重复初始化或创建重复确认弹窗', async () => {
    const user = userEvent.setup()
    const storage = new FakeStorage()
    const puzzles = new FakePuzzles()
    render(withAudio(
      <StrictMode>
        <SudokuPage clock={new FakeClock()} puzzles={puzzles} storage={storage} />
      </StrictMode>,
    ))

    expect(storage.loadCalls).toBe(1)
    expect(puzzles.nextCalls).toHaveLength(1)
    await user.click(screen.getByRole('button', { name: '第 1 行第 3 列，空格' }))
    await user.click(screen.getByRole('button', { name: '数字 4' }))
    await user.click(screen.getByRole('button', { name: '重新开始' }))
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
  })
})

describe('sudoku.css', () => {
  const css = sudokuCss

  it('声明响应式棋盘、宫线和独立格子状态', () => {
    expect(css).toMatch(/\.sudoku-page\s*\{[^}]*width:\s*min\(100%,\s*920px\)/s)
    expect(css).toMatch(/\.sudoku-page\s*\{[^}]*overflow-x:\s*(?:clip|hidden)/s)
    expect(css).toMatch(/\.sudoku-board\s*\{[^}]*grid-template-columns:\s*repeat\(9,/s)
    expect(css).toMatch(/\.sudoku-board\s*\{[^}]*grid-template-rows:\s*repeat\(9,/s)
    expect(css).toMatch(/\.sudoku-board\s*\{[^}]*aspect-ratio:\s*1/s)
    expect(css).toMatch(/\.sudoku-board\s*\{[^}]*max-width:\s*620px/s)
    expect(css).toContain('[data-box-col="0"]')
    expect(css).toContain('[data-box-row="0"]')
    expect(css).toContain('[data-given="true"]')
    expect(css).toContain('.sudoku-cell__value--player')
    expect(css).toContain('.sudoku-cell__candidates')
    expect(css).toContain('[data-selected="true"]')
    expect(css).toMatch(/\[data-related="true"\][^{]*\{[^}]*outline:/s)
    expect(css).toContain('[data-same-value="true"]')
    expect(css).toContain('[data-conflict="true"]')
  })

  it('声明桌面双列、强制配色和减少动效规则', () => {
    expect(css).toMatch(/@media\s*\(min-width:\s*760px\)/)
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)/)
    expect(css).toMatch(/@media\s*\(forced-colors:\s*active\)[\s\S]*\[data-related="true"\][^{]*\{[^}]*outline:/)
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/)
    expect(css).toMatch(/\.sudoku-cell\s*\{[^}]*min-width:\s*0[^}]*min-height:\s*0/s)
    expect(css).toMatch(/\.number-pad\s+button[^}]*min-height:\s*44px/s)
    expect(css).toMatch(/touch-action:\s*manipulation/)
  })

  it('强制配色为候选和冲突玩家数字使用匹配的系统色', () => {
    const forcedColors = css.slice(css.indexOf('@media (forced-colors: active)'))

    expect(forcedColors).toMatch(
      /\.sudoku-cell__candidates\s*\{[^}]*color:\s*CanvasText/s,
    )
    expect(forcedColors).toMatch(
      /\[data-conflict="true"\]\s+\.sudoku-cell__value--player\s*\{[^}]*color:\s*HighlightText/s,
    )
  })
})
