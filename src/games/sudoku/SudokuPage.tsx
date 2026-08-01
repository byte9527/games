import { useMemo, useRef, useState, type MouseEvent } from 'react'

import { useAudioController } from '../../audio/AudioProvider'
import { MusicToggle } from '../../audio/MusicToggle'
import { NoticeBanner } from '../gomoku/components/NoticeBanner'
import { CompletionDialog, formatElapsedTime } from './components/CompletionDialog'
import { ConfirmDialog } from './components/ConfirmDialog'
import { DifficultySelector } from './components/DifficultySelector'
import { NumberPad } from './components/NumberPad'
import { SudokuBoard } from './components/SudokuBoard'
import { SudokuControls } from './components/SudokuControls'
import type { MoveDirection } from './core/game'
import type { Difficulty, Digit } from './core/types'
import {
  builtinSudokuPuzzleProvider,
  type SudokuPuzzleProvider,
} from './puzzles/provider'
import {
  createBrowserSudokuStorage,
  SudokuStorage,
  type SudokuStoragePort,
} from './storage/storage'
import { useSudokuGame, type SudokuClock } from './useSudokuGame'
import './sudoku.css'

function difficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'easy':
      return '简单'
    case 'medium':
      return '中等'
    case 'hard':
      return '困难'
  }
}

type PendingAction =
  | { readonly kind: 'restart' }
  | { readonly kind: 'new-puzzle' }
  | { readonly kind: 'difficulty'; readonly target: Difficulty }

function createStorageForPuzzles(puzzles: SudokuPuzzleProvider): SudokuStoragePort {
  const browserStorage = createBrowserSudokuStorage()
  if (
    puzzles === builtinSudokuPuzzleProvider ||
    !(browserStorage instanceof SudokuStorage)
  ) {
    return browserStorage
  }

  return new SudokuStorage(window.localStorage, puzzles)
}

const sessionIdentityIds = new WeakMap<object, number>()
let nextSessionIdentityId = 1

function sessionIdentity(value: object): number {
  const existing = sessionIdentityIds.get(value)
  if (existing !== undefined) return existing

  const identity = nextSessionIdentityId
  nextSessionIdentityId += 1
  sessionIdentityIds.set(value, identity)
  return identity
}

function sudokuSessionKey(
  storage: SudokuStoragePort,
  puzzles: SudokuPuzzleProvider,
  clock: SudokuClock | undefined,
): string {
  const clockIdentity = clock === undefined
    ? 'default'
    : String(sessionIdentity(clock))
  return `${sessionIdentity(storage)}:${sessionIdentity(puzzles)}:${clockIdentity}`
}

export function SudokuPage({
  storage,
  puzzles = builtinSudokuPuzzleProvider,
  clock,
}: {
  readonly storage?: SudokuStoragePort
  readonly puzzles?: SudokuPuzzleProvider
  readonly clock?: SudokuClock
}) {
  const resolvedStorage = useMemo(
    () => storage ?? createStorageForPuzzles(puzzles),
    [puzzles, storage],
  )
  const sessionKey = sudokuSessionKey(resolvedStorage, puzzles, clock)

  return (
    <SudokuSession
      clock={clock}
      key={sessionKey}
      puzzles={puzzles}
      storage={resolvedStorage}
    />
  )
}

function SudokuSession({
  storage,
  puzzles,
  clock,
}: {
  readonly storage: SudokuStoragePort
  readonly puzzles: SudokuPuzzleProvider
  readonly clock?: SudokuClock
}) {
  const controller = useSudokuGame({ storage, puzzles, clock })
  const audio = useAudioController()
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const confirmRestoreFocusRef = useRef<HTMLElement | null>(null)
  const completionRestoreFocusRef = useRef<HTMLElement | null>(null)
  const difficultyTriggerRef = useRef<HTMLButtonElement | null>(null)
  const completionOpen = controller.game.status === 'completed'
  const confirmOpen = pendingAction !== null && !completionOpen
  const modalOpen = completionOpen || confirmOpen
  const visibleNotice = controller.notice ?? audio.notice

  function dismissVisibleNotice(): void {
    if (controller.notice !== null) controller.dismissNotice()
    else audio.dismissNotice()
  }

  function captureActiveElement(target: { current: HTMLElement | null }): void {
    target.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null
  }

  function requestConfirmation(
    action: PendingAction,
    trigger: HTMLButtonElement,
  ): void {
    if (modalOpen || pendingAction !== null) return
    confirmRestoreFocusRef.current = trigger
    setPendingAction(action)
  }

  function requireRequestTrigger(
    event: MouseEvent<HTMLButtonElement> | undefined,
    actionName: string,
  ): HTMLButtonElement {
    if (event === undefined) {
      throw new Error(`${actionName}请求必须由按钮点击事件触发`)
    }
    return event.currentTarget
  }

  function handleSelect(index: number): void {
    if (modalOpen) return
    controller.select(index)
  }

  function handleMove(direction: MoveDirection): void {
    if (modalOpen) return
    controller.move(direction)
  }

  function handleDigit(digit: Digit): void {
    if (modalOpen) return
    captureActiveElement(completionRestoreFocusRef)
    controller.enter(digit)
  }

  function handleErase(): void {
    if (modalOpen) return
    controller.erase()
  }

  function handleToggleNotes(): void {
    if (modalOpen) return
    controller.toggleNotes()
  }

  function handleUndo(): void {
    if (modalOpen) return
    controller.undo()
  }

  function handleRestartRequest(event?: MouseEvent<HTMLButtonElement>): void {
    if (modalOpen) return
    if (controller.hasProgress) {
      requestConfirmation(
        { kind: 'restart' },
        requireRequestTrigger(event, '重新开始'),
      )
    }
    else controller.restart()
  }

  function handleNewPuzzleRequest(event?: MouseEvent<HTMLButtonElement>): void {
    if (modalOpen) return
    if (controller.hasProgress) {
      requestConfirmation(
        { kind: 'new-puzzle' },
        requireRequestTrigger(event, '换题'),
      )
    }
    else controller.newPuzzle(controller.game.difficulty)
  }

  function captureDifficultyTrigger(event: MouseEvent<HTMLDivElement>): void {
    if (modalOpen || !(event.target instanceof Element)) return
    const trigger = event.target.closest('button')
    if (
      trigger instanceof HTMLButtonElement &&
      event.currentTarget.contains(trigger)
    ) {
      difficultyTriggerRef.current = trigger
    }
  }

  function handleDifficultyRequest(target: Difficulty): void {
    if (modalOpen || target === controller.game.difficulty) return
    if (controller.hasProgress) {
      const trigger = difficultyTriggerRef.current
      if (trigger === null || !trigger.isConnected) {
        throw new Error('切换难度请求必须由难度按钮点击事件触发')
      }
      requestConfirmation({ kind: 'difficulty', target }, trigger)
    }
    else controller.newPuzzle(target)
  }

  function handleConfirm(): void {
    if (pendingAction === null || completionOpen) return

    switch (pendingAction.kind) {
      case 'restart':
        controller.restart()
        break
      case 'new-puzzle':
        controller.newPuzzle(controller.game.difficulty)
        break
      case 'difficulty':
        controller.newPuzzle(pendingAction.target)
        break
    }
    setPendingAction(null)
  }

  function handleCompletionNewPuzzle(): void {
    setPendingAction(null)
    controller.newPuzzle(controller.game.difficulty)
  }

  return (
    <main className="sudoku-page">
      <div
        aria-hidden={modalOpen ? true : undefined}
        className="game-content"
        inert={modalOpen ? true : undefined}
      >
        <header className="game-header">
          <a className="back-link" href="#/">返回小游戏</a>
          <div className="game-title-row">
            <h1>数独</h1>
            <MusicToggle />
          </div>
          <div className="sudoku-meta">
            <span>难度：{difficultyLabel(controller.game.difficulty)}</span>
            <span>用时：{formatElapsedTime(controller.elapsedMs)}</span>
          </div>
        </header>
        <NoticeBanner message={visibleNotice} onDismiss={dismissVisibleNotice} />
        <p aria-label="棋盘冲突" aria-live="polite" className="conflict-status" role="status">
          当前有 {controller.conflicts.size} 个冲突格
        </p>
        <div className="sudoku-layout">
          <SudokuBoard
            conflicts={controller.conflicts}
            game={controller.game}
            onDigit={handleDigit}
            onErase={handleErase}
            onMove={handleMove}
            onSelect={handleSelect}
            onToggleNotes={handleToggleNotes}
            onUndo={handleUndo}
          />
          <div className="sudoku-panel">
            <NumberPad
              noteMode={controller.game.noteMode}
              onDigit={handleDigit}
              onErase={handleErase}
              onToggleNotes={handleToggleNotes}
            />
            <SudokuControls
              canUndo={controller.hasProgress && controller.game.status === 'playing'}
              onNewPuzzle={handleNewPuzzleRequest}
              onRestart={handleRestartRequest}
              onUndo={handleUndo}
            />
            <div onClickCapture={captureDifficultyTrigger}>
              <DifficultySelector
                difficulty={controller.game.difficulty}
                onSelect={handleDifficultyRequest}
              />
            </div>
          </div>
        </div>
      </div>
      {confirmOpen && pendingAction !== null ? (
        <ConfirmDialog
          kind={pendingAction.kind}
          onCancel={() => setPendingAction(null)}
          onConfirm={handleConfirm}
          restoreFocusRef={confirmRestoreFocusRef}
        />
      ) : null}
      {completionOpen ? (
        <CompletionDialog
          difficulty={controller.game.difficulty}
          elapsedMs={controller.elapsedMs}
          onNewPuzzle={handleCompletionNewPuzzle}
          restoreFocusRef={completionRestoreFocusRef}
        />
      ) : null}
    </main>
  )
}
