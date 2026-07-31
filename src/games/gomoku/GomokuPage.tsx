import { useMemo, useRef, useState } from 'react'

import { ConfirmDialog } from './components/ConfirmDialog'
import { GameControls } from './components/GameControls'
import { GomokuBoard } from './components/GomokuBoard'
import { NoticeBanner } from './components/NoticeBanner'
import { ResultDialog } from './components/ResultDialog'
import { TurnIndicator } from './components/TurnIndicator'
import { type Position } from './core/types'
import {
  createBrowserGomokuStorage,
  type GomokuStoragePort,
} from './storage/storage'
import { useGomokuGame } from './useGomokuGame'

export function GomokuPage({ storage }: { readonly storage?: GomokuStoragePort }) {
  const resolvedStorage = useMemo(
    () => storage ?? createBrowserGomokuStorage(),
    [storage],
  )
  const controller = useGomokuGame(resolvedStorage)
  const [confirmRestart, setConfirmRestart] = useState(false)
  const resultFocusRef = useRef<HTMLElement | null>(null)

  function handlePlay(position: Position): void {
    const activeElement = document.activeElement
    resultFocusRef.current = activeElement instanceof HTMLButtonElement &&
      activeElement.dataset.row === String(position.row) &&
      activeElement.dataset.col === String(position.col)
      ? activeElement
      : null
    controller.play(position)
  }

  function handleRestartRequest(): void {
    if (controller.game.history.length === 0) {
      controller.restart()
      return
    }

    setConfirmRestart(true)
  }

  function handleConfirmRestart(): void {
    controller.restart()
    setConfirmRestart(false)
  }

  return (
    <main className="gomoku-page">
      <header className="game-header">
        <a className="back-link" href="#/">返回小游戏</a>
        <h1>五子棋</h1>
        <TurnIndicator game={controller.game} />
      </header>
      <NoticeBanner message={controller.notice} onDismiss={controller.dismissNotice} />
      <GomokuBoard game={controller.game} onPlace={handlePlay} />
      <GameControls
        canUndo={controller.game.history.length > 0}
        onRestart={handleRestartRequest}
        onUndo={controller.undo}
      />
      <ConfirmDialog
        onCancel={() => setConfirmRestart(false)}
        onConfirm={handleConfirmRestart}
        open={confirmRestart}
      />
      {controller.game.status !== 'playing' ? (
        <ResultDialog
          game={controller.game}
          onRestart={controller.restart}
          onUndo={controller.undo}
          restoreFocusRef={resultFocusRef}
        />
      ) : null}
    </main>
  )
}
