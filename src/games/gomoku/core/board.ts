import { BOARD_SIZE, type Player, type Position } from './types'

export const isInBounds = ({ row, col }: Position) =>
  Number.isInteger(row) &&
  Number.isInteger(col) &&
  row >= 0 &&
  row < BOARD_SIZE &&
  col >= 0 &&
  col < BOARD_SIZE

export const toIndex = ({ row, col }: Position) => row * BOARD_SIZE + col

export const oppositePlayer = (player: Player): Player =>
  player === 'black' ? 'white' : 'black'
