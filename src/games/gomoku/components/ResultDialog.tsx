import { useRef } from 'react'

import { type GameState } from '../core/types'
import { ModalDialog } from './ConfirmDialog'

function resultTitle(game: GameState): string {
  if (game.status === 'draw') return '本局和棋'
  if (game.winner === 'black') return '黑方获胜'
  if (game.winner === 'white') return '白方获胜'
  return '棋局状态异常'
}

export function ResultDialog({
  game,
  onUndo,
  onRestart,
}: {
  readonly game: GameState
  readonly onUndo: () => void
  readonly onRestart: () => void
}) {
  const undoButtonRef = useRef<HTMLButtonElement>(null)

  if (game.status === 'playing') return null

  return (
    <ModalDialog initialFocusRef={undoButtonRef} title={resultTitle(game)}>
      <div className="dialog-actions">
        <button type="button" onClick={onUndo} ref={undoButtonRef}>
          悔棋一步
        </button>
        <button type="button" onClick={onRestart}>
          再来一局
        </button>
        <a href="#/">返回小游戏</a>
      </div>
    </ModalDialog>
  )
}
