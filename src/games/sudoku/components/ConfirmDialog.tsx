import { useRef, type RefObject } from 'react'

import { ModalDialog } from '../../../app/ModalDialog'

export type ConfirmDialogKind = 'restart' | 'new-puzzle' | 'difficulty'

interface ConfirmDialogCopy {
  readonly title: string
  readonly body: string
  readonly confirmName: string
}

function copyForKind(kind: ConfirmDialogKind): ConfirmDialogCopy {
  switch (kind) {
    case 'restart':
      return {
        title: '重新开始这道题？',
        body: '当前进度会被清除，并恢复这道题的初始状态。',
        confirmName: '确认重新开始',
      }
    case 'new-puzzle':
      return {
        title: '换一道新题？',
        body: '当前进度会被清除，并加载一道新题。',
        confirmName: '确认换题',
      }
    case 'difficulty':
      return {
        title: '切换难度？',
        body: '当前进度会被清除，并按所选难度加载新题。',
        confirmName: '确认切换难度',
      }
  }
}

export function ConfirmDialog({
  kind,
  onCancel,
  onConfirm,
  restoreFocusRef,
}: {
  readonly kind: ConfirmDialogKind
  readonly onCancel: () => void
  readonly onConfirm: () => void
  readonly restoreFocusRef?: RefObject<HTMLElement | null>
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)
  const copy = copyForKind(kind)

  return (
    <ModalDialog
      initialFocusRef={cancelButtonRef}
      onEscape={onCancel}
      restoreFocusRef={restoreFocusRef}
      title={copy.title}
    >
      <p>{copy.body}</p>
      <div className="dialog-actions">
        <button ref={cancelButtonRef} type="button" onClick={onCancel}>
          取消
        </button>
        <button type="button" onClick={onConfirm}>
          {copy.confirmName}
        </button>
      </div>
    </ModalDialog>
  )
}
