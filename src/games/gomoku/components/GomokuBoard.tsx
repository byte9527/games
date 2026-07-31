import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { BOARD_SIZE, type Cell, type GameState, type Position } from '../core/types'

type Direction = readonly [rowDelta: number, colDelta: number]

function positionKey({ row, col }: Position): string {
  return `${row}:${col}`
}

function cellName(cell: Cell): string {
  if (cell === 'black') return '黑棋'
  if (cell === 'white') return '白棋'
  return '空位'
}

function isPlayable(game: GameState, index: number): boolean {
  return game.status === 'playing' && game.board[index] === null
}

function findFirstPlayableIndex(game: GameState): number {
  if (game.status !== 'playing') return -1
  return game.board.findIndex((cell) => cell === null)
}

function directionForKey(key: string): Direction | null {
  if (key === 'ArrowLeft') return [0, -1]
  if (key === 'ArrowRight') return [0, 1]
  if (key === 'ArrowUp') return [-1, 0]
  if (key === 'ArrowDown') return [1, 0]
  return null
}

function findNextPlayableIndex(
  game: GameState,
  index: number,
  [rowDelta, colDelta]: Direction,
): number | null {
  let row = Math.floor(index / BOARD_SIZE) + rowDelta
  let col = (index % BOARD_SIZE) + colDelta

  while (row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE) {
    const candidateIndex = row * BOARD_SIZE + col
    if (isPlayable(game, candidateIndex)) return candidateIndex
    row += rowDelta
    col += colDelta
  }

  return null
}

export function GomokuBoard({ game, onPlace }: {
  game: GameState
  onPlace(position: Position): void
}) {
  const [tabStopIndex, setTabStopIndex] = useState(() => findFirstPlayableIndex(game))
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([])
  const winningPositions = new Set<string>()
  for (const line of game.winningLines) {
    for (const position of line) {
      winningPositions.add(positionKey(position))
    }
  }

  const lastMove = game.history.at(-1)
  const firstPlayableIndex = findFirstPlayableIndex(game)
  const activeTabStopIndex = isPlayable(game, tabStopIndex) ? tabStopIndex : firstPlayableIndex

  useEffect(() => {
    if (tabStopIndex !== activeTabStopIndex) setTabStopIndex(activeTabStopIndex)
  }, [activeTabStopIndex, tabStopIndex])

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number): void {
    const direction = directionForKey(event.key)
    if (direction === null) return

    event.preventDefault()
    const nextIndex = findNextPlayableIndex(game, index, direction)
    if (nextIndex === null) return

    setTabStopIndex(nextIndex)
    buttonRefs.current[nextIndex]?.focus()
  }

  return (
    <div className="gomoku-board" role="group" aria-label="十五乘十五五子棋棋盘">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE)
        const col = index % BOARD_SIZE
        const position = { row, col }
        const cell = game.board[index]
        const isWinning = winningPositions.has(positionKey(position))
        const isLastMove = lastMove?.row === row && lastMove.col === col
        const disabled = game.status !== 'playing' || cell !== null
        const lastMoveText = isLastMove ? '，最后一步' : ''
        const winningText = isWinning ? '，获胜连线' : ''

        return (
          <button
            className="intersection"
            type="button"
            aria-label={`第 ${row + 1} 行第 ${col + 1} 列，${cellName(cell)}${lastMoveText}${winningText}`}
            data-row={row}
            data-col={col}
            disabled={disabled}
            key={index}
            onClick={() => onPlace({ row, col })}
            onFocus={() => setTabStopIndex(index)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            ref={(button) => {
              buttonRefs.current[index] = button
            }}
            tabIndex={!disabled && index === activeTabStopIndex ? 0 : -1}
          >
            {cell !== null ? (
              <span
                className={`stone stone--${cell}${isWinning ? ' stone--winning' : ''}`}
                aria-hidden="true"
              />
            ) : null}
            {isLastMove ? <span className="last-move" aria-hidden="true" /> : null}
          </button>
        )
      })}
    </div>
  )
}
