import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'

import { ModalDialog } from './ModalDialog'

function DialogHarness() {
  const [open, setOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>打开说明</button>
      {open ? (
        <ModalDialog
          initialFocusRef={closeButtonRef}
          onEscape={() => setOpen(false)}
          title="共享弹窗"
        >
          <div className="dialog-actions">
            <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)}>
              关闭
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  )
}

describe('ModalDialog', () => {
  it('portal 到 body 并隔离整个应用根节点，Escape 后恢复背景和焦点', async () => {
    const user = userEvent.setup()
    const root = document.createElement('div')
    root.id = 'root'
    document.body.append(root)
    const view = render(<DialogHarness />, { baseElement: document.body, container: root })
    const trigger = screen.getByRole('button', { name: '打开说明' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '共享弹窗' })
    expect(dialog.closest('.dialog-backdrop')?.parentElement).toBe(document.body)
    expect(root).not.toContainElement(dialog)
    expect(root).toHaveAttribute('inert')
    expect(root).toHaveAttribute('aria-hidden', 'true')
    expect(screen.getByRole('button', { name: '关闭' })).toHaveFocus()

    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(root).not.toHaveAttribute('inert')
    expect(root).not.toHaveAttribute('aria-hidden')
    expect(trigger).toHaveFocus()
    view.unmount()
    root.remove()
  })
})
