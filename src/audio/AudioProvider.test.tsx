import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import type { MusicEngineFactory, MusicEnginePort, MusicUnlockResult } from './core/MusicEnginePort'
import type { MusicScore } from './core/musicScore'
import type { MusicPreferenceStoragePort } from './storage/musicPreferenceStorage'
import { AudioProvider, useAudioController } from './AudioProvider'
import { useGameMusic } from './useGameMusic'

const score: MusicScore = {
  id: 'game-theme',
  bpm: 120,
  beatsPerLoop: 4,
  masterGain: 0.4,
  fadeSeconds: 0.25,
  notes: [
    {
      beat: 0,
      durationBeats: 1,
      midi: 60,
      velocity: 0.8,
      instrument: 'pluck',
    },
  ],
}

function createDeferred<T>() {
  let resolvePromise: ((value: T) => void) | undefined
  const promise = new Promise<T>((resolve) => {
    resolvePromise = resolve
  })

  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('延迟 Promise 尚未初始化')
      resolvePromise(value)
    },
  }
}

function createEngine(unlockResult: MusicUnlockResult = { ok: true }): MusicEnginePort {
  return {
    unlock: vi.fn().mockResolvedValue(unlockResult),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn().mockResolvedValue(undefined),
  }
}

function createStorage(
  loadResult: ReturnType<MusicPreferenceStoragePort['load']> = { kind: 'loaded', enabled: true },
  saveResult: ReturnType<MusicPreferenceStoragePort['save']> = { ok: true },
): MusicPreferenceStoragePort {
  return {
    load: vi.fn().mockReturnValue(loadResult),
    save: vi.fn().mockReturnValue(saveResult),
  }
}

function ControllerHarness({ gameScore = score, active = true }: { gameScore?: MusicScore; active?: boolean }) {
  const controller = useAudioController()
  useGameMusic(gameScore, active)

  return (
    <div>
      <output data-testid="enabled">{String(controller.enabled)}</output>
      <output data-testid="availability">{controller.availability}</output>
      <output data-testid="notice">{controller.notice ?? ''}</output>
      <button type="button" onClick={controller.toggle}>
        toggle
      </button>
      <button type="button" onClick={controller.dismissNotice}>
        dismiss
      </button>
    </div>
  )
}

function SceneRegistration({ gameScore, active }: { gameScore: MusicScore; active: boolean }) {
  useGameMusic(gameScore, active)
  return null
}

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
  fireEvent(document, new Event('visibilitychange'))
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  if (originalVisibilityState === undefined) {
    Reflect.deleteProperty(document, 'visibilityState')
  } else {
    Object.defineProperty(document, 'visibilityState', originalVisibilityState)
  }
  vi.restoreAllMocks()
})

describe('AudioProvider', () => {
  it('首次可信事件前不创建或解锁引擎，事件后解锁并播放', async () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(engine.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('availability')).toHaveTextContent('locked')

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.play).toHaveBeenCalledWith(score)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
  })

  it('StrictMode 下同时到达的可信事件共享一次创建和解锁', async () => {
    const deferred = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock).mockReturnValue(deferred.promise)
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <StrictMode>
        <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
          <ControllerHarness />
        </AudioProvider>
      </StrictMode>,
    )

    fireEvent.pointerDown(document)
    fireEvent.keyDown(document)

    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.resolve({ ok: true })
      await deferred.promise
    })

    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
  })

  it('解锁被阻止时保持 locked 且允许下一次事件重试', async () => {
    const engine = createEngine()
    vi.mocked(engine.unlock)
      .mockResolvedValueOnce({ ok: false, kind: 'blocked' })
      .mockResolvedValueOnce({ ok: true })

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    expect(screen.getByTestId('availability')).toHaveTextContent('locked')
    expect(screen.getByTestId('notice')).toBeEmptyDOMElement()
    expect(engine.play).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.keyDown(document)
    })

    expect(engine.unlock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it.each([
    ['工厂不可用', () => null, '当前浏览器无法播放音乐。'],
    [
      '引擎报告不可用',
      () => createEngine({ ok: false, kind: 'unavailable' }),
      '当前浏览器无法播放音乐。',
    ],
  ])('%s 时显示明确的 unavailable 状态', async (_name, factory, notice) => {
    render(
      <AudioProvider engineFactory={factory} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('availability')).toHaveTextContent('unavailable')
    expect(screen.getByTestId('notice')).toHaveTextContent(notice)
  })

  it('初始关闭时普通可信事件不解锁，点击开启后保存、解锁并播放', async () => {
    const engine = createEngine()
    const storage = createStorage({ kind: 'loaded', enabled: false })
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={storage}>
        <ControllerHarness />
      </AudioProvider>,
    )

    fireEvent.pointerDown(document)
    expect(engineFactory).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    })

    expect(storage.save).toHaveBeenCalledWith(true)
    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it('关闭时保存 false 并暂停，保存失败不回滚内存状态', async () => {
    const engine = createEngine()
    const storage = createStorage({ kind: 'loaded', enabled: true }, { ok: false })

    render(
      <AudioProvider engineFactory={() => engine} storage={storage}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    expect(storage.save).toHaveBeenCalledWith(false)
    expect(screen.getByTestId('enabled')).toHaveTextContent('false')
    expect(screen.getByTestId('notice')).toHaveTextContent(
      '无法保存音乐设置，刷新后可能恢复默认值。',
    )
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)
  })

  it.each([
    ['invalid', { kind: 'invalid' } as const, '音乐设置已失效，本次使用默认开启。'],
    ['unavailable', { kind: 'unavailable' } as const, '无法读取音乐设置，本次使用默认开启。'],
  ])('偏好 %s 时默认开启并显示提示', (_name, loadResult, notice) => {
    render(
      <AudioProvider storage={createStorage(loadResult)}>
        <ControllerHarness />
      </AudioProvider>,
    )

    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('availability')).toHaveTextContent('locked')
    expect(screen.getByTestId('notice')).toHaveTextContent(notice)
  })

  it('普通重渲染只加载一次初始偏好并固定首次 storage 适配器', () => {
    const firstStorage = createStorage()
    const secondStorage = createStorage({ kind: 'loaded', enabled: false })
    const view = render(
      <AudioProvider storage={firstStorage}>
        <ControllerHarness />
      </AudioProvider>,
    )

    view.rerender(
      <AudioProvider storage={secondStorage}>
        <ControllerHarness active={false} />
      </AudioProvider>,
    )

    expect(firstStorage.load).toHaveBeenCalledTimes(1)
    expect(secondStorage.load).not.toHaveBeenCalled()
    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
  })

  it('页面隐藏、非活动场景和空场景均按唯一播放分支同步引擎', async () => {
    const engine = createEngine()
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    act(() => setVisibilityState('hidden'))
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)

    act(() => setVisibilityState('visible'))
    expect(engine.play).toHaveBeenLastCalledWith(score)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness active={false} />
      </AudioProvider>,
    )
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <div>no scene</div>
      </AudioProvider>,
    )
    expect(engine.stop).toHaveBeenCalled()
  })

  it('切换曲目时播放新曲目，旧注册 cleanup 不会清除后来注册的同 id 场景', async () => {
    const engine = createEngine()
    const newerScore: MusicScore = { ...score, bpm: 90 }
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <SceneRegistration gameScore={score} active />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <SceneRegistration key="old" gameScore={score} active />
        <SceneRegistration key="new" gameScore={newerScore} active />
      </AudioProvider>,
    )
    expect(engine.play).toHaveBeenLastCalledWith(newerScore)

    const stopCount = vi.mocked(engine.stop).mock.calls.length
    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <SceneRegistration key="new" gameScore={newerScore} active />
      </AudioProvider>,
    )

    expect(vi.mocked(engine.stop).mock.calls).toHaveLength(stopCount)
    expect(engine.play).toHaveBeenLastCalledWith(newerScore)
  })

  it('无效曲目立即停止、显示校验错误且绝不交给引擎播放', async () => {
    const engine = createEngine()
    const invalidScore: MusicScore = { ...score, bpm: 0 }

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness gameScore={invalidScore} />
      </AudioProvider>,
    )

    await act(async () => {
      fireEvent.pointerDown(document)
    })

    expect(screen.getByTestId('notice')).toHaveTextContent('曲目配置无效：速度必须大于 0')
    expect(engine.stop).toHaveBeenCalled()
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('dismissNotice 清除当前提示', () => {
    render(
      <AudioProvider storage={createStorage({ kind: 'invalid' })}>
        <ControllerHarness />
      </AudioProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: 'dismiss' }))
    expect(screen.getByTestId('notice')).toBeEmptyDOMElement()
  })

  it('Provider 外调用 useAudioController 时抛出清晰错误', () => {
    expect(() => render(<ControllerHarness />)).toThrow(
      'useAudioController 必须在 AudioProvider 内使用',
    )
  })

  it('卸载时停止并释放引擎一次，延迟解锁结果不会在卸载后更新状态', async () => {
    const deferred = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock).mockReturnValue(deferred.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    fireEvent.pointerDown(document)
    view.unmount()

    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(engine.dispose).toHaveBeenCalledTimes(1)

    await act(async () => {
      deferred.resolve({ ok: true })
      await deferred.promise
    })

    expect(engine.play).not.toHaveBeenCalled()
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('快速连续点击基于最新内存状态依次保存', () => {
    const storage = createStorage({ kind: 'loaded', enabled: false })
    const engine = createEngine({ ok: false, kind: 'blocked' })

    render(
      <AudioProvider engineFactory={() => engine} storage={storage}>
        <ControllerHarness />
      </AudioProvider>,
    )

    const toggle = screen.getByRole('button', { name: 'toggle' })
    act(() => {
      toggle.click()
      toggle.click()
      toggle.click()
    })

    expect(storage.save).toHaveBeenNthCalledWith(1, true)
    expect(storage.save).toHaveBeenNthCalledWith(2, false)
    expect(storage.save).toHaveBeenNthCalledWith(3, true)
    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
  })
})
