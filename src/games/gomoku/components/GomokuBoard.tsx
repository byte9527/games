import { BOARD_SIZE, type Cell, type GameState, type Position } from '../core/types'

function positionKey({ row, col }: Position): string {
  return `${row}:${col}`
}

function cellName(cell: Cell): string {
  if (cell === 'black') return '黑棋'
  if (cell === 'white') return '白棋'
  return '空位'
}

export function GomokuBoard({ game, onPlace }: {
  game: GameState
  onPlace(position: Position): void
}) {
  const winningPositions = new Set<string>()
  for (const line of game.winningLines) {
    for (const position of line) {
      winningPositions.add(positionKey(position))
    }
  }

  const lastMove = game.history.at(-1)

  return (
    <div className="gomoku-board" role="grid" aria-label="十五乘十五五子棋棋盘">
      {Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
        const row = Math.floor(index / BOARD_SIZE)
        const col = index % BOARD_SIZE
        const position = { row, col }
        const cell = game.board[index]
        const isWinning = winningPositions.has(positionKey(position))
        const isLastMove = lastMove?.row === row && lastMove.col === col
        const disabled = game.status !== 'playing' || cell !== null

        return (
          <button
            className="board-point"
            type="button"
            aria-label={`第 ${row + 1} 行第 ${col + 1} 列，${cellName(cell)}`}
            disabled={disabled}
            key={index}
            onClick={() => onPlace(position)}
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
