import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { StrictMode, useRef, useState } from 'react'

import type { Difficulty, Digit } from '../core/types'
import { CompletionDialog, formatElapsedTime } from './CompletionDialog'
import { ConfirmDialog, type ConfirmDialogKind } from './ConfirmDialog'
import { DifficultySelector } from './DifficultySelector'
import { NumberPad } from './NumberPad'
import { SudokuControls } from './SudokuControls'

describe('formatElapsedTime', () => {
  it.each([
    [0, '0:00'],
    [999, '0:00'],
    [59_999, '0:59'],
    [60_000, '1:00'],
    [3_599_999, '59:59'],
    [3_600_000, '1:00:00'],
    [3_661_000, '1:01:01'],
  ])('把 %i 毫秒格式化为 %s', (elapsedMs, expected) => {
    expect(formatElapsedTime(elapsedMs)).toBe(expected)
  })

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])(
    '拒绝非法用时 %s',
    (elapsedMs) => {
      expect(() => formatElapsedTime(elapsedMs)).toThrow('数独用时必须是有限的非负数')
    },
  )
})

describe('NumberPad', () => {
  it('按顺序渲染数字 1 到 9，并准确回调每个 Digit', async () => {
    const user = userEvent.setup()
    const onDigit = vi.fn<(digit: Digit) => void>()
    render(
      <NumberPad
        noteMode={false}
        onDigit={onDigit}
        onErase={() => undefined}
        onToggleNotes={() => undefined}
      />,
    )

    const group = screen.getByRole('group', { name: '数独数字键盘' })
    const buttons = within(group).getAllByRole('button')
    const digitButtons = buttons.slice(0, 9)

    expect(digitButtons).toHaveLength(9)
    expect(digitButtons.every((button) => button.tagName === 'BUTTON')).toBe(true)
    digitButtons.forEach((button, index) => {
      expect(button).toHaveAccessibleName(`数字 ${index + 1}`)
    })

    for (const button of digitButtons) await user.click(button)

    expect(onDigit.mock.calls.map(([digit]) => digit)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9])
  })

  it('候选模式名称稳定、pressed 受控，并准确触发切换和擦除', async () => {
    const user = userEvent.setup()
    const onToggleNotes = vi.fn()
    const onErase = vi.fn()
    const view = render(
      <NumberPad
        noteMode={false}
        onDigit={() => undefined}
        onErase={onErase}
        onToggleNotes={onToggleNotes}
      />,
    )

    const noteButton = screen.getByRole('button', { name: '候选模式' })
    expect(noteButton).toHaveAttribute('aria-pressed', 'false')
    expect(noteButton).toHaveAccessibleName('候选模式')

    await user.click(noteButton)
    expect(onToggleNotes).toHaveBeenCalledOnce()
    expect(noteButton).toHaveAttribute('aria-pressed', 'false')

    view.rerender(
      <NumberPad
        noteMode
        onDigit={() => undefined}
        onErase={onErase}
        onToggleNotes={onToggleNotes}
      />,
    )
    expect(screen.getByRole('button', { name: '候选模式' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByRole('button', { name: '候选模式' })).toHaveAccessibleName('候选模式')

    await user.click(screen.getByRole('button', { name: '擦除' }))
    expect(onErase).toHaveBeenCalledOnce()
  })
})

describe('SudokuControls', () => {
  it('禁用撤销时提供可访问说明，启用后移除错误关联并准确回调', async () => {
    const user = userEvent.setup()
    const onUndo = vi.fn()
    const onRestart = vi.fn()
    const onNewPuzzle = vi.fn()
    const view = render(
      <SudokuControls
        canUndo={false}
        onNewPuzzle={onNewPuzzle}
        onRestart={onRestart}
        onUndo={onUndo}
      />,
    )

    const group = screen.getByRole('group', { name: '数独控制区' })
    const undoButton = within(group).getByRole('button', { name: '撤销' })
    expect(undoButton).toBeDisabled()
    expect(undoButton).toHaveAccessibleDescription('暂无可撤销操作')
    expect(undoButton).toHaveAttribute('aria-describedby')

    view.rerender(
      <SudokuControls
        canUndo
        onNewPuzzle={onNewPuzzle}
        onRestart={onRestart}
        onUndo={onUndo}
      />,
    )
    const enabledUndoButton = screen.getByRole('button', { name: '撤销' })
    expect(enabledUndoButton).toBeEnabled()
    expect(enabledUndoButton).not.toHaveAttribute('aria-describedby')
    expect(enabledUndoButton).not.toHaveAccessibleDescription('暂无可撤销操作')

    await user.click(enabledUndoButton)
    await user.click(screen.getByRole('button', { name: '重新开始' }))
    await user.click(screen.getByRole('button', { name: '换一题' }))
    expect(onUndo).toHaveBeenCalledOnce()
    expect(onRestart).toHaveBeenCalledOnce()
    expect(onNewPuzzle).toHaveBeenCalledOnce()
  })

  it('多个禁用控制区使用不同说明 id', () => {
    render(
      <>
        <SudokuControls
          canUndo={false}
          onNewPuzzle={() => undefined}
          onRestart={() => undefined}
          onUndo={() => undefined}
        />
        <SudokuControls
          canUndo={false}
          onNewPuzzle={() => undefined}
          onRestart={() => undefined}
          onUndo={() => undefined}
        />
      </>,
    )

    const [firstUndo, secondUndo] = screen.getAllByRole('button', { name: '撤销' })
    if (firstUndo === undefined || secondUndo === undefined) {
      throw new Error('预期存在两个撤销按钮')
    }
    const firstDescriptionId = firstUndo.getAttribute('aria-describedby')
    const secondDescriptionId = secondUndo.getAttribute('aria-describedby')
    if (firstDescriptionId === null || secondDescriptionId === null) {
      throw new Error('禁用撤销按钮必须关联说明')
    }

    expect(firstDescriptionId).not.toBe(secondDescriptionId)
    expect(document.getElementById(firstDescriptionId)).toHaveTextContent('暂无可撤销操作')
    expect(document.getElementById(secondDescriptionId)).toHaveTextContent('暂无可撤销操作')
  })
})

describe('DifficultySelector', () => {
  it.each([
    ['easy', '简单'],
    ['medium', '中等'],
    ['hard', '困难'],
  ] as const)('当前难度 %s 唯一 pressed，并准确传递三个难度', async (difficulty, label) => {
    const user = userEvent.setup()
    const onSelect = vi.fn<(selected: Difficulty) => void>()
    render(<DifficultySelector difficulty={difficulty} onSelect={onSelect} />)

    const group = screen.getByRole('group', { name: '选择难度' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons).toHaveLength(3)
    expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true'))
      .toEqual([within(group).getByRole('button', { name: label })])

    for (const button of buttons) await user.click(button)
    expect(onSelect.mock.calls.map(([selected]) => selected)).toEqual(['easy', 'medium', 'hard'])
  })

  it('rerender 后只更新受控 pressed 状态', () => {
    const onSelect = vi.fn<(selected: Difficulty) => void>()
    const view = render(<DifficultySelector difficulty="easy" onSelect={onSelect} />)

    view.rerender(<DifficultySelector difficulty="hard" onSelect={onSelect} />)

    expect(screen.getByRole('button', { name: '简单' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '中等' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '困难' })).toHaveAttribute('aria-pressed', 'true')
    expect(onSelect).not.toHaveBeenCalled()
  })
})

function ConfirmRestoreHarness() {
  const [open, setOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement>(null)

  return (
    <>
      <button ref={triggerRef} type="button" onClick={() => setOpen(true)}>
        打开确认
      </button>
      {open ? (
        <ConfirmDialog
          kind="restart"
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
          restoreFocusRef={triggerRef}
        />
      ) : null}
    </>
  )
}

describe('ConfirmDialog', () => {
  it.each([
    [
      'restart',
      '重新开始这道题？',
      '当前进度会被清除，并恢复这道题的初始状态。',
      '确认重新开始',
    ],
    [
      'new-puzzle',
      '换一道新题？',
      '当前进度会被清除，并加载一道新题。',
      '确认换题',
    ],
    [
      'difficulty',
      '切换难度？',
      '当前进度会被清除，并按所选难度加载新题。',
      '确认切换难度',
    ],
  ] as const)(
    '%s 显示独立标题、正文和确认操作',
    async (kind, title, body, confirmName) => {
      const user = userEvent.setup()
      const onCancel = vi.fn()
      const onConfirm = vi.fn()
      render(<ConfirmDialog kind={kind} onCancel={onCancel} onConfirm={onConfirm} />)

      const dialog = screen.getByRole('dialog', { name: title })
      expect(within(dialog).getByText(body).textContent).toBe(body)
      expect(within(dialog).getByRole('button', { name: '取消' })).toHaveFocus()

      await user.click(within(dialog).getByRole('button', { name: confirmName }))
      expect(onConfirm).toHaveBeenCalledOnce()
      expect(onCancel).not.toHaveBeenCalled()
    },
  )

  it('取消按钮和 Escape 各准确取消，Escape 阻止默认行为', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const view = render(
      <ConfirmDialog kind="new-puzzle" onCancel={onCancel} onConfirm={() => undefined} />,
    )

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(onCancel).toHaveBeenCalledOnce()

    onCancel.mockClear()
    const dialog = screen.getByRole('dialog', { name: '换一道新题？' })
    expect(fireEvent.keyDown(dialog, { key: 'Escape' })).toBe(false)
    expect(onCancel).toHaveBeenCalledOnce()
    view.unmount()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('在首尾操作之间真实循环 Tab 焦点', async () => {
    const user = userEvent.setup()
    render(
      <ConfirmDialog kind="restart" onCancel={() => undefined} onConfirm={() => undefined} />,
    )
    const cancelButton = screen.getByRole('button', { name: '取消' })
    const confirmButton = screen.getByRole('button', { name: '确认重新开始' })

    expect(cancelButton).toHaveFocus()
    await user.tab({ shift: true })
    expect(confirmButton).toHaveFocus()
    await user.tab()
    expect(cancelButton).toHaveFocus()
  })

  it('同一 kind rerender 不重复把焦点拉回取消按钮', () => {
    const props = {
      kind: 'restart' as ConfirmDialogKind,
      onCancel: () => undefined,
      onConfirm: () => undefined,
    }
    const view = render(<ConfirmDialog {...props} />)
    const confirmButton = screen.getByRole('button', { name: '确认重新开始' })
    confirmButton.focus()

    view.rerender(<ConfirmDialog {...props} onConfirm={vi.fn()} />)

    expect(confirmButton).toHaveFocus()
  })

  it('关闭后按显式 ref 恢复焦点，StrictMode 下不重复 portal dialog', async () => {
    const user = userEvent.setup()
    const view = render(
      <StrictMode>
        <ConfirmRestoreHarness />
      </StrictMode>,
    )
    const trigger = screen.getByRole('button', { name: '打开确认' })

    await user.click(trigger)
    expect(screen.getAllByRole('dialog')).toHaveLength(1)
    expect(screen.getByRole('button', { name: '取消' })).toHaveFocus()

    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await waitFor(() => expect(trigger).toHaveFocus())

    view.unmount()
    expect(document.querySelectorAll('[data-modal-layer]')).toHaveLength(0)
  })
})

describe('CompletionDialog', () => {
  it.each([
    ['easy', '简单'],
    ['medium', '中等'],
    ['hard', '困难'],
  ] as const)('展示 %s 的中文难度、格式化用时和固定操作', async (difficulty, label) => {
    const user = userEvent.setup()
    const onNewPuzzle = vi.fn()
    render(
      <CompletionDialog
        difficulty={difficulty}
        elapsedMs={62_000}
        onNewPuzzle={onNewPuzzle}
      />,
    )

    const dialog = screen.getByRole('dialog', { name: '数独完成' })
    expect(within(dialog).getByText(`难度：${label}`).textContent).toBe(`难度：${label}`)
    expect(within(dialog).getByText('用时：1:02').textContent).toBe('用时：1:02')
    const newPuzzleButton = within(dialog).getByRole('button', { name: '再来一题' })
    expect(newPuzzleButton).toHaveFocus()
    expect(within(dialog).getByRole('link', { name: '返回小游戏' })).toHaveAttribute(
      'href',
      '#/',
    )

    await user.click(newPuzzleButton)
    expect(onNewPuzzle).toHaveBeenCalledOnce()
  })

  it('不响应 Escape 关闭', () => {
    render(
      <CompletionDialog difficulty="easy" elapsedMs={0} onNewPuzzle={() => undefined} />,
    )
    const dialog = screen.getByRole('dialog', { name: '数独完成' })

    expect(fireEvent.keyDown(dialog, { key: 'Escape' })).toBe(true)
    expect(dialog).toBeInTheDocument()
  })

  it('渲染时拒绝非法用时', () => {
    expect(() => render(
      <CompletionDialog difficulty="easy" elapsedMs={-1} onNewPuzzle={() => undefined} />,
    )).toThrow('数独用时必须是有限的非负数')
  })

  it('运行时拒绝伪造的非法难度', () => {
    const invalidDifficulty = 'expert' as Difficulty

    expect(() => render(
      <CompletionDialog
        difficulty={invalidDifficulty}
        elapsedMs={0}
        onNewPuzzle={() => undefined}
      />,
    )).toThrow('未知的数独难度：expert')
  })
})
