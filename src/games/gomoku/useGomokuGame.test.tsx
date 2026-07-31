import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode, Suspense, startTransition, type ReactNode } from 'react'

import { createGame, placeStone, replayMoves } from './core/game'
import { BOARD_SIZE, type GameState, type Move, type Position } from './core/types'
import {
  type GomokuStoragePort,
  type LoadResult,
  type SaveResult,
} from './storage/storage'
import { useGomokuGame } from './useGomokuGame'

class FakeStorage implements GomokuStoragePort {
  readonly savedStates: GameState[] = []
  loadCalls = 0
  clearCalls = 0

  constructor(
    private readonly loadResult: LoadResult,
    private readonly saveResult: SaveResult = { ok: true },
    private readonly clearResult: SaveResult = { ok: true },
  ) {}

  load(): LoadResult {
    this.loadCalls += 1
    return this.loadResult
  }

  save(state: GameState): SaveResult {
    this.savedStates.push(state)
    return this.saveResult
  }

  clear(): SaveResult {
    this.clearCalls += 1
    return this.clearResult
  }
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

function winningSetup(): GameState {
  return playMoves([
    { row: 7, col: 3 },
    { row: 0, col: 0 },
    { row: 7, col: 4 },
    { row: 0, col: 1 },
    { row: 7, col: 5 },
    { row: 0, col: 2 },
    { row: 7, col: 6 },
    { row: 1, col: 0 },
  ])
}

function winningGame(): GameState {
  const result = placeStone(winningSetup(), { row: 7, col: 7 })
  if (!result.ok || result.state.status !== 'won') throw new Error('获胜棋局准备失败')
  return result.state
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

function drawSetup(): { readonly state: GameState; readonly lastPosition: Position } {
  const moves = drawMoves()
  const lastMove = moves.at(-1)
  if (lastMove === undefined) throw new Error('和棋序列应当包含最后一步')

  const state = replayMoves(moves.slice(0, -1))
  if (state === null || state.status !== 'playing') throw new Error('和棋前置状态无效')

  return { state, lastPosition: { row: lastMove.row, col: lastMove.col } }
}

const pendingRender = new Promise<void>(() => undefined)

function SuspendWhenRequested({ suspend }: { readonly suspend: boolean }): null {
  if (suspend) throw pendingRender
  return null
}

function InteractiveGame({
  storage,
  suspend,
  onSuspendedRender,
}: {
  readonly storage: GomokuStoragePort
  readonly suspend: boolean
  readonly onSuspendedRender: () => void
}): ReactNode {
  const controller = useGomokuGame(storage)
  if (suspend) onSuspendedRender()

  return (
    <>
      <button type="button" onClick={() => controller.play({ row: 7, col: 7 })}>
        落子
      </button>
      <SuspendWhenRequested suspend={suspend} />
    </>
  )
}

describe('useGomokuGame', () => {
  it('无存档时创建新棋局且不显示提示', () => {
    const storage = new FakeStorage({ kind: 'empty' })

    const { result } = renderHook(() => useGomokuGame(storage))

    expect(result.current.game).toEqual(createGame())
    expect(result.current.notice).toBeNull()
    expect(storage.loadCalls).toBe(1)
  })

  it('StrictMode 开发期重复执行时仍只恢复一次', () => {
    const savedGame = playMoves([{ row: 7, col: 7 }])
    const storage = new FakeStorage({ kind: 'loaded', state: savedGame })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )

    const { result } = renderHook(() => useGomokuGame(storage), { wrapper })

    expect(result.current.game).toBe(savedGame)
    expect(storage.loadCalls).toBe(1)
  })

  it('真实卸载后重新挂载的新 Hook 实例各自恢复一次', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )

    const firstHook = renderHook(() => useGomokuGame(storage), { wrapper })
    expect(storage.loadCalls).toBe(1)

    firstHook.unmount()
    renderHook(() => useGomokuGame(storage), { wrapper })

    expect(storage.loadCalls).toBe(2)
  })

  it('恢复有效存档且不显示提示', () => {
    const savedGame = playMoves([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
    ])
    const storage = new FakeStorage({ kind: 'loaded', state: savedGame })

    const { result } = renderHook(() => useGomokuGame(storage))

    expect(result.current.game).toBe(savedGame)
    expect(result.current.notice).toBeNull()
    expect(storage.loadCalls).toBe(1)
  })

  it('存档无效时开始新棋局并显示恢复失败提示', () => {
    const storage = new FakeStorage({ kind: 'invalid' })

    const { result } = renderHook(() => useGomokuGame(storage))

    expect(result.current.game).toEqual(createGame())
    expect(result.current.notice).toBe('旧对局无法恢复，已开始新棋局。')
  })

  it('存储不可用时开始新棋局并显示自动保存提示', () => {
    const storage = new FakeStorage({ kind: 'unavailable' })

    const { result } = renderHook(() => useGomokuGame(storage))

    expect(result.current.game).toEqual(createGame())
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })

  it('合法落子更新内存棋局并保存新状态', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.play({ row: 7, col: 7 }))

    expect(result.current.game.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    expect(result.current.game.currentPlayer).toBe('white')
    expect(storage.savedStates).toEqual([result.current.game])
  })

  it('非法落子不改变棋局且不保存', () => {
    const savedGame = playMoves([{ row: 7, col: 7 }])
    const storage = new FakeStorage({ kind: 'loaded', state: savedGame })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.play({ row: 7, col: 7 }))

    expect(result.current.game).toBe(savedGame)
    expect(storage.savedStates).toHaveLength(0)
  })

  it('保存失败时保留内存落子并允许关闭提示', () => {
    const storage = new FakeStorage({ kind: 'empty' }, { ok: false, reason: 'unavailable' })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.play({ row: 7, col: 7 }))

    expect(result.current.game.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')

    act(() => result.current.dismissNotice())

    expect(result.current.notice).toBeNull()
  })

  it('存储端口 save 抛出的编程错误不会被吞掉', () => {
    const programmingError = new Error('unexpected save failure')
    const storage: GomokuStoragePort = {
      load: () => ({ kind: 'empty' }),
      save: () => {
        throw programmingError
      },
      clear: () => ({ ok: true }),
    }
    const { result } = renderHook(() => useGomokuGame(storage))

    expect(() => {
      act(() => result.current.play({ row: 7, col: 7 }))
    }).toThrow(programmingError)
  })

  it('同一次 act 连续落子时基于最新规范状态依次执行', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => {
      result.current.play({ row: 7, col: 7 })
      result.current.play({ row: 7, col: 8 })
    })

    expect(result.current.game.history).toEqual([
      { row: 7, col: 7, player: 'black' },
      { row: 7, col: 8, player: 'white' },
    ])
    expect(storage.savedStates).toHaveLength(2)
    expect(storage.savedStates[1]).toBe(result.current.game)
  })

  it('获胜落子仍将 won 状态交给存储端口', () => {
    const storage = new FakeStorage({ kind: 'loaded', state: winningSetup() })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.play({ row: 7, col: 7 }))

    expect(result.current.game.status).toBe('won')
    expect(storage.savedStates).toEqual([result.current.game])
  })

  it('和棋落子仍将 draw 状态交给存储端口', () => {
    const setup = drawSetup()
    const storage = new FakeStorage({ kind: 'loaded', state: setup.state })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.play(setup.lastPosition))

    expect(result.current.game.status).toBe('draw')
    expect(storage.savedStates).toEqual([result.current.game])
  })

  it('空棋局悔棋不改变状态且不保存', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result } = renderHook(() => useGomokuGame(storage))
    const initialGame = result.current.game

    act(() => result.current.undo())

    expect(result.current.game).toBe(initialGame)
    expect(storage.savedStates).toHaveLength(0)
  })

  it('普通悔棋更新内存状态并保存', () => {
    const savedGame = playMoves([
      { row: 7, col: 7 },
      { row: 7, col: 8 },
    ])
    const storage = new FakeStorage({ kind: 'loaded', state: savedGame })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.undo())

    expect(result.current.game.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    expect(result.current.game.currentPlayer).toBe('white')
    expect(storage.savedStates).toEqual([result.current.game])
  })

  it('终局后悔棋恢复进行中并保存', () => {
    const storage = new FakeStorage({ kind: 'loaded', state: winningGame() })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.undo())

    expect(result.current.game.status).toBe('playing')
    expect(result.current.game.winner).toBeNull()
    expect(result.current.game.winningLines).toEqual([])
    expect(result.current.game.history).toHaveLength(8)
    expect(storage.savedStates).toEqual([result.current.game])
  })

  it('同一次 act 落子后立即悔棋不会丢失刚落下的状态', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => {
      result.current.play({ row: 7, col: 7 })
      result.current.undo()
    })

    expect(result.current.game).toEqual(createGame())
    expect(storage.savedStates).toHaveLength(2)
    expect(storage.savedStates[0]?.history).toHaveLength(1)
    expect(storage.savedStates[1]).toBe(result.current.game)
  })

  it('重新开始创建全新棋局并显式清除存档', () => {
    const storage = new FakeStorage({
      kind: 'loaded',
      state: playMoves([{ row: 7, col: 7 }]),
    })
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.restart())

    expect(result.current.game).toEqual(createGame())
    expect(result.current.game.history).toHaveLength(0)
    expect(storage.clearCalls).toBe(1)
  })

  it('清除存档失败时保留新棋局并显示自动保存提示', () => {
    const storage = new FakeStorage(
      { kind: 'loaded', state: playMoves([{ row: 7, col: 7 }]) },
      { ok: true },
      { ok: false, reason: 'unavailable' },
    )
    const { result } = renderHook(() => useGomokuGame(storage))

    act(() => result.current.restart())

    expect(result.current.game).toEqual(createGame())
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
    expect(storage.clearCalls).toBe(1)
  })

  it('多次重新开始每次都返回独立的初始状态', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result } = renderHook(() => useGomokuGame(storage))
    const mountedGame = result.current.game

    act(() => result.current.restart())
    const firstRestart = result.current.game
    act(() => result.current.restart())
    const secondRestart = result.current.game

    expect(firstRestart).toEqual(createGame())
    expect(secondRestart).toEqual(createGame())
    expect(firstRestart).not.toBe(mountedGame)
    expect(secondRestart).not.toBe(firstRestart)
    expect(storage.clearCalls).toBe(2)
  })

  it('普通 rerender 保持所有操作回调引用稳定', () => {
    const storage = new FakeStorage({ kind: 'empty' })
    const { result, rerender } = renderHook(() => useGomokuGame(storage))
    const callbacks = {
      play: result.current.play,
      undo: result.current.undo,
      restart: result.current.restart,
      dismissNotice: result.current.dismissNotice,
    }

    rerender()

    expect(result.current.play).toBe(callbacks.play)
    expect(result.current.undo).toBe(callbacks.undo)
    expect(result.current.restart).toBe(callbacks.restart)
    expect(result.current.dismissNotice).toBe(callbacks.dismissNotice)
  })

  it('替换存储依赖不重新加载，后续保存与清除使用新依赖', () => {
    const firstStorage = new FakeStorage({ kind: 'empty' })
    const secondStorage = new FakeStorage({ kind: 'invalid' })
    const { result, rerender } = renderHook(
      ({ storage }: { storage: GomokuStoragePort }) => useGomokuGame(storage),
      { initialProps: { storage: firstStorage } },
    )
    const callbacks = {
      play: result.current.play,
      undo: result.current.undo,
      restart: result.current.restart,
      dismissNotice: result.current.dismissNotice,
    }

    rerender({ storage: secondStorage })
    act(() => result.current.play({ row: 7, col: 7 }))
    act(() => result.current.restart())

    expect(firstStorage.loadCalls).toBe(1)
    expect(secondStorage.loadCalls).toBe(0)
    expect(firstStorage.savedStates).toHaveLength(0)
    expect(firstStorage.clearCalls).toBe(0)
    expect(secondStorage.savedStates).toHaveLength(1)
    expect(secondStorage.clearCalls).toBe(1)
    expect(result.current.play).toBe(callbacks.play)
    expect(result.current.undo).toBe(callbacks.undo)
    expect(result.current.restart).toBe(callbacks.restart)
    expect(result.current.dismissNotice).toBe(callbacks.dismissNotice)
  })

  it('未提交的挂起 render 不得改变旧控制器使用的存储端口', () => {
    const firstStorage = new FakeStorage({ kind: 'empty' })
    const secondStorage = new FakeStorage({ kind: 'empty' })
    let suspendedRenderCalls = 0
    const onSuspendedRender = (): void => {
      suspendedRenderCalls += 1
    }
    const view = render(
      <Suspense fallback={<p>加载中</p>}>
        <InteractiveGame
          storage={firstStorage}
          suspend={false}
          onSuspendedRender={onSuspendedRender}
        />
      </Suspense>,
    )

    act(() => {
      startTransition(() => {
        view.rerender(
          <Suspense fallback={<p>加载中</p>}>
            <InteractiveGame
              storage={secondStorage}
              suspend
              onSuspendedRender={onSuspendedRender}
            />
          </Suspense>,
        )
      })
    })

    expect(suspendedRenderCalls).toBeGreaterThan(0)
    expect(screen.queryByText('加载中')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '落子' }))

    expect([firstStorage.savedStates.length, secondStorage.savedStates.length]).toEqual([1, 0])
  })
})
