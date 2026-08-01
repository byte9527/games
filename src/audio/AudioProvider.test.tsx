import { Component, StrictMode, type ReactNode, useEffect } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { MusicEngineFactory, MusicEnginePort, MusicUnlockResult } from './core/MusicEnginePort'
import type { MusicScore } from './core/musicScore'
import type { MusicPreferenceStoragePort } from './storage/musicPreferenceStorage'
import {
  observeDocumentEventBoundary,
  type DocumentEventBoundary,
} from '../test/documentEventBoundary'
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
  let rejectPromise: ((reason?: unknown) => void) | undefined
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve
    rejectPromise = reject
  })

  return {
    promise,
    resolve(value: T) {
      if (resolvePromise === undefined) throw new Error('延迟 Promise 尚未初始化')
      resolvePromise(value)
    },
    reject(reason: unknown) {
      if (rejectPromise === undefined) throw new Error('延迟 Promise 尚未初始化')
      rejectPromise(reason)
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
  useGameMusic(gameScore, active)

  return <AudioActivationHarness />
}

function AudioActivationHarness() {
  const controller = useAudioController()

  return (
    <div>
      <output data-testid="enabled">{String(controller.enabled)}</output>
      <output data-testid="availability">{controller.availability}</output>
      <output data-testid="notice">{controller.notice ?? ''}</output>
      <button type="button" data-audio-toggle="true" onClick={() => controller.toggle()}>
        toggle
      </button>
      <button type="button" onClick={controller.dismissNotice}>
        dismiss
      </button>
    </div>
  )
}

function UntrustedControllerConsumer() {
  const { enabled, toggle } = useAudioController()

  useEffect(() => {
    queueMicrotask(() => toggle())
  }, [toggle])

  return <output data-testid="untrusted-enabled">{String(enabled)}</output>
}

function SceneRegistration({ gameScore, active }: { gameScore: MusicScore; active: boolean }) {
  useGameMusic(gameScore, active)
  return null
}

interface CapturingErrorBoundaryProps {
  readonly children: ReactNode
  readonly onError: (error: Error) => void
}

interface CapturingErrorBoundaryState {
  readonly error: Error | null
}

class CapturingErrorBoundary extends Component<
  CapturingErrorBoundaryProps,
  CapturingErrorBoundaryState
> {
  state: CapturingErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): CapturingErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    if (this.state.error !== null) {
      return <output data-testid="fatal-error">{this.state.error.message}</output>
    }
    return this.props.children
  }
}

const originalVisibilityState = Object.getOwnPropertyDescriptor(document, 'visibilityState')

function setVisibilityState(value: DocumentVisibilityState) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    value,
  })
  fireEvent(document, new Event('visibilitychange'))
}

function readQueuedError(callbacks: readonly VoidFunction[]): unknown {
  expect(callbacks).toHaveLength(1)
  const callback = callbacks[0]
  if (callback === undefined) throw new Error('预期存在一个排队的全局错误回调')

  try {
    callback()
  } catch (error) {
    return error
  }
  throw new Error('全局错误回调没有抛出异常')
}

function collectQueuedErrors(callbacks: readonly VoidFunction[]): readonly unknown[] {
  const errors: unknown[] = []
  for (const callback of [...callbacks]) {
    try {
      callback()
    } catch (error) {
      errors.push(error)
    }
  }
  return errors
}

async function flushPromiseChain(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

async function activateAudioWithVerifiedSignal(): Promise<void> {
  await act(async () => {
    documentEventBoundary.dispatchTrustedCapture('pointerdown', document.body)
    await flushPromiseChain()
  })
}

function clickToggleWithTrustedBrowserBoundary(): void {
  const toggle = screen.getByRole('button', { name: 'toggle' })
  documentEventBoundary.dispatchTrustedCapture('click', toggle)
  fireEvent.click(toggle)
}

let documentEventBoundary: DocumentEventBoundary

beforeEach(() => {
  window.localStorage.clear()
  documentEventBoundary = observeDocumentEventBoundary()
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
  it('普通 controller 消费者不能在无可信事件时声明可信并创建引擎', async () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider
        engineFactory={engineFactory}
        storage={createStorage({ kind: 'loaded', enabled: false })}
      >
        <UntrustedControllerConsumer />
      </AudioProvider>,
    )

    await act(async () => {
      await flushPromiseChain()
    })

    expect(screen.getByTestId('untrusted-enabled')).toHaveTextContent('true')
    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
  })

  it('可信开关 click 被 toggle 同步消费时取消任务兜底 timer', () => {
    render(
      <AudioProvider storage={createStorage({ kind: 'loaded', enabled: false })}>
        <ControllerHarness />
      </AudioProvider>,
    )

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const toggle = screen.getByRole('button', { name: 'toggle' })

    documentEventBoundary.dispatchTrustedCapture('click', toggle)
    const timerId = setTimeoutSpy.mock.results.at(-1)?.value
    if (timerId === undefined) throw new Error('预期可信 click 安排任务兜底 timer')

    fireEvent.click(toggle)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId)
  })

  it('可信开关 click capture 后卸载 Provider 会取消任务兜底 timer', () => {
    const view = render(
      <AudioProvider storage={createStorage({ kind: 'loaded', enabled: false })}>
        <ControllerHarness />
      </AudioProvider>,
    )

    const setTimeoutSpy = vi.spyOn(window, 'setTimeout')
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const toggle = screen.getByRole('button', { name: 'toggle' })

    documentEventBoundary.dispatchTrustedCapture('click', toggle)
    const timerId = setTimeoutSpy.mock.results.at(-1)?.value
    if (timerId === undefined) throw new Error('预期可信 click 安排任务兜底 timer')

    view.unmount()

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(timerId)
  })

  it('新的可信开关 click 会取消旧 timer，且旧回调不能清除新事件令牌', () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)
    render(
      <AudioProvider
        engineFactory={engineFactory}
        storage={createStorage({ kind: 'loaded', enabled: false })}
      >
        <ControllerHarness />
      </AudioProvider>,
    )

    const timerCallbacks: VoidFunction[] = []
    const setTimeoutSpy = vi.spyOn(window, 'setTimeout').mockImplementation((handler) => {
      if (typeof handler !== 'function') throw new Error('预期 timer handler 为函数')
      timerCallbacks.push(() => handler())
      return timerCallbacks.length
    })
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout')
    const toggle = screen.getByRole('button', { name: 'toggle' })

    documentEventBoundary.dispatchTrustedCapture('click', toggle)
    documentEventBoundary.dispatchTrustedCapture('click', toggle)

    expect(setTimeoutSpy).toHaveBeenCalledTimes(2)
    expect(clearTimeoutSpy).toHaveBeenCalledTimes(1)
    expect(clearTimeoutSpy).toHaveBeenCalledWith(1)
    const oldTimerCallback = timerCallbacks[0]
    if (oldTimerCallback === undefined) throw new Error('预期存在旧 timer 回调')
    oldTimerCallback()

    fireEvent.click(toggle)

    expect(clearTimeoutSpy).toHaveBeenCalledTimes(2)
    expect(clearTimeoutSpy).toHaveBeenLastCalledWith(2)
    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(1)
  })

  it('未被同步消费的可信开关 click 在当前事件任务结束后失效', async () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider
        engineFactory={engineFactory}
        storage={createStorage({ kind: 'loaded', enabled: false })}
      >
        <ControllerHarness />
      </AudioProvider>,
    )

    const toggle = screen.getByRole('button', { name: 'toggle' })
    await act(async () => {
      documentEventBoundary.dispatchTrustedCapture('click', toggle)
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0))
    })
    fireEvent.click(toggle)

    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
  })

  it('合成的全局 pointerdown 和 keydown 不创建或解锁引擎', async () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await act(async () => {
      document.dispatchEvent(new Event('pointerdown', { bubbles: true }))
      document.dispatchEvent(new Event('keydown', { bubbles: true }))
      await flushPromiseChain()
    })

    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(engine.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('availability')).toHaveTextContent('locked')
  })

  it('首次已验证可信信号前不创建或解锁引擎，信号到达后解锁并播放', async () => {
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

    await activateAudioWithVerifiedSignal()

    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.play).toHaveBeenCalledWith(score)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
  })

  it('音乐开关和普通目标上的合成事件均不触发全局解锁', async () => {
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
        <button type="button" data-audio-toggle="true">
          音乐开关
        </button>
        <ControllerHarness />
      </AudioProvider>,
    )

    const musicToggle = screen.getByRole('button', { name: '音乐开关' })
    await act(async () => {
      fireEvent.pointerDown(musicToggle)
      fireEvent.keyDown(musicToggle)
    })

    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.pointerDown(document.body)
      fireEvent.keyDown(document.body)
      await flushPromiseChain()
    })

    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
  })

  it('StrictMode 下同时到达的已验证可信信号共享一次创建和解锁', async () => {
    const deferred = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock).mockReturnValue(deferred.promise)
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    const view = render(
      <StrictMode>
        <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
          <ControllerHarness />
        </AudioProvider>
      </StrictMode>,
    )

    expect(
      documentEventBoundary.countActiveCaptureListeners('pointerdown'),
    ).toBe(1)
    expect(
      documentEventBoundary.countActiveCaptureListeners('keydown'),
    ).toBe(1)
    expect(documentEventBoundary.countActiveCaptureListeners('click')).toBe(1)

    await activateAudioWithVerifiedSignal()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
    })

    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(
      documentEventBoundary.countActiveCaptureListeners('pointerdown'),
    ).toBe(1)
    expect(
      documentEventBoundary.countActiveCaptureListeners('keydown'),
    ).toBe(1)
    expect(documentEventBoundary.countActiveCaptureListeners('click')).toBe(1)

    await act(async () => {
      deferred.resolve({ ok: true })
      await deferred.promise
    })

    expect(engine.play).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
    expect(
      documentEventBoundary.countActiveCaptureListeners('pointerdown'),
    ).toBe(0)
    expect(
      documentEventBoundary.countActiveCaptureListeners('keydown'),
    ).toBe(0)
    expect(documentEventBoundary.countActiveCaptureListeners('click')).toBe(1)

    view.unmount()
    expect(
      documentEventBoundary.countActiveCaptureListeners('pointerdown'),
    ).toBe(0)
    expect(
      documentEventBoundary.countActiveCaptureListeners('keydown'),
    ).toBe(0)
    expect(documentEventBoundary.countActiveCaptureListeners('click')).toBe(0)
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

    await activateAudioWithVerifiedSignal()

    expect(screen.getByTestId('availability')).toHaveTextContent('locked')
    expect(screen.getByTestId('notice')).toBeEmptyDOMElement()
    expect(engine.play).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
      await flushPromiseChain()
    })

    expect(engine.unlock).toHaveBeenCalledTimes(2)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it('并发已验证可信信号共享一次失败解锁，并只让错误边界捕获一次未知错误', async () => {
    const rejection = { reason: 'unlock failed' }
    const deferred = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock).mockReturnValue(deferred.promise)
    const caughtErrors = vi.fn<(error: Error) => void>()
    const reactCaughtErrors = vi.fn()
    const queuedCallbacks: VoidFunction[] = []

    render(
      <CapturingErrorBoundary onError={caughtErrors}>
        <AudioProvider engineFactory={() => engine} storage={createStorage()}>
          <ControllerHarness />
        </AudioProvider>
      </CapturingErrorBoundary>,
      { onCaughtError: reactCaughtErrors },
    )

    await activateAudioWithVerifiedSignal()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
    })
    expect(engine.unlock).toHaveBeenCalledTimes(1)

    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      queuedCallbacks.push(callback)
    })
    await act(async () => {
      deferred.reject(rejection)
      await deferred.promise.catch(() => undefined)
    })

    expect(caughtErrors).toHaveBeenCalledTimes(1)
    expect(reactCaughtErrors).toHaveBeenCalledTimes(1)
    expect(screen.getAllByTestId('fatal-error')).toHaveLength(1)
    expect(screen.getByTestId('fatal-error')).toHaveTextContent('音乐引擎解锁失败')
    const caughtError = caughtErrors.mock.calls[0]?.[0]
    expect(caughtError).toBeInstanceOf(Error)
    expect(caughtError?.cause).toBe(rejection)
    expect(collectQueuedErrors(queuedCallbacks)).toEqual([])
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

    await activateAudioWithVerifiedSignal()

    expect(screen.getByTestId('enabled')).toHaveTextContent('true')
    expect(screen.getByTestId('availability')).toHaveTextContent('unavailable')
    expect(screen.getByTestId('notice')).toHaveTextContent(notice)
  })

  it('初始关闭时普通合成事件不解锁，已验证开启信号会保存、解锁并播放', async () => {
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
      clickToggleWithTrustedBrowserBoundary()
      await flushPromiseChain()
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

    await activateAudioWithVerifiedSignal()
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

    await activateAudioWithVerifiedSignal()

    act(() => setVisibilityState('hidden'))
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)

    await act(async () => {
      setVisibilityState('visible')
      await flushPromiseChain()
    })
    expect(engine.unlock).toHaveBeenCalledTimes(2)
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

  it('页面从隐藏恢复可见时先恢复已有引擎，并发开启共享恢复且完成后才播放', async () => {
    const resume = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock)
      .mockResolvedValueOnce({ ok: true })
      .mockReturnValueOnce(resume.promise)

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    expect(engine.play).toHaveBeenCalledTimes(1)

    act(() => setVisibilityState('hidden'))
    vi.mocked(engine.play).mockClear()

    act(() => setVisibilityState('visible'))

    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
    })

    expect(engine.unlock).toHaveBeenCalledTimes(2)
    expect(engine.play).not.toHaveBeenCalled()

    await act(async () => {
      resume.resolve({ ok: true })
      await resume.promise
    })

    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it('已有引擎但没有注册场景时，从隐藏恢复可见不会再次解锁且保持停止语义', async () => {
    const engine = createEngine()
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    expect(engine.unlock).toHaveBeenCalledTimes(1)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
      </AudioProvider>,
    )
    expect(engine.stop).toHaveBeenCalled()

    vi.mocked(engine.stop).mockClear()
    vi.mocked(engine.pause).mockClear()
    act(() => setVisibilityState('hidden'))
    expect(engine.pause).toHaveBeenLastCalledWith(0)

    await act(async () => {
      setVisibilityState('visible')
      await flushPromiseChain()
    })

    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.stop).toHaveBeenCalledTimes(1)
  })

  it('已有引擎但当前场景不活动时，从隐藏恢复可见不会再次解锁且保持暂停语义', async () => {
    const engine = createEngine()
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    expect(engine.unlock).toHaveBeenCalledTimes(1)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness active={false} />
      </AudioProvider>,
    )
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)

    vi.mocked(engine.pause).mockClear()
    act(() => setVisibilityState('hidden'))
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)

    vi.mocked(engine.pause).mockClear()
    await act(async () => {
      setVisibilityState('visible')
      await flushPromiseChain()
    })

    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.pause).toHaveBeenLastCalledWith(score.fadeSeconds)
  })

  it('关闭后只有已验证可信开启信号会恢复已有引擎，完成前不播放', async () => {
    const resume = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)
    vi.mocked(engine.unlock)
      .mockResolvedValueOnce({ ok: true })
      .mockReturnValueOnce(resume.promise)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    vi.mocked(engine.play).mockClear()

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))

    expect(engine.unlock).toHaveBeenCalledTimes(1)
    expect(engine.play).not.toHaveBeenCalled()
    expect(screen.getByTestId('availability')).toHaveTextContent('locked')

    fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
    clickToggleWithTrustedBrowserBoundary()

    expect(engineFactory).toHaveBeenCalledTimes(1)
    expect(engine.unlock).toHaveBeenCalledTimes(2)
    expect(engine.play).not.toHaveBeenCalled()

    await act(async () => {
      resume.resolve({ ok: true })
      await resume.promise
    })

    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it('页面恢复被浏览器阻止时回到 locked，后续已验证开启信号可重试', async () => {
    const engine = createEngine()
    vi.mocked(engine.unlock)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, kind: 'blocked' })
      .mockResolvedValueOnce({ ok: true })

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    act(() => setVisibilityState('hidden'))
    vi.mocked(engine.play).mockClear()

    await act(async () => {
      setVisibilityState('visible')
      await flushPromiseChain()
    })

    await waitFor(() => {
      expect(screen.getByTestId('availability')).toHaveTextContent('locked')
    })
    expect(engine.play).not.toHaveBeenCalled()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
      await flushPromiseChain()
    })

    expect(engine.unlock).toHaveBeenCalledTimes(3)
    expect(screen.getByTestId('availability')).toHaveTextContent('ready')
    expect(engine.play).toHaveBeenCalledWith(score)
  })

  it('页面恢复报告不可用时进入 unavailable 并显示明确提示', async () => {
    const engine = createEngine()
    vi.mocked(engine.unlock)
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, kind: 'unavailable' })

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    act(() => setVisibilityState('hidden'))
    vi.mocked(engine.play).mockClear()

    await act(async () => {
      setVisibilityState('visible')
      await flushPromiseChain()
    })

    expect(screen.getByTestId('availability')).toHaveTextContent('unavailable')
    expect(screen.getByTestId('notice')).toHaveTextContent('当前浏览器无法播放音乐。')
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('切换曲目时播放新曲目，旧注册 cleanup 不会清除后来注册的同 id 场景', async () => {
    const engine = createEngine()
    const newerScore: MusicScore = { ...score, bpm: 90 }
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration gameScore={score} active />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="old" gameScore={score} active />
        <SceneRegistration key="new" gameScore={newerScore} active />
      </AudioProvider>,
    )
    expect(engine.play).toHaveBeenLastCalledWith(newerScore)

    const stopCount = vi.mocked(engine.stop).mock.calls.length
    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="new" gameScore={newerScore} active />
      </AudioProvider>,
    )

    expect(vi.mocked(engine.stop).mock.calls).toHaveLength(stopCount)
    expect(engine.play).toHaveBeenLastCalledWith(newerScore)
  })

  it('卸载最新场景后恢复仍挂载的上一场景', async () => {
    const engine = createEngine()
    const previousScore: MusicScore = { ...score, id: 'previous-theme', bpm: 100 }
    const latestScore: MusicScore = { ...score, id: 'latest-theme', bpm: 140 }
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="previous" gameScore={previousScore} active />
        <SceneRegistration key="latest" gameScore={latestScore} active />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    expect(engine.play).toHaveBeenLastCalledWith(latestScore)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="previous" gameScore={previousScore} active />
      </AudioProvider>,
    )

    expect(engine.play).toHaveBeenLastCalledWith(previousScore)
  })

  it('最新无效注册停止播放，卸载后恢复上一有效场景', async () => {
    const engine = createEngine()
    const validScore: MusicScore = { ...score, id: 'valid-theme' }
    const invalidScore: MusicScore = { ...score, id: 'invalid-theme', bpm: 0 }
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="valid" gameScore={validScore} active />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    expect(engine.play).toHaveBeenLastCalledWith(validScore)
    const playCountBeforeInvalidRegistration = vi.mocked(engine.play).mock.calls.length

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="valid" gameScore={validScore} active />
        <SceneRegistration key="invalid" gameScore={invalidScore} active />
      </AudioProvider>,
    )

    expect(engine.stop).toHaveBeenCalled()
    expect(screen.queryByTestId('fatal-error')).not.toBeInTheDocument()
    expect(engine.play).not.toHaveBeenCalledWith(invalidScore)

    view.rerender(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <AudioActivationHarness />
        <SceneRegistration key="valid" gameScore={validScore} active />
      </AudioProvider>,
    )

    expect(engine.play).toHaveBeenLastCalledWith(validScore)
    expect(engine.play).toHaveBeenCalledTimes(playCountBeforeInvalidRegistration + 1)
  })

  it('无效曲目立即停止、显示校验错误且绝不交给引擎播放', async () => {
    const engine = createEngine()
    const invalidScore: MusicScore = { ...score, bpm: 0 }

    render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness gameScore={invalidScore} />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()

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

    await activateAudioWithVerifiedSignal()
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

  it('卸载后到达的解锁拒绝只通过全局错误通道上报一次', async () => {
    const rejection = 'unlock failed after unmount'
    const deferred = createDeferred<MusicUnlockResult>()
    const engine = createEngine()
    vi.mocked(engine.unlock).mockReturnValue(deferred.promise)
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const queuedCallbacks: VoidFunction[] = []
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: 'toggle' }))
      clickToggleWithTrustedBrowserBoundary()
    })
    expect(engine.unlock).toHaveBeenCalledTimes(1)
    view.unmount()
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      queuedCallbacks.push(callback)
    })

    deferred.reject(rejection)
    await deferred.promise.catch(() => undefined)
    await flushPromiseChain()

    const reportedError = readQueuedError(queuedCallbacks)
    expect(reportedError).toBeInstanceOf(Error)
    if (!(reportedError instanceof Error)) throw new Error('预期全局上报 Error')
    expect(reportedError.message).toBe('音乐引擎解锁失败')
    expect(reportedError.cause).toBe(rejection)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('卸载时 stop 抛错仍释放引擎，并在 dispose 成功后上报 stop 错误', async () => {
    const stopError = new Error('stop failed')
    const queuedCallbacks: VoidFunction[] = []
    const engine = createEngine()
    vi.mocked(engine.stop).mockImplementation(() => {
      throw stopError
    })
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      queuedCallbacks.push(callback)
    })
    view.unmount()
    await Promise.resolve()

    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    expect(readQueuedError(queuedCallbacks)).toBe(stopError)
  })

  it('卸载时 stop 与 dispose 都失败会用 AggregateError 保留并上报两个错误', async () => {
    const stopError = new Error('stop failed')
    const disposeError = new Error('dispose failed')
    const queuedCallbacks: VoidFunction[] = []
    const engine = createEngine()
    vi.mocked(engine.stop).mockImplementation(() => {
      throw stopError
    })
    vi.mocked(engine.dispose).mockImplementation(() => {
      throw disposeError
    })
    const view = render(
      <AudioProvider engineFactory={() => engine} storage={createStorage()}>
        <ControllerHarness />
      </AudioProvider>,
    )

    await activateAudioWithVerifiedSignal()
    vi.spyOn(globalThis, 'queueMicrotask').mockImplementation((callback) => {
      queuedCallbacks.push(callback)
    })
    view.unmount()
    await Promise.resolve()

    expect(engine.stop).toHaveBeenCalledTimes(1)
    expect(engine.dispose).toHaveBeenCalledTimes(1)
    const reportedError = readQueuedError(queuedCallbacks)
    expect(reportedError).toBeInstanceOf(AggregateError)
    if (!(reportedError instanceof AggregateError)) {
      throw new Error('预期上报 AggregateError')
    }
    expect(reportedError.errors).toEqual([stopError, disposeError])
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
