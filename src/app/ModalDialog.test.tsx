import { act, render, screen, waitFor } from '@testing-library/react'
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

function StackedDialogHarness({
  bottomOpen,
  topOpen,
}: {
  readonly bottomOpen: boolean
  readonly topOpen: boolean
}) {
  const bottomButtonRef = useRef<HTMLButtonElement>(null)
  const topButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button type="button">背景操作</button>
      {bottomOpen ? (
        <ModalDialog initialFocusRef={bottomButtonRef} title="下层弹窗">
          <div className="dialog-actions">
            <button ref={bottomButtonRef} type="button">下层操作</button>
          </div>
        </ModalDialog>
      ) : null}
      {topOpen ? (
        <ModalDialog initialFocusRef={topButtonRef} title="上层弹窗">
          <div className="dialog-actions">
            <button ref={topButtonRef} type="button">上层操作</button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  )
}

function ExplicitRestoreHarness() {
  const [open, setOpen] = useState(false)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const restoreButtonRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>焦点 A</button>
      <button ref={restoreButtonRef} type="button">恢复目标 B</button>
      {open ? (
        <ModalDialog
          initialFocusRef={closeButtonRef}
          restoreFocusRef={restoreButtonRef}
          title="显式恢复弹窗"
        >
          <div className="dialog-actions">
            <button ref={closeButtonRef} type="button" onClick={() => setOpen(false)}>
              关闭显式恢复弹窗
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </>
  )
}

function createAppRoot(): HTMLDivElement {
  const root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
  return root
}

describe('ModalDialog', () => {
  it.each([
    ['主 root', 'root'],
    ['第二个 root', 'second-root'],
  ])('从%s打开时隔离并精确恢复所有 body 背景层', async (_, activeRootId) => {
    const user = userEvent.setup()
    const root = createAppRoot()
    root.setAttribute('aria-hidden', 'false')
    const secondRoot = document.createElement('div')
    secondRoot.id = 'second-root'
    document.body.append(secondRoot)
    const aside = document.createElement('aside')
    aside.setAttribute('aria-hidden', 'legacy')
    aside.setAttribute('inert', '')
    document.body.append(aside)
    const activeRoot = activeRootId === 'root' ? root : secondRoot
    const inactiveRoot = activeRoot === root ? secondRoot : root
    inactiveRoot.append(document.createElement('button'))
    const view = render(
      <DialogHarness />,
      { baseElement: document.body, container: activeRoot },
    )
    const trigger = screen.getByRole('button', { name: '打开说明' })

    try {
      await user.click(trigger)

      const backdrop = screen.getByRole('dialog', { name: '共享弹窗' }).parentElement
      expect(root).toHaveAttribute('inert')
      expect(root).toHaveAttribute('aria-hidden', 'true')
      expect(secondRoot).toHaveAttribute('inert')
      expect(secondRoot).toHaveAttribute('aria-hidden', 'true')
      expect(aside).toHaveAttribute('inert')
      expect(aside).toHaveAttribute('aria-hidden', 'true')
      expect(backdrop).toHaveAttribute('data-modal-layer')
      expect(backdrop).not.toHaveAttribute('inert')
      expect(backdrop).not.toHaveAttribute('aria-hidden')

      await user.keyboard('{Escape}')

      expect(root).not.toHaveAttribute('inert')
      expect(root).toHaveAttribute('aria-hidden', 'false')
      expect(secondRoot).not.toHaveAttribute('inert')
      expect(secondRoot).not.toHaveAttribute('aria-hidden')
      expect(aside).toHaveAttribute('inert')
      expect(aside).toHaveAttribute('aria-hidden', 'legacy')
      await waitFor(() => expect(trigger).toHaveFocus())
    } finally {
      view.unmount()
      root.remove()
      secondRoot.remove()
      aside.remove()
    }
  })

  it('后续 Modal 注册时补隔离会话期间新增的 body 背景层', async () => {
    const root = createAppRoot()
    const view = render(
      <StackedDialogHarness bottomOpen={false} topOpen={false} />,
      { baseElement: document.body, container: root },
    )
    const backgroundButton = screen.getByRole('button', { name: '背景操作' })
    backgroundButton.focus()
    view.rerender(<StackedDialogHarness bottomOpen topOpen={false} />)

    const lateBackground = document.createElement('aside')
    lateBackground.setAttribute('aria-hidden', 'late-original')
    document.body.append(lateBackground)

    try {
      view.rerender(<StackedDialogHarness bottomOpen topOpen />)

      expect(lateBackground).toHaveAttribute('inert')
      expect(lateBackground).toHaveAttribute('aria-hidden', 'true')

      view.rerender(<StackedDialogHarness bottomOpen={false} topOpen={false} />)

      expect(lateBackground).not.toHaveAttribute('inert')
      expect(lateBackground).toHaveAttribute('aria-hidden', 'late-original')
      await waitFor(() => expect(backgroundButton).toHaveFocus())
    } finally {
      view.unmount()
      root.remove()
      lateBackground.remove()
    }
  })

  it('portal 到 body 并隔离整个应用根节点，Escape 后恢复背景和焦点', async () => {
    const user = userEvent.setup()
    const root = createAppRoot()
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

  it('最后一个 Modal 关闭时优先恢复首次注册提供的 restoreFocusRef', async () => {
    const user = userEvent.setup()
    const root = createAppRoot()
    const view = render(
      <ExplicitRestoreHarness />,
      { baseElement: document.body, container: root },
    )
    const openingButton = screen.getByRole('button', { name: '焦点 A' })
    const restoreButton = screen.getByRole('button', { name: '恢复目标 B' })

    await user.click(openingButton)
    await user.click(screen.getByRole('button', { name: '关闭显式恢复弹窗' }))

    await waitFor(() => expect(restoreButton).toHaveFocus())
    view.unmount()
    root.remove()
  })

  it('双 Modal 仅安装一个全局焦点监听器且只有栈顶保持可交互', () => {
    const addEventListener = vi.spyOn(document, 'addEventListener')
    const removeEventListener = vi.spyOn(document, 'removeEventListener')
    const root = createAppRoot()
    const view = render(
      <StackedDialogHarness bottomOpen={false} topOpen={false} />,
      { baseElement: document.body, container: root },
    )
    screen.getByRole('button', { name: '背景操作' }).focus()

    view.rerender(<StackedDialogHarness bottomOpen topOpen />)

    const bottomDialog = screen.getByRole('dialog', { hidden: true, name: '下层弹窗' })
    const topDialog = screen.getByRole('dialog', { name: '上层弹窗' })
    expect(addEventListener.mock.calls.filter(([type]) => type === 'focusin')).toHaveLength(1)
    expect(bottomDialog).toHaveAttribute('aria-modal', 'false')
    expect(bottomDialog.parentElement).toHaveAttribute('inert')
    expect(bottomDialog.parentElement).toHaveAttribute('aria-hidden', 'true')
    expect(topDialog).toHaveAttribute('aria-modal', 'true')
    expect(topDialog.parentElement).not.toHaveAttribute('inert')
    expect(screen.getByRole('button', { name: '上层操作' })).toHaveFocus()

    act(() => screen.getByRole('button', { hidden: true, name: '下层操作' }).focus())
    expect(screen.getByRole('button', { name: '上层操作' })).toHaveFocus()

    view.unmount()
    expect(removeEventListener.mock.calls.filter(([type]) => type === 'focusin')).toHaveLength(1)
    expect(root).not.toHaveAttribute('inert')
    root.remove()
  })

  it('先关闭栈顶时恢复下层 active 和焦点，最后关闭才恢复 root 与背景焦点', async () => {
    const root = createAppRoot()
    const view = render(
      <StackedDialogHarness bottomOpen={false} topOpen={false} />,
      { baseElement: document.body, container: root },
    )
    const backgroundButton = screen.getByRole('button', { name: '背景操作' })
    backgroundButton.focus()
    view.rerender(<StackedDialogHarness bottomOpen topOpen />)

    view.rerender(<StackedDialogHarness bottomOpen topOpen={false} />)

    const bottomDialog = screen.getByRole('dialog', { name: '下层弹窗' })
    expect(bottomDialog).toHaveAttribute('aria-modal', 'true')
    expect(bottomDialog.parentElement).not.toHaveAttribute('inert')
    expect(root).toHaveAttribute('inert')
    await waitFor(() => expect(screen.getByRole('button', { name: '下层操作' })).toHaveFocus())

    view.rerender(<StackedDialogHarness bottomOpen={false} topOpen={false} />)

    expect(root).not.toHaveAttribute('inert')
    expect(root).not.toHaveAttribute('aria-hidden')
    await waitFor(() => expect(backgroundButton).toHaveFocus())
    view.unmount()
    root.remove()
  })

  it('先关闭下层不影响栈顶，最后关闭仍完整恢复 root 与最初背景焦点', async () => {
    const root = createAppRoot()
    const view = render(
      <StackedDialogHarness bottomOpen={false} topOpen={false} />,
      { baseElement: document.body, container: root },
    )
    const backgroundButton = screen.getByRole('button', { name: '背景操作' })
    backgroundButton.focus()
    view.rerender(<StackedDialogHarness bottomOpen topOpen />)

    view.rerender(<StackedDialogHarness bottomOpen={false} topOpen />)

    expect(screen.getByRole('dialog', { name: '上层弹窗' })).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('button', { name: '上层操作' })).toHaveFocus()
    expect(root).toHaveAttribute('inert')

    view.rerender(<StackedDialogHarness bottomOpen={false} topOpen={false} />)

    expect(root).not.toHaveAttribute('inert')
    expect(root).not.toHaveAttribute('aria-hidden')
    await waitFor(() => expect(backgroundButton).toHaveFocus())
    view.unmount()
    root.remove()
  })
})
