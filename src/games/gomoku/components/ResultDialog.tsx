import { useRef, type RefObject } from 'react'

import { ModalDialog } from '../../../app/ModalDialog'
import { type GameState } from '../core/types'

function resultTitle(game: GameState): string {
  switch (game.status) {
    case 'playing':
      throw new Error('ResultDialog 只能渲染终局棋局。')
    case 'draw':
      if (game.winner !== null) throw new Error('和棋棋局不能包含 winner。')
      return '本局和棋'
    case 'won':
      if (game.winner === 'black') return '黑方获胜'
      if (game.winner === 'white') return '白方获胜'
      throw new Error('获胜棋局必须包含 winner。')
  }
}

export function ResultDialog({
  game,
  onUndo,
  onRestart,
  restoreFocusRef,
}: {
  readonly game: GameState
  readonly onUndo: () => void
  readonly onRestart: () => void
  readonly restoreFocusRef?: RefObject<HTMLElement | null>
}) {
  const undoButtonRef = useRef<HTMLButtonElement>(null)
  const title = resultTitle(game)

  return (
    <ModalDialog
      initialFocusRef={undoButtonRef}
      restoreFocusRef={restoreFocusRef}
      title={title}
    >
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
