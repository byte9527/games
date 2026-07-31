import { useMemo, useState } from 'react'

import { ConfirmDialog } from './components/ConfirmDialog'
import { GameControls } from './components/GameControls'
import { GomokuBoard } from './components/GomokuBoard'
import { NoticeBanner } from './components/NoticeBanner'
import { ResultDialog } from './components/ResultDialog'
import { TurnIndicator } from './components/TurnIndicator'
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
      <header>
        <a href="#/">返回小游戏</a>
        <h1>五子棋</h1>
        <TurnIndicator game={controller.game} />
      </header>
      <NoticeBanner message={controller.notice} onDismiss={controller.dismissNotice} />
      <GomokuBoard game={controller.game} onPlace={controller.play} />
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
      <ResultDialog
        game={controller.game}
        onRestart={controller.restart}
        onUndo={controller.undo}
      />
    </main>
  )
}
