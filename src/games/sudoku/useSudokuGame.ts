import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { conflictIndices } from './core/board'
import {
  createSudokuGame,
  enterDigit,
  eraseSelected,
  moveSelection,
  resetSudokuGame,
  selectCell,
  toggleNoteMode,
  undo as undoSudoku,
  withElapsedMs,
  type MoveDirection,
} from './core/game'
import type { Difficulty, Digit, SudokuGameState } from './core/types'
import type { SudokuPuzzle, SudokuPuzzleProvider } from './puzzles/provider'
import type { SudokuStoragePort } from './storage/storage'

export interface SudokuClock {
  now(): number
  setInterval(callback: () => void, intervalMs: number): number
  clearInterval(timerId: number): void
}

export interface SudokuController {
  readonly game: SudokuGameState
  readonly conflicts: ReadonlySet<number>
  readonly notice: string | null
  readonly elapsedMs: number
  readonly hasProgress: boolean
  select(index: number): void
  move(direction: MoveDirection): void
  enter(digit: Digit): void
  erase(): void
  toggleNotes(): void
  undo(): void
  restart(): void
  newPuzzle(difficulty: Difficulty): void
  dismissNotice(): void
}

export interface UseSudokuGameOptions {
  readonly storage: SudokuStoragePort
  readonly puzzles: SudokuPuzzleProvider
  readonly clock?: SudokuClock
}

interface ControllerState {
  readonly game: SudokuGameState
  readonly notice: string | null
}

const PLACEHOLDER_GIVENS = '0'.repeat(81)
const STORAGE_UNAVAILABLE_NOTICE = '自动保存不可用，本局仍可继续。'

const browserClock: SudokuClock = {
  now: () => Date.now(),
  setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
  clearInterval: (timerId) => window.clearInterval(timerId),
}

function serializeGivens(puzzle: SudokuPuzzle): string {
  return puzzle.givens.map((value) => value ?? 0).join('')
}

function createGameFromPuzzle(puzzle: SudokuPuzzle): SudokuGameState {
  return createSudokuGame(
    puzzle.id,
    puzzle.difficulty,
    serializeGivens(puzzle),
  )
}

function assertSelectedPuzzle(
  puzzle: SudokuPuzzle,
  difficulty: Difficulty,
  previousId: string | null,
): void {
  if (puzzle.difficulty !== difficulty) {
    throw new Error(
      `Sudoku puzzle provider returned ${puzzle.difficulty} for requested difficulty ${difficulty}`,
    )
  }
  if (previousId !== null && puzzle.id === previousId) {
    throw new Error('Sudoku puzzle provider must not repeat the previous puzzle id')
  }
}

function readClockNow(clock: SudokuClock): number {
  const now = clock.now()
  if (!Number.isFinite(now) || !Number.isInteger(now) || now < 0) {
    throw new Error(
      `Sudoku clock now must be a finite non-negative integer; received ${String(now)}`,
    )
  }
  return now
}

function elapsedWithVisibleFragment(
  game: SudokuGameState,
  visibleStart: number | null,
  clock: SudokuClock,
): number {
  if (game.status !== 'playing' || visibleStart === null) return game.elapsedMs

  const delta = readClockNow(clock) - visibleStart
  if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta < 0) {
    throw new Error(
      `Sudoku clock delta must be a finite non-negative integer; received ${String(delta)}`,
    )
  }

  const elapsedMs = game.elapsedMs + delta
  if (!Number.isFinite(elapsedMs) || !Number.isInteger(elapsedMs) || elapsedMs < 0) {
    throw new Error(
      `Sudoku elapsed time must be a finite non-negative integer; received ${String(elapsedMs)}`,
    )
  }
  return elapsedMs
}

export function useSudokuGame({
  storage,
  puzzles,
  clock = browserClock,
}: UseSudokuGameOptions): SudokuController {
  const [state, setState] = useState<ControllerState>(() => ({
    game: createSudokuGame(
      '__sudoku-controller-placeholder__',
      'easy',
      PLACEHOLDER_GIVENS,
    ),
    notice: null,
  }))
  const [, setDisplayRevision] = useState(0)
  const initialStorageRef = useRef(storage)
  const initialPuzzlesRef = useRef(puzzles)
  const gameRef = useRef(state.game)
  const storageRef = useRef(storage)
  const puzzlesRef = useRef(puzzles)
  const clockRef = useRef(clock)
  const initializedRef = useRef(false)
  const visibleStartRef = useRef<number | null>(null)
  const timerIdRef = useRef<number | null>(null)
  const timerClockRef = useRef<SudokuClock | null>(null)
  const mountedRef = useRef(false)
  const pageSuspendedRef = useRef(false)

  useLayoutEffect(() => {
    if (initializedRef.current) return
    initializedRef.current = true

    const initialStorage = initialStorageRef.current
    const loadResult = initialStorage.load()
    if (loadResult.kind === 'loaded') {
      gameRef.current = loadResult.game
      setState({ game: loadResult.game, notice: null })
      return
    }

    const previousId = initialStorage.loadPreviousPuzzleId('easy')
    const puzzle = initialPuzzlesRef.current.next('easy', previousId)
    assertSelectedPuzzle(puzzle, 'easy', previousId)
    const recentResult = initialStorage.savePreviousPuzzleId('easy', puzzle.id)
    const notice = recentResult.ok
      ? loadResult.kind === 'invalid'
        ? '旧数独进度无法恢复，已开始新题。'
        : loadResult.kind === 'unavailable'
          ? STORAGE_UNAVAILABLE_NOTICE
          : null
      : STORAGE_UNAVAILABLE_NOTICE

    const game = createGameFromPuzzle(puzzle)
    gameRef.current = game
    setState({ game, notice })
  }, [])

  useLayoutEffect(() => {
    storageRef.current = storage
    puzzlesRef.current = puzzles
  }, [puzzles, storage])

  const updateGame = useCallback((game: SudokuGameState): void => {
    gameRef.current = game
    setState((current) => current.game === game ? current : { ...current, game })
  }, [])

  const showStorageUnavailableNotice = useCallback((): void => {
    setState((current) => current.notice === STORAGE_UNAVAILABLE_NOTICE
      ? current
      : { ...current, notice: STORAGE_UNAVAILABLE_NOTICE })
  }, [])

  const stopTimer = useCallback((): void => {
    const timerId = timerIdRef.current
    const timerClock = timerClockRef.current
    if (timerId === null || timerClock === null) return
    timerClock.clearInterval(timerId)
    timerIdRef.current = null
    timerClockRef.current = null
  }, [])

  const materializeVisibleFragment = useCallback((
    now: number,
    continueTiming: boolean,
    updateUi: boolean,
  ): SudokuGameState => {
    const current = gameRef.current
    const visibleStart = visibleStartRef.current
    if (current.status !== 'playing' || visibleStart === null) {
      visibleStartRef.current = null
      return current
    }

    const delta = now - visibleStart
    if (!Number.isFinite(delta) || !Number.isInteger(delta) || delta < 0) {
      throw new Error(
        `Sudoku clock delta must be a finite non-negative integer; received ${String(delta)}`,
      )
    }

    const next = withElapsedMs(current, current.elapsedMs + delta)
    gameRef.current = next
    visibleStartRef.current = continueTiming ? now : null
    if (updateUi && mountedRef.current && next !== current) {
      setState((controllerState) => ({ ...controllerState, game: next }))
    }
    return next
  }, [])

  const requestDisplayRender = useCallback((): void => {
    if (!mountedRef.current) return
    setDisplayRevision((revision) => revision + 1)
  }, [])

  const startVisibleTiming = useCallback((): void => {
    if (
      pageSuspendedRef.current ||
      gameRef.current.status !== 'playing' ||
      typeof document === 'undefined' ||
      document.visibilityState !== 'visible'
    ) {
      return
    }

    const activeClock = clockRef.current
    if (visibleStartRef.current === null) {
      visibleStartRef.current = readClockNow(activeClock)
    }
    if (timerIdRef.current !== null) return

    const timerId = activeClock.setInterval(() => {
      if (
        !mountedRef.current ||
        pageSuspendedRef.current ||
        gameRef.current.status !== 'playing' ||
        document.visibilityState !== 'visible'
      ) {
        return
      }
      requestDisplayRender()
    }, 1_000)
    timerIdRef.current = timerId
    timerClockRef.current = activeClock
  }, [requestDisplayRender])

  const persistChangedGame = useCallback((
    game: SudokuGameState,
    savedAt: number,
  ): void => {
    updateGame(game)
    if (game.status === 'completed') {
      visibleStartRef.current = null
      stopTimer()
      if (!storageRef.current.clear().ok) showStorageUnavailableNotice()
      return
    }

    if (!storageRef.current.save(game, savedAt).ok) showStorageUnavailableNotice()
  }, [showStorageUnavailableNotice, stopTimer, updateGame])

  const applyGameAction = useCallback(
    (action: (game: SudokuGameState) => SudokuGameState): void => {
      const current = gameRef.current
      const next = action(current)
      if (next === current) return
      const now = readClockNow(clockRef.current)
      const timedCurrent = materializeVisibleFragment(now, true, false)
      const timedNext = withElapsedMs(next, timedCurrent.elapsedMs)
      persistChangedGame(timedNext, now)
    },
    [materializeVisibleFragment, persistChangedGame],
  )

  const select = useCallback((index: number): void => {
    applyGameAction((game) => selectCell(game, index))
  }, [applyGameAction])

  const move = useCallback((direction: MoveDirection): void => {
    applyGameAction((game) => moveSelection(game, direction))
  }, [applyGameAction])

  const enter = useCallback((digit: Digit): void => {
    applyGameAction((game) => enterDigit(game, digit))
  }, [applyGameAction])

  const erase = useCallback((): void => {
    applyGameAction(eraseSelected)
  }, [applyGameAction])

  const toggleNotes = useCallback((): void => {
    applyGameAction(toggleNoteMode)
  }, [applyGameAction])

  const undo = useCallback((): void => {
    applyGameAction(undoSudoku)
  }, [applyGameAction])

  const restart = useCallback((): void => {
    const now = readClockNow(clockRef.current)
    materializeVisibleFragment(now, false, false)
    stopTimer()

    const next = resetSudokuGame(gameRef.current)
    updateGame(next)
    if (!storageRef.current.clear().ok) showStorageUnavailableNotice()
    startVisibleTiming()
  }, [materializeVisibleFragment, showStorageUnavailableNotice, startVisibleTiming, stopTimer, updateGame])

  const newPuzzle = useCallback((difficulty: Difficulty): void => {
    const current = gameRef.current
    const previousId = current.difficulty === difficulty
      ? current.puzzleId
      : storageRef.current.loadPreviousPuzzleId(difficulty)
    const puzzle = puzzlesRef.current.next(difficulty, previousId)
    assertSelectedPuzzle(puzzle, difficulty, previousId)
    const next = createGameFromPuzzle(puzzle)

    const now = readClockNow(clockRef.current)
    materializeVisibleFragment(now, false, false)
    stopTimer()

    const recentResult = storageRef.current.savePreviousPuzzleId(difficulty, puzzle.id)
    const clearResult = storageRef.current.clear()
    updateGame(next)
    if (!recentResult.ok || !clearResult.ok) showStorageUnavailableNotice()
    startVisibleTiming()
  }, [materializeVisibleFragment, showStorageUnavailableNotice, startVisibleTiming, stopTimer, updateGame])

  useLayoutEffect(() => {
    if (clockRef.current === clock) return

    const previousClock = clockRef.current
    if (visibleStartRef.current !== null && gameRef.current.status === 'playing') {
      const previousNow = readClockNow(previousClock)
      materializeVisibleFragment(previousNow, false, true)
    }
    stopTimer()
    clockRef.current = clock
    startVisibleTiming()
  }, [clock, materializeVisibleFragment, startVisibleTiming, stopTimer])

  useLayoutEffect(() => {
    mountedRef.current = true
    pageSuspendedRef.current = false

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        startVisibleTiming()
        return
      }

      if (
        gameRef.current.status === 'playing' &&
        visibleStartRef.current !== null
      ) {
        const now = readClockNow(clockRef.current)
        const game = materializeVisibleFragment(now, false, true)
        stopTimer()
        if (!storageRef.current.save(game, now).ok) showStorageUnavailableNotice()
      } else {
        stopTimer()
      }
    }

    const handlePageHide = (): void => {
      pageSuspendedRef.current = true
      if (
        gameRef.current.status !== 'playing' ||
        visibleStartRef.current === null
      ) {
        stopTimer()
        return
      }
      const now = readClockNow(clockRef.current)
      const game = materializeVisibleFragment(now, false, false)
      stopTimer()
      storageRef.current.save(game, now)
    }

    const handlePageShow = (): void => {
      pageSuspendedRef.current = false
      updateGame(gameRef.current)
      startVisibleTiming()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)
    window.addEventListener('pageshow', handlePageShow)
    startVisibleTiming()

    return () => {
      mountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
      window.removeEventListener('pageshow', handlePageShow)

      if (
        gameRef.current.status === 'playing' &&
        visibleStartRef.current !== null
      ) {
        const now = readClockNow(clockRef.current)
        const game = materializeVisibleFragment(now, false, false)
        storageRef.current.save(game, now)
      }
      stopTimer()
    }
  }, [materializeVisibleFragment, showStorageUnavailableNotice, startVisibleTiming, stopTimer, updateGame])

  const dismissNotice = useCallback((): void => {
    setState((current) => ({ ...current, notice: null }))
  }, [])
  const conflicts = useMemo(
    () => conflictIndices(state.game.values),
    [state.game.values],
  )

  return {
    game: state.game,
    conflicts,
    notice: state.notice,
    get elapsedMs(): number {
      return elapsedWithVisibleFragment(
        gameRef.current,
        visibleStartRef.current,
        clockRef.current,
      )
    },
    hasProgress: state.game.history.length > 0,
    select,
    move,
    enter,
    erase,
    toggleNotes,
    undo,
    restart,
    newPuzzle,
    dismissNotice,
  }
}
