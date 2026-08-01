import userEvent from '@testing-library/user-event'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { useState } from 'react'

import { createSudokuGame, moveSelection, selectCell } from '../core/game'
import type { SudokuGameState } from '../core/types'
import { SudokuBoard } from './SudokuBoard'

function createGame(overrides: Partial<SudokuGameState> = {}): SudokuGameState {
  return {
    ...createSudokuGame('board-test', 'easy', `5${'0'.repeat(80)}`),
    ...overrides,
  }
}

function createCallbacks() {
  return {
    onSelect: vi.fn(),
    onMove: vi.fn(),
    onDigit: vi.fn(),
    onErase: vi.fn(),
    onToggleNotes: vi.fn(),
    onUndo: vi.fn(),
  }
}

describe('SudokuBoard', () => {
  it('渲染具名 grid 和按行优先排列的 81 个原生按钮', () => {
    const game = createGame()

    render(<SudokuBoard game={game} conflicts={new Set()} {...createCallbacks()} />)

    const board = screen.getByRole('grid', { name: '九乘九数独棋盘' })
    const cells = within(board).getAllByRole('button')

    expect(cells).toHaveLength(81)
    expect(cells.every((cell) => cell.tagName === 'BUTTON')).toBe(true)
    expect(cells[0]).toHaveAccessibleName('第 1 行第 1 列，给定数字 5')
    expect(cells[10]).toHaveAccessibleName('第 2 行第 2 列，空格')
    expect(cells[80]).toHaveAccessibleName('第 9 行第 9 列，空格')
  })

  it('区分给定数字和玩家数字的视觉内容与可访问语义', () => {
    const base = createGame()
    const values = [...base.values]
    values[10] = 7

    render(
      <SudokuBoard
        game={{ ...base, values, selectedIndex: 10 }}
        conflicts={new Set()}
        {...createCallbacks()}
      />,
    )

    const given = screen.getByRole('button', { name: '第 1 行第 1 列，给定数字 5' })
    const player = screen.getByRole('button', { name: '第 2 行第 2 列，玩家数字 7' })
    const empty = screen.getByRole('button', { name: '第 1 行第 2 列，空格' })

    expect(given).toHaveAttribute('aria-disabled', 'true')
    expect(given).not.toBeDisabled()
    expect(player).not.toHaveAttribute('aria-disabled')
    expect(empty).not.toHaveAttribute('aria-disabled')
    expect(given.querySelector('.sudoku-cell__value--given')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
    expect(player.querySelector('.sudoku-cell__value--player')).toHaveAttribute(
      'aria-hidden',
      'true',
    )
  })

  it('仅 selectedIndex 是 Tab 停靠点且初始挂载不抢焦点', async () => {
    const user = userEvent.setup()
    render(
      <>
        <SudokuBoard
          game={createGame({ selectedIndex: 0 })}
          conflicts={new Set()}
          {...createCallbacks()}
        />
        <button type="button">棋盘后按钮</button>
      </>,
    )

    const board = screen.getByRole('grid', { name: '九乘九数独棋盘' })
    const cells = within(board).getAllByRole('button')
    const selected = cells[0]

    expect(document.body).toHaveFocus()
    expect(cells.filter((cell) => cell.tabIndex === 0)).toEqual([selected])
    expect(selected).toHaveAttribute('aria-current', 'true')
    expect(cells[1]).not.toHaveAttribute('aria-current')

    await user.tab()
    expect(selected).toHaveFocus()
    await user.tab()
    expect(screen.getByRole('button', { name: '棋盘后按钮' })).toHaveFocus()
  })

  it('点击任意格明确选择且不会因 focus 和 click 重复调用', async () => {
    const user = userEvent.setup()
    const callbacks = createCallbacks()
    render(
      <SudokuBoard
        game={createGame({ selectedIndex: 10 })}
        conflicts={new Set()}
        {...callbacks}
      />,
    )

    const given = screen.getByRole('button', { name: '第 1 行第 1 列，给定数字 5' })
    const selected = screen.getByRole('button', { name: '第 2 行第 2 列，空格' })
    const focusTarget = screen.getByRole('button', { name: '第 3 行第 3 列，空格' })

    await user.click(given)
    await user.click(selected)
    expect(callbacks.onSelect.mock.calls).toEqual([[0], [10]])

    callbacks.onSelect.mockClear()
    focusTarget.focus()
    expect(callbacks.onSelect).toHaveBeenCalledOnce()
    expect(callbacks.onSelect).toHaveBeenCalledWith(20)
  })

  it('为全部格稳定标记选中、关联、相同数字、冲突和宫内坐标', () => {
    const base = createGame()
    const values = [...base.values]
    values[40] = 7
    values[80] = 7
    const conflicts = new Set([40, 72])

    render(
      <SudokuBoard
        game={{ ...base, values, selectedIndex: 40 }}
        conflicts={conflicts}
        {...createCallbacks()}
      />,
    )

    const cells = within(
      screen.getByRole('grid', { name: '九乘九数独棋盘' }),
    ).getAllByRole('button')
    const selected = cells[40]

    for (const cell of cells) {
      expect(cell).toHaveAttribute('data-given')
      expect(cell).toHaveAttribute('data-selected')
      expect(cell).toHaveAttribute('data-related')
      expect(cell).toHaveAttribute('data-same-value')
      expect(cell).toHaveAttribute('data-conflict')
      expect(cell).toHaveAttribute('data-box-row')
      expect(cell).toHaveAttribute('data-box-col')
    }

    expect(cells.filter((cell) => cell.dataset.related === 'true')).toHaveLength(20)
    expect(selected).toHaveAttribute('data-selected', 'true')
    expect(selected).toHaveAttribute('data-related', 'false')
    expect(selected).toHaveAttribute('data-same-value', 'true')
    expect(selected).toHaveAttribute('data-conflict', 'true')
    expect(selected).toHaveAttribute('data-box-row', '1')
    expect(selected).toHaveAttribute('data-box-col', '1')
    expect(cells[0]).toHaveAttribute('data-given', 'true')
    expect(cells[0]).toHaveAttribute('data-related', 'false')
    expect(cells[0]).toHaveAttribute('data-same-value', 'false')
    expect(cells[1]).toHaveAttribute('data-given', 'false')
    expect(cells[4]).toHaveAttribute('data-related', 'true')
    expect(cells[36]).toHaveAttribute('data-related', 'true')
    expect(cells[30]).toHaveAttribute('data-related', 'true')
    expect(cells[80]).toHaveAttribute('data-related', 'false')
    expect(cells[80]).toHaveAttribute('data-same-value', 'true')
    expect(cells[72]).toHaveAttribute('data-conflict', 'true')
    expect(cells[27]).toHaveAttribute('data-box-row', '0')
    expect(cells[27]).toHaveAttribute('data-box-col', '0')
  })

  it('用固定九槽渲染按升序排列的候选数和空占位', () => {
    const base = createGame()
    const candidates = [...base.candidates]
    candidates[2] = (1 << 0) | (1 << 2) | (1 << 8)

    render(
      <SudokuBoard
        game={{ ...base, candidates }}
        conflicts={new Set([2])}
        {...createCallbacks()}
      />,
    )

    const candidateCell = screen.getByRole('button', {
      name: '第 1 行第 3 列，空格，候选数 1、3、9，存在冲突',
    })
    const slots = candidateCell.querySelectorAll('.sudoku-cell__candidate')

    expect(slots).toHaveLength(9)
    expect(Array.from(slots, (slot) => slot.getAttribute('data-digit'))).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
    ])
    expect(Array.from(slots, (slot) => slot.getAttribute('data-present'))).toEqual([
      'true',
      'false',
      'true',
      'false',
      'false',
      'false',
      'false',
      'false',
      'true',
    ])
    expect(Array.from(slots, (slot) => slot.textContent)).toEqual([
      '1',
      '',
      '3',
      '',
      '',
      '',
      '',
      '',
      '9',
    ])
    expect(Array.from(slots).every((slot) => slot.getAttribute('aria-hidden') === 'true')).toBe(
      true,
    )
    expect(
      screen
        .getByRole('button', { name: '第 1 行第 2 列，空格' })
        .querySelector('.sudoku-cell__candidates'),
    ).not.toBeInTheDocument()
  })

  it('精确描述给定、玩家数字、空格、候选与冲突且不修改只读输入', () => {
    const base = createGame()
    const values = [...base.values]
    values[10] = 4
    const candidates = [...base.candidates]
    candidates[2] = (1 << 8) | (1 << 0) | (1 << 2)
    const game = Object.freeze({
      ...base,
      givens: Object.freeze([...base.givens]),
      values: Object.freeze(values),
      candidates: Object.freeze(candidates),
    })
    const conflicts = new Set([10])
    const originalConflicts = [...conflicts]

    render(<SudokuBoard game={game} conflicts={conflicts} {...createCallbacks()} />)

    expect(screen.getByRole('button', { name: '第 1 行第 1 列，给定数字 5' })).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: '第 2 行第 2 列，玩家数字 4，存在冲突',
      }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: '第 1 行第 2 列，空格' })).toBeVisible()
    expect(
      screen.getByRole('button', {
        name: '第 1 行第 3 列，空格，候选数 1、3、9',
      }),
    ).toBeVisible()
    expect(game.givens).toEqual(base.givens)
    expect(game.values[10]).toBe(4)
    expect(game.candidates[2]).toBe(261)
    expect([...conflicts]).toEqual(originalConflicts)
  })

  it('处理完整键盘输入并为每个已处理按键阻止默认行为', () => {
    const callbacks = createCallbacks()
    render(
      <SudokuBoard
        game={createGame({ selectedIndex: 10 })}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    const cell = screen.getByRole('button', { name: '第 2 行第 2 列，空格' })

    for (const [key, direction] of [
      ['ArrowUp', 'up'],
      ['ArrowDown', 'down'],
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
      ['Home', 'row-start'],
      ['End', 'row-end'],
    ] as const) {
      expect(fireEvent.keyDown(cell, { key })).toBe(false)
      expect(callbacks.onMove).toHaveBeenLastCalledWith(direction)
    }

    for (const digit of [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) {
      expect(fireEvent.keyDown(cell, { key: String(digit) })).toBe(false)
      expect(callbacks.onDigit).toHaveBeenLastCalledWith(digit)
    }

    expect(fireEvent.keyDown(cell, { key: 'n' })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: 'N' })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: 'N', shiftKey: true })).toBe(false)
    expect(callbacks.onToggleNotes).toHaveBeenCalledTimes(3)

    expect(fireEvent.keyDown(cell, { key: 'Delete' })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: 'Backspace' })).toBe(false)
    expect(callbacks.onErase).toHaveBeenCalledTimes(2)

    expect(fireEvent.keyDown(cell, { key: 'z', ctrlKey: true })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: 'z', metaKey: true })).toBe(false)
    expect(callbacks.onUndo).toHaveBeenCalledTimes(2)
  })

  it('在棋盘边界仍发送明确移动方向且不自行计算目标格', () => {
    const callbacks = createCallbacks()
    render(
      <SudokuBoard
        game={createGame({ selectedIndex: 0 })}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    const cell = screen.getByRole('button', { name: '第 1 行第 1 列，给定数字 5' })

    expect(fireEvent.keyDown(cell, { key: 'ArrowUp' })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: 'ArrowLeft' })).toBe(false)
    expect(callbacks.onMove.mock.calls).toEqual([['up'], ['left']])
  })

  it('不拦截无关键、原生按钮激活键、非法数字或带修饰键的输入', () => {
    const callbacks = createCallbacks()
    render(
      <SudokuBoard
        game={createGame({ selectedIndex: 10 })}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    const cell = screen.getByRole('button', { name: '第 2 行第 2 列，空格' })
    const ignoredEvents = [
      { key: '0' },
      { key: 'Enter' },
      { key: ' ' },
      { key: 'Tab' },
      { key: 'a' },
      { key: '4', ctrlKey: true },
      { key: '4', metaKey: true },
      { key: '4', altKey: true },
      { key: '4', shiftKey: true },
      { key: 'ArrowRight', altKey: true },
      { key: 'ArrowRight', shiftKey: true },
      { key: 'Home', ctrlKey: true },
      { key: 'Backspace', altKey: true },
      { key: 'z', ctrlKey: true, shiftKey: true },
      { key: 'z', ctrlKey: true, altKey: true },
      { key: 'z', ctrlKey: true, metaKey: true },
      { key: '5', isComposing: true },
    ]

    for (const eventInit of ignoredEvents) {
      expect(fireEvent.keyDown(cell, eventInit)).toBe(true)
    }

    expect(callbacks.onMove).not.toHaveBeenCalled()
    expect(callbacks.onDigit).not.toHaveBeenCalled()
    expect(callbacks.onErase).not.toHaveBeenCalled()
    expect(callbacks.onToggleNotes).not.toHaveBeenCalled()
    expect(callbacks.onUndo).not.toHaveBeenCalled()
    expect(callbacks.onSelect).not.toHaveBeenCalled()
  })

  it('completed 状态保持查看和输入回调契约且不崩溃', () => {
    const callbacks = createCallbacks()
    render(
      <SudokuBoard
        game={createGame({ status: 'completed', selectedIndex: 10 })}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    const cell = screen.getByRole('button', { name: '第 2 行第 2 列，空格' })

    expect(fireEvent.keyDown(cell, { key: 'ArrowRight' })).toBe(false)
    expect(fireEvent.keyDown(cell, { key: '4' })).toBe(false)
    expect(callbacks.onMove).toHaveBeenCalledWith('right')
    expect(callbacks.onDigit).toHaveBeenCalledWith(4)
  })

  it('受控状态通过 core 选择和移动后把焦点迁移到所有类型的目标格', async () => {
    const user = userEvent.setup()
    const onSelect = vi.fn()
    const onMove = vi.fn()

    function ControlledBoard() {
      const [game, setGame] = useState(() => createGame({ selectedIndex: 1 }))

      return (
        <SudokuBoard
          game={game}
          conflicts={new Set()}
          onSelect={(index) => {
            onSelect(index)
            setGame((current) => selectCell(current, index))
          }}
          onMove={(direction) => {
            onMove(direction)
            setGame((current) => moveSelection(current, direction))
          }}
          onDigit={vi.fn()}
          onErase={vi.fn()}
          onToggleNotes={vi.fn()}
          onUndo={vi.fn()}
        />
      )
    }

    render(<ControlledBoard />)
    const firstGiven = screen.getByRole('button', {
      name: '第 1 行第 1 列，给定数字 5',
    })
    const secondCell = screen.getByRole('button', { name: '第 1 行第 2 列，空格' })

    await user.tab()
    expect(secondCell).toHaveFocus()

    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(firstGiven).toHaveFocus())
    expect(onMove).toHaveBeenLastCalledWith('left')

    await user.keyboard('{End}')
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '第 1 行第 9 列，空格' })).toHaveFocus()
    })
    expect(onMove).toHaveBeenLastCalledWith('row-end')

    const clicked = screen.getByRole('button', { name: '第 3 行第 3 列，空格' })
    await user.click(clicked)
    expect(clicked).toHaveFocus()
    expect(clicked).toHaveAttribute('aria-current', 'true')
    expect(onSelect).toHaveBeenCalledOnce()
    expect(onSelect).toHaveBeenCalledWith(20)
  })

  it('仅在挂载后的 selectedIndex 实际变化时聚焦新按钮', () => {
    const callbacks = createCallbacks()
    const initialGame = createGame({ selectedIndex: 1 })
    const { rerender } = render(
      <SudokuBoard game={initialGame} conflicts={new Set()} {...callbacks} />,
    )
    const target = screen.getByRole('button', { name: '第 3 行第 3 列，空格' })
    const focusSpy = vi.spyOn(target, 'focus')

    expect(document.body).toHaveFocus()
    rerender(
      <SudokuBoard
        game={{ ...initialGame, selectedIndex: 20 }}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    expect(target).toHaveFocus()
    expect(focusSpy).toHaveBeenCalledOnce()

    rerender(
      <SudokuBoard
        game={{ ...initialGame, selectedIndex: 20, elapsedMs: 1_000 }}
        conflicts={new Set()}
        {...callbacks}
      />,
    )
    expect(focusSpy).toHaveBeenCalledOnce()
  })

  it('卸载后更新父状态不会访问已清理的旧按钮引用', () => {
    const controls = {
      updateSelected(_index: number): void {
        throw new Error('测试父组件尚未挂载')
      },
    }

    function StatefulBoard() {
      const [game, setGame] = useState(() => createGame({ selectedIndex: 1 }))
      controls.updateSelected = (index) => {
        setGame((current) => selectCell(current, index))
      }
      return <SudokuBoard game={game} conflicts={new Set()} {...createCallbacks()} />
    }

    const { unmount } = render(<StatefulBoard />)
    const oldTarget = screen.getByRole('button', { name: '第 3 行第 3 列，空格' })
    const oldFocusSpy = vi.spyOn(oldTarget, 'focus')

    unmount()
    expect(() => {
      act(() => controls.updateSelected(20))
    }).not.toThrow()
    expect(oldFocusSpy).not.toHaveBeenCalled()
    expect(oldTarget.isConnected).toBe(false)
  })
})
