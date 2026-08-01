import { useLayoutEffect, useRef, type KeyboardEvent } from 'react'

import { peerIndices } from '../core/board'
import type { MoveDirection } from '../core/game'
import { CELL_COUNT, SUDOKU_SIZE, type Digit, type SudokuGameState } from '../core/types'

const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

function directionForKey(key: string): MoveDirection | null {
  if (key === 'ArrowUp') return 'up'
  if (key === 'ArrowDown') return 'down'
  if (key === 'ArrowLeft') return 'left'
  if (key === 'ArrowRight') return 'right'
  if (key === 'Home') return 'row-start'
  if (key === 'End') return 'row-end'
  return null
}

function digitForKey(key: string): Digit | null {
  if (key === '1') return 1
  if (key === '2') return 2
  if (key === '3') return 3
  if (key === '4') return 4
  if (key === '5') return 5
  if (key === '6') return 6
  if (key === '7') return 7
  if (key === '8') return 8
  if (key === '9') return 9
  return null
}

interface SudokuBoardProps {
  readonly game: SudokuGameState
  readonly conflicts: ReadonlySet<number>
  readonly onSelect: (index: number) => void
  readonly onMove: (direction: MoveDirection) => void
  readonly onDigit: (digit: Digit) => void
  readonly onErase: () => void
  readonly onToggleNotes: () => void
  readonly onUndo: () => void
}

export function SudokuBoard({
  game,
  conflicts,
  onSelect,
  onMove,
  onDigit,
  onErase,
  onToggleNotes,
  onUndo,
}: SudokuBoardProps) {
  const pointerSelectionIndex = useRef<number | null>(null)
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>(
    Array.from({ length: CELL_COUNT }, () => null),
  )
  const previousSelectedIndex = useRef(game.selectedIndex)
  const relatedIndices = new Set(peerIndices(game.selectedIndex))
  const selectedValue = game.values[game.selectedIndex]

  useLayoutEffect(() => {
    const previousIndex = previousSelectedIndex.current
    previousSelectedIndex.current = game.selectedIndex
    if (previousIndex === game.selectedIndex) return

    const selectedButton = buttonRefs.current[game.selectedIndex]
    if (selectedButton !== null) selectedButton.focus()
  }, [game.selectedIndex])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (event.nativeEvent.isComposing) return

    const isUndo =
      event.key.toLowerCase() === 'z' &&
      (event.ctrlKey || event.metaKey) &&
      !(event.ctrlKey && event.metaKey) &&
      !event.altKey &&
      !event.shiftKey
    if (isUndo) {
      event.preventDefault()
      onUndo()
      return
    }

    if (event.altKey || event.ctrlKey || event.metaKey) return

    if (event.key === 'n' || event.key === 'N') {
      event.preventDefault()
      onToggleNotes()
      return
    }

    if (event.shiftKey) return

    const direction = directionForKey(event.key)
    if (direction !== null) {
      event.preventDefault()
      onMove(direction)
      return
    }

    const digit = digitForKey(event.key)
    if (digit !== null) {
      event.preventDefault()
      onDigit(digit)
      return
    }

    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      onErase()
    }
  }

  return (
    <div
      className="sudoku-board"
      role="grid"
      aria-label="九乘九数独棋盘"
      data-puzzle-id={game.puzzleId}
    >
      {Array.from({ length: CELL_COUNT }, (_, index) => {
        const row = Math.floor(index / SUDOKU_SIZE)
        const col = index % SUDOKU_SIZE
        const given = game.givens[index]
        const value = game.values[index]
        const candidateMask = game.candidates[index]
        const candidateDigits = value === null && candidateMask !== 0
          ? DIGITS.filter((digit) => (candidateMask & (1 << (digit - 1))) !== 0)
          : []
        const selected = index === game.selectedIndex
        const related = relatedIndices.has(index)
        const sameValue = selectedValue !== null && value === selectedValue
        const conflict = conflicts.has(index)
        const valueKind = given !== null ? 'given' : 'player'
        const cellDescription = given !== null
          ? `给定数字 ${given}`
          : value !== null
            ? `玩家数字 ${value}`
            : '空格'
        const candidateDescription = candidateDigits.length > 0
          ? `，候选数 ${candidateDigits.join('、')}`
          : ''
        const conflictDescription = conflict ? '，存在冲突' : ''

        return (
          <button
            className="sudoku-cell"
            type="button"
            aria-current={selected ? 'true' : undefined}
            aria-disabled={given !== null ? 'true' : undefined}
            aria-label={`第 ${row + 1} 行第 ${col + 1} 列，${cellDescription}${candidateDescription}${conflictDescription}`}
            data-box-col={col % 3}
            data-box-row={row % 3}
            data-conflict={String(conflict)}
            data-given={String(given !== null)}
            data-related={String(related)}
            data-same-value={String(sameValue)}
            data-selected={String(selected)}
            key={index}
            onClick={() => {
              pointerSelectionIndex.current = null
              onSelect(index)
            }}
            onFocus={() => {
              if (pointerSelectionIndex.current === index) return
              if (!selected) onSelect(index)
            }}
            onKeyDown={handleKeyDown}
            onPointerCancel={() => {
              pointerSelectionIndex.current = null
            }}
            onPointerDown={() => {
              pointerSelectionIndex.current = index
            }}
            ref={(button) => {
              buttonRefs.current[index] = button
            }}
            tabIndex={selected ? 0 : -1}
          >
            {value !== null ? (
              <span
                className={`sudoku-cell__value sudoku-cell__value--${valueKind}`}
                aria-hidden="true"
              >
                {value}
              </span>
            ) : candidateDigits.length > 0 ? (
              <span className="sudoku-cell__candidates" aria-hidden="true">
                {DIGITS.map((digit) => {
                  const present = (candidateMask & (1 << (digit - 1))) !== 0
                  return (
                    <span
                      className="sudoku-cell__candidate"
                      aria-hidden="true"
                      data-digit={digit}
                      data-present={String(present)}
                      key={digit}
                    >
                      {present ? digit : ''}
                    </span>
                  )
                })}
              </span>
            ) : null}
          </button>
        )
      })}
    </div>
  )
}
