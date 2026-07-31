import { toIndex } from './board'
import { findWinningLines } from './win'
import {
  BOARD_SIZE,
  type Cell,
  type GameState,
  type Move,
  type Player,
  type Position,
} from './types'
import { createGame, placeStone, replayMoves, resetGame, undoLastMove } from './game'

function gameWithStones(
  player: Player,
  positions: readonly Position[],
  currentPlayer: Player = player,
): GameState {
  const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null)
  const history: Move[] = []

  for (const position of positions) {
    board[toIndex(position)] = player
    history.push({ ...position, player })
  }

  return { ...createGame(), board, currentPlayer, history }
}

function playMoves(positions: readonly Position[]): GameState {
  let state = createGame()

  for (const position of positions) {
    const result = placeStone(state, position)
    if (!result.ok) throw new Error(`合法落子应当成功：${result.error}`)
    state = result.state
  }

  return state
}

function winningGame(): GameState {
  return playMoves([
    { row: 7, col: 3 },
    { row: 0, col: 0 },
    { row: 7, col: 4 },
    { row: 0, col: 1 },
    { row: 7, col: 5 },
    { row: 0, col: 2 },
    { row: 7, col: 6 },
    { row: 1, col: 0 },
    { row: 7, col: 7 },
  ])
}

function drawMoves(): readonly Move[] {
  const blackMoves: Move[] = []
  const whiteMoves: Move[] = []

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player = (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
      const move = { row, col, player } satisfies Move
      if (player === 'black') blackMoves.push(move)
      else whiteMoves.push(move)
    }
  }

  const moves: Move[] = []
  for (let index = 0; index < blackMoves.length; index += 1) {
    const blackMove = blackMoves[index]
    if (!blackMove) throw new Error('和棋序列应当包含黑棋落子')
    moves.push(blackMove)

    const whiteMove = whiteMoves[index]
    if (whiteMove) moves.push(whiteMove)
  }

  return moves
}

describe('gomoku game', () => {
  it('creates an empty 15×15 game with black to move', () => {
    const state = createGame()

    expect(state.board).toHaveLength(BOARD_SIZE * BOARD_SIZE)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.currentPlayer).toBe('black')
    expect(state.status).toBe('playing')
    expect(state.winner).toBeNull()
    expect(state.winningLines).toEqual([])
    expect(state.history).toEqual([])
  })

  it('places a stone immutably and changes the current player', () => {
    const state = createGame()
    const originalBoard = state.board
    const originalHistory = state.history

    const result = placeStone(state, { row: 3, col: 4 })

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('合法落子应当成功')

    expect(result.state).not.toBe(state)
    expect(result.state.board).not.toBe(originalBoard)
    expect(result.state.history).not.toBe(originalHistory)
    expect(result.state.board[3 * BOARD_SIZE + 4]).toBe('black')
    expect(result.state.currentPlayer).toBe('white')
    expect(result.state.history).toEqual([{ row: 3, col: 4, player: 'black' }])
    expect(state.board).toBe(originalBoard)
    expect(state.history).toBe(originalHistory)
    expect(state.board.every((cell) => cell === null)).toBe(true)
    expect(state.history).toEqual([])
  })

  it.each([
    { row: 0, col: 0 },
    { row: 0, col: BOARD_SIZE - 1 },
    { row: BOARD_SIZE - 1, col: 0 },
    { row: BOARD_SIZE - 1, col: BOARD_SIZE - 1 },
  ])('accepts the corner position $row,$col', (position) => {
    const state = createGame()

    const result = placeStone(state, position)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('棋盘四角都应当允许落子')
    expect(result.state.board[position.row * BOARD_SIZE + position.col]).toBe('black')
  })

  it('preserves both moves and returns the turn to black', () => {
    const initialState = createGame()
    const firstMove = placeStone(initialState, { row: 7, col: 7 })
    if (!firstMove.ok) throw new Error('黑方合法落子应当成功')
    const firstBoard = firstMove.state.board
    const firstHistory = firstMove.state.history

    const secondMove = placeStone(firstMove.state, { row: 7, col: 8 })

    expect(secondMove.ok).toBe(true)
    if (!secondMove.ok) throw new Error('白方合法落子应当成功')
    expect(secondMove.state.board[7 * BOARD_SIZE + 7]).toBe('black')
    expect(secondMove.state.board[7 * BOARD_SIZE + 8]).toBe('white')
    expect(secondMove.state.currentPlayer).toBe('black')
    expect(secondMove.state.history).toEqual([
      { row: 7, col: 7, player: 'black' },
      { row: 7, col: 8, player: 'white' },
    ])
    expect(firstMove.state.board).toBe(firstBoard)
    expect(firstMove.state.history).toBe(firstHistory)
    expect(firstMove.state.board[7 * BOARD_SIZE + 8]).toBeNull()
    expect(firstMove.state.history).toEqual([{ row: 7, col: 7, player: 'black' }])
  })

  it.each([
    { row: -1, col: 0 },
    { row: BOARD_SIZE, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: BOARD_SIZE },
    { row: 1.5, col: 0 },
    { row: 0, col: 1.5 },
  ])('rejects an out-of-bounds position $row,$col', (position) => {
    const state = createGame()

    const result = placeStone(state, position)

    expect(result).toEqual({ ok: false, error: 'out-of-bounds', state })
    expect(result.state).toBe(state)
  })

  it('rejects an occupied position without replacing the state', () => {
    const initialState = createGame()
    const firstMove = placeStone(initialState, { row: 7, col: 7 })
    if (!firstMove.ok) throw new Error('首次合法落子应当成功')

    const result = placeStone(firstMove.state, { row: 7, col: 7 })

    expect(result).toEqual({ ok: false, error: 'occupied', state: firstMove.state })
    expect(result.state).toBe(firstMove.state)
  })

  it('rejects moves after the game is over without replacing the state', () => {
    const state: GameState = {
      ...createGame(),
      status: 'won',
      winner: 'black',
    }

    const result = placeStone(state, { row: 0, col: 0 })

    expect(result).toEqual({ ok: false, error: 'game-over', state })
    expect(result.state).toBe(state)
  })

  it('获胜后保留获胜方回合并拒绝继续落子', () => {
    const winningStones = Array.from({ length: 4 }, (_, col) => ({ row: 7, col: col + 3 }))
    const state = gameWithStones('black', winningStones)

    const winningMove = placeStone(state, { row: 7, col: 7 })

    expect(winningMove.ok).toBe(true)
    if (!winningMove.ok) throw new Error('获胜落子应当成功')
    expect(winningMove.state.status).toBe('won')
    expect(winningMove.state.winner).toBe('black')
    expect(winningMove.state.currentPlayer).toBe('black')
    expect(winningMove.state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
    expect(winningMove.state.history).toHaveLength(5)
    expect(winningMove.state.history.at(-1)).toEqual({ row: 7, col: 7, player: 'black' })
    expect(winningMove.state.winningLines).toEqual([
      Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 3 })),
    ])

    const result = placeStone(winningMove.state, { row: 0, col: 0 })

    expect(result).toEqual({ ok: false, error: 'game-over', state: winningMove.state })
    expect(result.state).toBe(winningMove.state)
  })

  it('隔离获胜线坐标与调用方的可变落子对象', () => {
    const winningStones = Array.from({ length: 4 }, (_, col) => ({ row: 7, col: col + 3 }))
    const state = gameWithStones('black', winningStones)
    const position = { row: 7, col: 7 }

    const result = placeStone(state, position)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('获胜落子应当成功')
    const winningLine = result.state.winningLines[0]
    if (!winningLine) throw new Error('获胜后应当保存获胜线')
    const storedOrigin = winningLine.find(({ row, col }) => row === 7 && col === 7)
    if (!storedOrigin) throw new Error('获胜线应当包含最后落子')

    position.row = 0
    position.col = 0

    expect(storedOrigin).not.toBe(position)
    expect(storedOrigin).toEqual({ row: 7, col: 7 })
    expect(result.state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
    expect(result.state.history).toHaveLength(5)
    expect(result.state.history.at(-1)).toEqual({ row: 7, col: 7, player: 'black' })
    expect(result.state.winningLines).toEqual([
      Array.from({ length: 5 }, (_, col) => ({ row: 7, col: col + 3 })),
    ])
  })

  it('满盘无五连时判定和棋并保留最后落子方回合', () => {
    const finalPosition = { row: 14, col: 13 }
    const board: Cell[] = []
    const history: Move[] = []

    for (let row = 0; row < BOARD_SIZE; row += 1) {
      for (let col = 0; col < BOARD_SIZE; col += 1) {
        const position = { row, col }
        if (row === finalPosition.row && col === finalPosition.col) {
          board.push(null)
          continue
        }

        const player = (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
        board.push(player)
        history.push({ ...position, player })
      }
    }

    for (const move of history) {
      expect(findWinningLines(board, move, move.player)).toEqual([])
    }

    const state: GameState = { ...createGame(), board, currentPlayer: 'black', history }
    const result = placeStone(state, finalPosition)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('满盘的最后一步应当成功')
    expect(result.state.status).toBe('draw')
    expect(result.state.winner).toBeNull()
    expect(result.state.winningLines).toEqual([])
    expect(result.state.currentPlayer).toBe('black')
    expect(result.state.board[toIndex(finalPosition)]).toBe('black')
    expect(result.state.history).toHaveLength(BOARD_SIZE * BOARD_SIZE)
    expect(result.state.history.at(-1)).toEqual({ ...finalPosition, player: 'black' })

    const moveAfterDraw = placeStone(result.state, { row: 0, col: 0 })

    expect(moveAfterDraw).toEqual({ ok: false, error: 'game-over', state: result.state })
    expect(moveAfterDraw.state).toBe(result.state)
  })

  it('最后一步同时填满棋盘并获胜时优先判定获胜', () => {
    const finalPosition = { row: 14, col: 13 }
    const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
      const row = Math.floor(index / BOARD_SIZE)
      const col = index % BOARD_SIZE
      return (Math.floor(row / 2) + col) % 2 === 0 ? 'black' : 'white'
    })
    board[toIndex(finalPosition)] = null
    for (const col of [10, 11, 12, 14]) board[toIndex({ row: 14, col })] = 'black'

    const state: GameState = { ...createGame(), board, currentPlayer: 'black' }
    const result = placeStone(state, finalPosition)

    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('满盘获胜的最后一步应当成功')
    expect(result.state.status).toBe('won')
    expect(result.state.winner).toBe('black')
    expect(result.state.currentPlayer).toBe('black')
    expect(result.state.winningLines).toEqual([
      Array.from({ length: 6 }, (_, offset) => ({ row: 14, col: offset + 9 })),
    ])
  })

  describe('replayMoves', () => {
    it('重建普通棋局并与逐步落子结果一致', () => {
      const expected = playMoves([
        { row: 7, col: 7 },
        { row: 7, col: 8 },
        { row: 8, col: 8 },
      ])

      const replayed = replayMoves(expected.history)

      expect(replayed).toEqual(expected)
      expect(replayed?.board).not.toBe(expected.board)
      expect(replayed?.history).not.toBe(expected.history)
    })

    it('重建获胜棋局并与逐步落子结果一致', () => {
      const expected = winningGame()

      const replayed = replayMoves(expected.history)

      expect(replayed).toEqual(expected)
      expect(replayed?.status).toBe('won')
      expect(replayed?.winner).toBe('black')
      expect(replayed?.winningLines).toEqual(expected.winningLines)
    })

    it.each([
      {
        name: '玩家顺序错误',
        moves: [{ row: 7, col: 7, player: 'white' }],
      },
      {
        name: '重复位置',
        moves: [
          { row: 7, col: 7, player: 'black' },
          { row: 7, col: 7, player: 'white' },
        ],
      },
      {
        name: '越界位置',
        moves: [{ row: BOARD_SIZE, col: 0, player: 'black' }],
      },
      {
        name: '终局后额外落子',
        moves: [
          ...winningGame().history,
          { row: 14, col: 14, player: 'black' },
        ],
      },
    ] satisfies readonly { name: string; moves: readonly Move[] }[])('拒绝$name', ({ moves }) => {
      expect(replayMoves(moves)).toBeNull()
    })

    it('不修改输入的 moves、Move 或 Position', () => {
      const firstMove = Object.freeze({ row: 7, col: 7, player: 'black' } satisfies Move)
      const secondMove = Object.freeze({ row: 7, col: 8, player: 'white' } satisfies Move)
      const moves = Object.freeze([firstMove, secondMove])

      const replayed = replayMoves(moves)

      expect(replayed?.history).toEqual(moves)
      expect(replayed?.history).not.toBe(moves)
      expect(replayed?.history[0]).not.toBe(firstMove)
      expect(moves).toEqual([firstMove, secondMove])
    })
  })

  describe('undoLastMove', () => {
    it('撤销普通一手并保持输入状态不变', () => {
      const state = playMoves([{ row: 7, col: 7 }])
      const board = state.board
      const history = state.history

      const undone = undoLastMove(state)

      expect(undone).not.toBe(state)
      expect(undone.board[toIndex({ row: 7, col: 7 })]).toBeNull()
      expect(undone.currentPlayer).toBe('black')
      expect(undone.history).toEqual([])
      expect(state.board).toBe(board)
      expect(state.history).toBe(history)
      expect(state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
      expect(state.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    })

    it('多步棋局只撤销最近一手', () => {
      const state = playMoves([
        { row: 7, col: 7 },
        { row: 7, col: 8 },
        { row: 8, col: 8 },
      ])
      const removedMove = state.history.at(-1)
      if (!removedMove) throw new Error('多步棋局应当包含最后一手')

      const undone = undoLastMove(state)

      expect(undone.currentPlayer).toBe(removedMove.player)
      expect(undone.board[toIndex({ row: 7, col: 7 })]).toBe('black')
      expect(undone.board[toIndex({ row: 7, col: 8 })]).toBe('white')
      expect(undone.board[toIndex({ row: 8, col: 8 })]).toBeNull()
      expect(undone.history).toEqual(state.history.slice(0, -1))
    })

    it('空棋盘情况返回原状态引用', () => {
      const state = createGame()

      expect(undoLastMove(state)).toBe(state)
    })

    it('获胜后撤销最后一手并恢复进行中状态', () => {
      const state = winningGame()

      const undone = undoLastMove(state)

      expect(undone.status).toBe('playing')
      expect(undone.winner).toBeNull()
      expect(undone.winningLines).toEqual([])
      expect(undone.currentPlayer).toBe('black')
      expect(undone.board[toIndex({ row: 7, col: 7 })]).toBeNull()
      expect(undone.history).toEqual(state.history.slice(0, -1))
      expect(state.status).toBe('won')
      expect(state.board[toIndex({ row: 7, col: 7 })]).toBe('black')
    })

    it('和棋后撤销最后一手并清除终局结果', () => {
      const state = replayMoves(drawMoves())
      if (!state) throw new Error('和棋序列应当能够成功重放')
      const lastMove = state.history.at(-1)
      if (!lastMove) throw new Error('和棋应当包含最后一手')
      expect(state.status).toBe('draw')

      const undone = undoLastMove(state)

      expect(undone.status).toBe('playing')
      expect(undone.winner).toBeNull()
      expect(undone.winningLines).toEqual([])
      expect(undone.currentPlayer).toBe(lastMove.player)
      expect(undone.board[toIndex(lastMove)]).toBeNull()
      expect(undone.history).toEqual(state.history.slice(0, -1))
    })

    it('损坏的 history 与棋局不一致时保留原状态引用', () => {
      const board: Cell[] = [...createGame().board]
      board[toIndex({ row: 7, col: 8 })] = 'black'
      const state: GameState = {
        ...createGame(),
        board,
        currentPlayer: 'white',
        history: [{ row: 7, col: 7, player: 'black' }],
      }

      expect(undoLastMove(state)).toBe(state)
      expect(state.board[toIndex({ row: 7, col: 8 })]).toBe('black')
      expect(state.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    })
  })

  describe('resetGame', () => {
    it('返回全新且互相独立的初始棋局', () => {
      const first = resetGame()
      const second = resetGame()

      expect(first).toEqual(createGame())
      expect(second).toEqual(createGame())
      expect(first).not.toBe(second)
      expect(first.board).not.toBe(second.board)
      expect(first.history).not.toBe(second.history)

      const moved = placeStone(first, { row: 7, col: 7 })
      if (!moved.ok) throw new Error('重新开始后的棋局应当允许合法落子')
      expect(second.board[toIndex({ row: 7, col: 7 })]).toBeNull()
      expect(second.history).toEqual([])
    })
  })
})
