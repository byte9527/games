import { isInBounds, toIndex } from './board'
import type { Cell, Player, Position } from './types'

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const

function collectStones(
  board: readonly Cell[],
  origin: Position,
  player: Player,
  rowStep: number,
  colStep: number,
): Position[] {
  const stones: Position[] = []
  let position = { row: origin.row + rowStep, col: origin.col + colStep }

  while (isInBounds(position) && board[toIndex(position)] === player) {
    stones.push(position)
    position = { row: position.row + rowStep, col: position.col + colStep }
  }

  return stones
}

export function findWinningLines(
  board: readonly Cell[],
  origin: Position,
  player: Player,
): readonly (readonly Position[])[] {
  if (!isInBounds(origin) || board[toIndex(origin)] !== player) return []

  const winningLines: Position[][] = []

  for (const [rowStep, colStep] of DIRECTIONS) {
    const backward = collectStones(board, origin, player, -rowStep, -colStep)
    const forward = collectStones(board, origin, player, rowStep, colStep)
    const line = [...backward.reverse(), origin, ...forward]

    if (line.length >= 5) winningLines.push(line)
  }

  return winningLines
}
