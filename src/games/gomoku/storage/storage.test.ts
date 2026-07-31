import { createGame, placeStone, replayMoves } from '../core/game'
import { BOARD_SIZE, type Cell, type GameState, type Move, type Position } from '../core/types'
import { STORAGE_VERSION, decodeStoredGame, encodeStoredGame } from './schema'
import {
  STORAGE_KEY,
  GomokuStorage,
  createBrowserGomokuStorage,
  type StorageLike,
} from './storage'

class MemoryStorage implements StorageLike {
  readonly values = new Map<string, string>()
  getError: unknown = null
  setError: unknown = null
  removeError: unknown = null
  removeCalls = 0
  setCalls = 0

  getItem(key: string): string | null {
    if (this.getError !== null) throw this.getError
    return this.values.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.setCalls += 1
    if (this.setError !== null) throw this.setError
    this.values.set(key, value)
  }

  removeItem(key: string): void {
    this.removeCalls += 1
    if (this.removeError !== null) throw this.removeError
    this.values.delete(key)
  }
}

interface MutableMove {
  row: unknown
  col: unknown
  player: unknown
}

interface MutableState {
  board: unknown[]
  currentPlayer: unknown
  status: unknown
  winner: unknown
  winningLines: unknown[]
  history: MutableMove[]
}

interface MutableStoredGame {
  version: unknown
  state: MutableState
}

function playMoves(positions: readonly Position[]): GameState {
  let state = createGame()

  for (const position of positions) {
    const result = placeStone(state, position)
    if (!result.ok) throw new Error(`测试准备的合法落子失败：${result.error}`)
    state = result.state
  }

  return state
}

function activeGame(): GameState {
  return playMoves([
    { row: 7, col: 7 },
    { row: 7, col: 8 },
    { row: 8, col: 8 },
  ])
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
    if (blackMove === undefined) throw new Error('和棋序列应当包含黑棋落子')
    moves.push(blackMove)

    const whiteMove = whiteMoves[index]
    if (whiteMove !== undefined) moves.push(whiteMove)
  }

  return moves
}

function drawGame(): GameState {
  const state = replayMoves(drawMoves())
  if (state === null || state.status !== 'draw') throw new Error('测试准备的和棋序列无效')
  return state
}

function mutableStoredGame(state: GameState = activeGame()): MutableStoredGame {
  return structuredClone(encodeStoredGame(state)) as MutableStoredGame
}

function seedStoredValue(storage: MemoryStorage, value: unknown): void {
  storage.values.set(STORAGE_KEY, JSON.stringify(value))
}

function inheritProperty<T extends object, K extends keyof T>(source: T, key: K): object {
  const prototype: object = Object.create(Object.getPrototypeOf(source))
  Object.defineProperty(prototype, key, { value: source[key] })
  const candidate: object = Object.create(prototype)

  for (const ownKey of Reflect.ownKeys(source)) {
    if (ownKey === key) continue
    const descriptor = Object.getOwnPropertyDescriptor(source, ownKey)
    if (descriptor === undefined) throw new Error('自有属性应当存在 descriptor')
    Object.defineProperty(candidate, ownKey, descriptor)
  }

  return candidate
}

describe('gomoku storage schema', () => {
  it('使用独立的 version=1 包装棋局状态', () => {
    const state = activeGame()

    expect(STORAGE_VERSION).toBe(1)
    expect(encodeStoredGame(state)).toEqual({ version: 1, state })
  })

  it('编码结果是隔离的 v1 快照且不保留额外字段', () => {
    const base = winningGame()
    const board: Cell[] = [...base.board]
    const history = base.history.map(({ row, col, player }) => ({
      row,
      col,
      player,
      debug: 'not persisted',
    }))
    const winningLines = base.winningLines.map((line) =>
      line.map(({ row, col }) => ({ row, col, debug: 'not persisted' })),
    )
    const state = { ...base, board, history, winningLines, debug: 'not persisted' }
    const expected = {
      version: 1,
      state: {
        board: [...base.board],
        currentPlayer: base.currentPlayer,
        status: base.status,
        winner: base.winner,
        winningLines: base.winningLines.map((line) =>
          line.map(({ row, col }) => ({ row, col })),
        ),
        history: base.history.map(({ row, col, player }) => ({ row, col, player })),
      },
    }

    const encoded = encodeStoredGame(state)
    board[0] = null
    state.currentPlayer = 'white'
    const firstMove = history[0]
    if (firstMove === undefined) throw new Error('获胜棋局应当包含落子历史')
    firstMove.row = 14
    const firstLine = winningLines[0]
    const firstPosition = firstLine?.[0]
    if (firstPosition === undefined) throw new Error('获胜棋局应当包含获胜线坐标')
    firstPosition.col = 14

    expect(encoded).toEqual(expected)
    expect(encoded.state).not.toBe(state)
    expect(encoded.state.board).not.toBe(board)
    expect(encoded.state.history).not.toBe(history)
    expect(encoded.state.history[0]).not.toBe(firstMove)
    expect(encoded.state.winningLines).not.toBe(winningLines)
    expect(encoded.state.winningLines[0]?.[0]).not.toBe(firstPosition)
  })

  it('严格解码有效活动棋局并返回 replay 生成的规范新状态', () => {
    const state = activeGame()
    const encoded = encodeStoredGame(state)

    const decoded = decodeStoredGame(encoded)

    expect(decoded).toEqual(state)
    expect(decoded).not.toBe(state)
    expect(decoded?.board).not.toBe(state.board)
    expect(decoded?.history).not.toBe(state.history)
    expect(decoded?.history[0]).not.toBe(state.history[0])
  })

  it('只读取一次顶层 state getter 并稳定解码该候选对象', () => {
    const expected = activeGame()
    const candidate = encodeStoredGame(expected).state
    const stored: object = { version: 1 }
    let reads = 0
    Object.defineProperty(stored, 'state', {
      get: () => {
        reads += 1
        return reads <= 2 ? candidate : null
      },
    })

    expect(Object.hasOwn(stored, 'state')).toBe(true)
    expect(decodeStoredGame(stored)).toEqual(expected)
    expect(reads).toBe(1)
  })

  it.each([
    { name: 'null 顶层', value: null },
    { name: '数组顶层', value: [] },
    { name: '缺少 state', value: { version: 1 } },
    { name: 'state 为 null', value: { version: 1, state: null } },
    { name: '缺少 version', value: { state: activeGame() } },
    { name: '不兼容 version', value: { version: 2, state: activeGame() } },
  ])('拒绝$name', ({ value }) => {
    expect(decodeStoredGame(value)).toBeNull()
  })

  it.each(['version', 'state'] as const)('拒绝从原型继承顶层 $field', (field) => {
    const inheritedStoredGame = inheritProperty(encodeStoredGame(activeGame()), field)

    expect(Object.hasOwn(inheritedStoredGame, field)).toBe(false)
    expect(decodeStoredGame(inheritedStoredGame)).toBeNull()
  })

  it.each([
    'board',
    'currentPlayer',
    'status',
    'winner',
    'winningLines',
    'history',
  ] as const)('拒绝从原型继承 state.$field', (field) => {
    const stored = encodeStoredGame(activeGame())
    const inheritedState = inheritProperty(stored.state, field)

    expect(Object.hasOwn(inheritedState, field)).toBe(false)
    expect(decodeStoredGame({ version: 1, state: inheritedState })).toBeNull()
  })

  it('拒绝缺少必需字段的状态', () => {
    const state = activeGame()
    const { board: _board, ...stateWithoutBoard } = state

    expect(decodeStoredGame({ version: 1, state: stateWithoutBoard })).toBeNull()
  })

  it('拒绝长度不是 225 的 board', () => {
    const stored = mutableStoredGame()
    stored.state.board.pop()

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('拒绝长度为 225 但包含真实空槽的 board', () => {
    const stored = mutableStoredGame()
    const holeIndex = 0
    const inheritedCell = stored.state.board[holeIndex]
    const boardPrototype: object = Object.create(Array.prototype)
    Object.defineProperty(boardPrototype, holeIndex, { value: inheritedCell })
    Object.setPrototypeOf(stored.state.board, boardPrototype)
    delete stored.state.board[holeIndex]

    expect(Object.hasOwn(stored.state.board, holeIndex)).toBe(false)
    expect(stored.state.board[holeIndex]).toBe(inheritedCell)
    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('每个 board cell 只读取一次并使用该值验证 history 一致性', () => {
    const stored = mutableStoredGame()
    const index = 7 * BOARD_SIZE + 7
    let reads = 0
    Object.defineProperty(stored.state.board, index, {
      get: () => {
        reads += 1
        return reads === 1 ? 'white' : 'black'
      },
    })

    expect(decodeStoredGame(stored)).toBeNull()
    expect(reads).toBe(1)
  })

  it.each([undefined, 'empty', 0, false, {}])('拒绝非法棋盘 cell：%s', (cell) => {
    const stored = mutableStoredGame()
    stored.state.board[0] = cell

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it.each([
    { name: 'row 不是整数', patch: { row: 7.5 } },
    { name: 'col 不是整数', patch: { col: '8' } },
    { name: 'player 非法', patch: { player: 'red' } },
  ])('拒绝$name', ({ patch }) => {
    const stored = mutableStoredGame()
    Object.assign(stored.state.history[0] ?? {}, patch)

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it.each(['row', 'col', 'player'] as const)('拒绝从原型继承 Move.$field', (field) => {
    const stored = mutableStoredGame()
    const firstMove = stored.state.history[0]
    if (firstMove === undefined) throw new Error('活动棋局应当包含首手')
    const inheritedMove = inheritProperty(firstMove, field)
    const history: unknown[] = [...stored.state.history]
    history[0] = inheritedMove

    expect(Object.hasOwn(inheritedMove, field)).toBe(false)
    expect(
      decodeStoredGame({ ...stored, state: { ...stored.state, history } }),
    ).toBeNull()
  })

  it('拒绝 history 中由私有原型提供 Move 的真实空槽', () => {
    const stored = mutableStoredGame()
    const holeIndex = 0
    const inheritedMove = stored.state.history[holeIndex]
    const historyPrototype: object = Object.create(Array.prototype)
    Object.defineProperty(historyPrototype, holeIndex, { value: inheritedMove })
    Object.setPrototypeOf(stored.state.history, historyPrototype)
    delete stored.state.history[holeIndex]

    expect(Object.hasOwn(stored.state.history, holeIndex)).toBe(false)
    expect(stored.state.history[holeIndex]).toBe(inheritedMove)
    expect(decodeStoredGame(stored)).toBeNull()
  })

  it.each([
    { name: '非法 currentPlayer', change: (state: MutableState) => (state.currentPlayer = 'red') },
    { name: '非 playing status', change: (state: MutableState) => (state.status = 'won') },
    { name: '非 null winner', change: (state: MutableState) => (state.winner = 'black') },
    {
      name: '非空 winningLines',
      change: (state: MutableState) => state.winningLines.push([{ row: 7, col: 7 }]),
    },
  ])('拒绝$name', ({ change }) => {
    const stored = mutableStoredGame()
    change(stored.state)

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('拒绝 board 与 history 不一致', () => {
    const stored = mutableStoredGame()
    stored.state.board[7 * BOARD_SIZE + 7] = null

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('拒绝 currentPlayer 与 history 不一致', () => {
    const stored = mutableStoredGame()
    stored.state.currentPlayer = 'black'

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('拒绝空 history', () => {
    const stored = mutableStoredGame(createGame())

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it.each([
    { name: '重复位置', moves: [{ row: 7, col: 7, player: 'black' }, { row: 7, col: 7, player: 'white' }] },
    { name: '越界位置', moves: [{ row: BOARD_SIZE, col: 0, player: 'black' }] },
    { name: '玩家顺序错误', moves: [{ row: 7, col: 7, player: 'white' }] },
    {
      name: '终局后额外 move',
      moves: [...winningGame().history, { row: 14, col: 14, player: 'black' }],
    },
  ] satisfies readonly { name: string; moves: readonly Move[] }[])('拒绝 history 中的$name', ({ moves }) => {
    const stored = mutableStoredGame()
    stored.state.history = structuredClone(moves)

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it.each([
    { name: 'won', state: winningGame() },
    { name: 'draw', state: drawGame() },
  ])('拒绝能重放成 $name 的 history', ({ state }) => {
    const stored = mutableStoredGame(state)
    stored.state.status = 'playing'
    stored.state.winner = null
    stored.state.winningLines = []

    expect(decodeStoredGame(stored)).toBeNull()
  })

  it('解码过程中不修改输入值', () => {
    const stored = mutableStoredGame()
    const before = structuredClone(stored)

    const decoded = decodeStoredGame(stored)

    expect(stored).toEqual(before)
    expect(decoded?.board).not.toBe(stored.state.board)
    expect(decoded?.history).not.toBe(stored.state.history)
  })
})

describe('GomokuStorage', () => {
  it('保存并恢复有效活动棋局', () => {
    const backing = new MemoryStorage()
    const storage = new GomokuStorage(backing)
    const state = activeGame()

    expect(storage.save(state)).toEqual({ ok: true })
    expect(JSON.parse(backing.values.get(STORAGE_KEY) ?? 'null')).toEqual({ version: 1, state })

    const result = storage.load()
    expect(result).toEqual({ kind: 'loaded', state })
    if (result.kind !== 'loaded') throw new Error('有效活动棋局应当成功恢复')
    expect(result.state.board).not.toBe(state.board)
    expect(result.state.history).not.toBe(state.history)
  })

  it('无存档时返回 empty', () => {
    expect(new GomokuStorage(new MemoryStorage()).load()).toEqual({ kind: 'empty' })
  })

  it('clear 正常删除存档', () => {
    const backing = new MemoryStorage()
    backing.values.set(STORAGE_KEY, 'saved')

    expect(new GomokuStorage(backing).clear()).toEqual({ ok: true })
    expect(backing.values.has(STORAGE_KEY)).toBe(false)
  })

  it.each([
    { name: '空棋局', state: createGame() },
    { name: '获胜棋局', state: winningGame() },
    { name: '和棋', state: drawGame() },
  ])('save $name时清除已有活动存档', ({ state }) => {
    const backing = new MemoryStorage()
    backing.values.set(STORAGE_KEY, 'old game')

    expect(new GomokuStorage(backing).save(state)).toEqual({ ok: true })
    expect(backing.values.has(STORAGE_KEY)).toBe(false)
  })

  it.each([
    { name: '版本不兼容', value: { version: 2, state: activeGame() } },
    { name: '字段损坏', value: { version: 1, state: { history: [] } } },
  ])('load 识别$name并清理存档', ({ value }) => {
    const backing = new MemoryStorage()
    seedStoredValue(backing, value)

    expect(new GomokuStorage(backing).load()).toEqual({ kind: 'invalid' })
    expect(backing.values.has(STORAGE_KEY)).toBe(false)
  })

  it('JSON 损坏时返回 invalid 并清理存档', () => {
    const backing = new MemoryStorage()
    backing.values.set(STORAGE_KEY, '{broken')

    expect(new GomokuStorage(backing).load()).toEqual({ kind: 'invalid' })
    expect(backing.values.has(STORAGE_KEY)).toBe(false)
  })

  it('getItem 抛出普通异常时返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.getError = new Error('blocked')

    expect(new GomokuStorage(backing).load()).toEqual({ kind: 'unavailable' })
  })

  it('getItem 抛出 SyntaxError 时仍返回 unavailable 而不是 JSON 损坏', () => {
    const backing = new MemoryStorage()
    backing.getError = new SyntaxError('getter failed')

    expect(new GomokuStorage(backing).load()).toEqual({ kind: 'unavailable' })
    expect(backing.removeCalls).toBe(0)
  })

  it('invalid 数据清理时 removeItem 抛出返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.values.set(STORAGE_KEY, '{broken')
    backing.removeError = new Error('blocked')

    expect(new GomokuStorage(backing).load()).toEqual({ kind: 'unavailable' })
  })

  it('活动棋局写入失败时返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.setError = new Error('quota exceeded')

    expect(new GomokuStorage(backing).save(activeGame())).toEqual({
      ok: false,
      reason: 'unavailable',
    })
    expect(backing.setCalls).toBe(1)
  })

  it('编码阶段抛错时继续抛出且不调用 setItem', () => {
    const backing = new MemoryStorage()
    const error = new Error('encode failed')
    const state: GameState = { ...activeGame() }
    Object.defineProperty(state, 'board', {
      get: () => {
        throw error
      },
    })

    expect(() => new GomokuStorage(backing).save(state)).toThrow(error)
    expect(backing.setCalls).toBe(0)
  })

  it('清理型 save 的 removeItem 失败时返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.removeError = new Error('blocked')

    expect(new GomokuStorage(backing).save(createGame())).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })

  it('clear 的 removeItem 失败时返回 unavailable', () => {
    const backing = new MemoryStorage()
    backing.removeError = new Error('blocked')

    expect(new GomokuStorage(backing).clear()).toEqual({
      ok: false,
      reason: 'unavailable',
    })
  })
})

describe('createBrowserGomokuStorage', () => {
  it('window.localStorage getter 失败时返回 unavailable port', () => {
    const getter = vi.spyOn(window, 'localStorage', 'get').mockImplementation(() => {
      throw new Error('blocked')
    })

    try {
      const storage = createBrowserGomokuStorage()

      expect(storage.load()).toEqual({ kind: 'unavailable' })
      expect(storage.save(activeGame())).toEqual({ ok: false, reason: 'unavailable' })
      expect(storage.clear()).toEqual({ ok: false, reason: 'unavailable' })
    } finally {
      getter.mockRestore()
    }
  })
})
