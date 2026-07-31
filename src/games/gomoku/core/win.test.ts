import { toIndex } from './board'
import { findWinningLines } from './win'
import { BOARD_SIZE, type Cell, type Player, type Position } from './types'

function boardWithStones(player: Player, positions: readonly Position[]): readonly Cell[] {
  const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null)

  for (const position of positions) board[toIndex(position)] = player

  return board
}

describe('gomoku winning lines', () => {
  it.each([
    {
      name: '横向',
      positions: Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 3 })),
      origin: { row: 7, col: 5 },
    },
    {
      name: '竖向',
      positions: Array.from({ length: 5 }, (_, row) => ({ row: row + 3, col: 7 })),
      origin: { row: 5, col: 7 },
    },
    {
      name: '主斜线',
      positions: Array.from({ length: 5 }, (_, offset) => ({
        row: offset + 3,
        col: offset + 4,
      })),
      origin: { row: 5, col: 6 },
    },
    {
      name: '副斜线',
      positions: Array.from({ length: 5 }, (_, offset) => ({
        row: offset + 3,
        col: 10 - offset,
      })),
      origin: { row: 5, col: 8 },
    },
  ])('检测$name五连', ({ positions, origin }) => {
    const board = boardWithStones('black', positions)

    expect(findWinningLines(board, origin, 'black')).toEqual([positions])
  })

  it('返回包含全部六颗棋子的完整长连', () => {
    const positions = Array.from({ length: 6 }, (_, col) => ({ row: 4, col: col + 2 }))
    const board = boardWithStones('white', positions)

    expect(findWinningLines(board, { row: 4, col: 5 }, 'white')).toEqual([positions])
  })

  it('保留同一步形成的多条获胜线', () => {
    const horizontal = Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 5 }))
    const vertical = Array.from({ length: 6 }, (_, row) => ({ row: row + 4, col: 7 }))
    const board = boardWithStones('black', [...horizontal, ...vertical])

    expect(findWinningLines(board, { row: 7, col: 7 }, 'black')).toEqual([
      horizontal,
      vertical,
    ])
  })

  it('忽略不经过最后一步的五连', () => {
    const positions = Array.from({ length: 5 }, (_, col) => ({ row: 2, col }))
    const origin = { row: 10, col: 10 }
    const board = boardWithStones('black', [...positions, origin])

    expect(findWinningLines(board, origin, 'black')).toEqual([])
  })

  it('不把四颗连子误判为获胜', () => {
    const positions = Array.from({ length: 4 }, (_, col) => ({ row: 0, col }))
    const board = boardWithStones('black', positions)

    expect(findWinningLines(board, { row: 0, col: 0 }, 'black')).toEqual([])
  })

  it('对方棋子会截断连线', () => {
    const positions = Array.from({ length: 5 }, (_, col) => ({ row: 14, col: col + 5 }))
    const board = [...boardWithStones('black', positions)]
    board[toIndex({ row: 14, col: 7 })] = 'white'

    expect(findWinningLines(board, { row: 14, col: 9 }, 'black')).toEqual([])
  })

  it('原点为空时不返回获胜线', () => {
    const origin = { row: 7, col: 7 }
    const surroundingStones = [
      { row: 7, col: 5 },
      { row: 7, col: 6 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ]
    const board = boardWithStones('black', surroundingStones)

    expect(findWinningLines(board, origin, 'black')).toEqual([])
  })

  it('原点属于对手时不返回获胜线', () => {
    const origin = { row: 7, col: 7 }
    const surroundingStones = [
      { row: 7, col: 5 },
      { row: 7, col: 6 },
      { row: 7, col: 8 },
      { row: 7, col: 9 },
    ]
    const board = [...boardWithStones('black', surroundingStones)]
    board[toIndex(origin)] = 'white'

    expect(findWinningLines(board, origin, 'black')).toEqual([])
  })

  it('原点越界时不返回获胜线', () => {
    const origin = { row: 1, col: -1 }
    const board = boardWithStones('black', [
      { row: 0, col: BOARD_SIZE - 1 },
      { row: 1, col: 0 },
      { row: 1, col: 1 },
      { row: 1, col: 2 },
      { row: 1, col: 3 },
    ])

    expect(findWinningLines(board, origin, 'black')).toEqual([])
  })
})
