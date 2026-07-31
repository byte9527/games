import { useRef } from 'react'

import { ModalDialog } from '../../../app/ModalDialog'

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  if (!open) return null

  return (
    <ModalDialog
      initialFocusRef={cancelButtonRef}
      onEscape={onCancel}
      title="重新开始本局？"
    >
      <p>当前棋局会被清除。</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} ref={cancelButtonRef}>
          取消
        </button>
        <button type="button" onClick={onConfirm}>
          确认重新开始
        </button>
      </div>
    </ModalDialog>
  )
}
