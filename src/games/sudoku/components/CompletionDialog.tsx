import { useRef, type RefObject } from 'react'

import { ModalDialog } from '../../../app/ModalDialog'
import type { Difficulty } from '../core/types'

export function formatElapsedTime(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('数独用时必须是有限的非负数')
  }

  const totalSeconds = Math.floor(elapsedMs / 1000)
  const seconds = totalSeconds % 60
  const totalMinutes = Math.floor(totalSeconds / 60)
  const minutes = totalMinutes % 60
  const hours = Math.floor(totalMinutes / 60)

  if (hours === 0) return `${totalMinutes}:${String(seconds).padStart(2, '0')}`
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function difficultyLabel(difficulty: Difficulty): string {
  switch (difficulty) {
    case 'easy':
      return '简单'
    case 'medium':
      return '中等'
    case 'hard':
      return '困难'
    default:
      throw new Error(`未知的数独难度：${String(difficulty)}`)
  }
}

export function CompletionDialog({
  difficulty,
  elapsedMs,
  onNewPuzzle,
  restoreFocusRef,
}: {
  readonly difficulty: Difficulty
  readonly elapsedMs: number
  readonly onNewPuzzle: () => void
  readonly restoreFocusRef?: RefObject<HTMLElement | null>
}) {
  const newPuzzleButtonRef = useRef<HTMLButtonElement>(null)
  const label = difficultyLabel(difficulty)
  const elapsedTime = formatElapsedTime(elapsedMs)

  return (
    <ModalDialog
      initialFocusRef={newPuzzleButtonRef}
      restoreFocusRef={restoreFocusRef}
      title="数独完成"
    >
      <p>难度：{label}</p>
      <p>用时：{elapsedTime}</p>
      <div className="dialog-actions">
        <button ref={newPuzzleButtonRef} type="button" onClick={onNewPuzzle}>
          再来一题
        </button>
        <a href="#/">返回小游戏</a>
      </div>
    </ModalDialog>
  )
}
