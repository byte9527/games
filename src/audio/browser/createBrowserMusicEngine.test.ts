import type { MusicScore } from '../core/musicScore'
import {
  createBrowserMusicEngine,
  createNativeAudioBackend,
  type AudioBackend,
} from './createBrowserMusicEngine'

const score: MusicScore = {
  id: 'forest-theme',
  bpm: 60,
  beatsPerLoop: 4,
  masterGain: 0.45,
  fadeSeconds: 0.25,
  notes: [
    { beat: 0, durationBeats: 1, midi: 60, velocity: 0.5, instrument: 'pluck' },
    { beat: 2, durationBeats: 1, midi: 67, velocity: 0.35, instrument: 'flute' },
  ],
}

function createFakeBackend() {
  return {
    getCurrentTime: vi.fn(() => 10),
    resume: vi.fn(() => Promise.resolve()),
    schedule: vi.fn(),
    fadeMasterTo: vi.fn(),
    stopScheduled: vi.fn(),
    close: vi.fn(() => Promise.resolve()),
  } satisfies AudioBackend
}

function createTimerHarness() {
  const callbacks = new Map<number, () => void>()
  let nextTimerId = 1

  const setTimer = vi.fn((callback: () => void, _delayMs: number) => {
    const timerId = nextTimerId
    nextTimerId += 1
    callbacks.set(timerId, callback)
    return timerId
  })
  const clearTimer = vi.fn((timerId: number) => {
    callbacks.delete(timerId)
  })
  const runTimer = (timerId: number) => {
    const callback = callbacks.get(timerId)
    if (callback === undefined) throw new Error(`定时器 ${timerId} 不存在或已取消`)
    callbacks.delete(timerId)
    callback()
  }

  return { callbacks, setTimer, clearTimer, runTimer }
}

function timerIdFromCall(
  setTimer: ReturnType<typeof createTimerHarness>['setTimer'],
  callIndex: number,
): number {
  const timerId: unknown = setTimer.mock.results[callIndex]?.value
  if (typeof timerId !== 'number') throw new Error(`第 ${callIndex + 1} 次定时器调用未返回编号`)
  return timerId
}

function invocationOrder(callOrders: readonly number[], label: string): number {
  const order = callOrders[0]
  if (order === undefined) throw new Error(`${label} 未发生调用`)
  return order
}

function createHarness(backend = createFakeBackend()) {
  const timers = createTimerHarness()
  const createBackend = vi.fn(() => backend)
  const engine = createBrowserMusicEngine({ createBackend, ...timers })

  return { backend, createBackend, engine, ...timers }
}

describe('browser music engine lifecycle', () => {
  it('delays backend creation until unlock and reuses it on later unlocks', async () => {
    const { backend, createBackend, engine } = createHarness()

    engine.play(score)
    expect(createBackend).not.toHaveBeenCalled()

    await expect(engine.unlock()).resolves.toEqual({ ok: true })
    await expect(engine.unlock()).resolves.toEqual({ ok: true })

    expect(createBackend).toHaveBeenCalledTimes(1)
    expect(backend.resume).toHaveBeenCalledTimes(2)
  })

  it('starts the first loop at current time plus lookahead and creates its timer', async () => {
    const { backend, engine, setTimer } = createHarness()
    await engine.unlock()

    engine.play(score)

    expect(backend.fadeMasterTo).toHaveBeenCalledWith(score.masterGain, score.fadeSeconds)
    expect(backend.schedule).toHaveBeenCalledTimes(2)
    expect(backend.schedule.mock.calls[0]?.[0].startTime).toBe(10.05)
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(setTimer.mock.calls[0]?.[1]).toBeCloseTo(3950)
  })

  it('keeps a fixed loop timeline when a timer callback runs early', async () => {
    const { backend, engine, runTimer, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    const firstTimerId = timerIdFromCall(setTimer, 0)

    runTimer(firstTimerId)

    expect(backend.schedule.mock.calls[2]?.[0].startTime).toBe(14.05)
  })

  it('keeps loop and pause cleanup timers as separate lifecycles', async () => {
    const { backend, callbacks, clearTimer, engine, runTimer, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    const loopTimerId = timerIdFromCall(setTimer, 0)

    engine.pause(score.fadeSeconds)
    const cleanupTimerId = timerIdFromCall(setTimer, 1)

    expect(cleanupTimerId).not.toBe(loopTimerId)
    expect(clearTimer).toHaveBeenCalledWith(loopTimerId)
    expect(callbacks.has(loopTimerId)).toBe(false)
    expect(callbacks.has(cleanupTimerId)).toBe(true)
    expect(backend.fadeMasterTo).toHaveBeenLastCalledWith(0, score.fadeSeconds)
    expect(backend.stopScheduled).not.toHaveBeenCalled()

    runTimer(cleanupTimerId)
    expect(backend.stopScheduled).toHaveBeenCalledTimes(1)
  })

  it('clears pause cleanup and old nodes before fading in and scheduling replay', async () => {
    const { backend, callbacks, clearTimer, engine, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    engine.pause(score.fadeSeconds)
    const cleanupTimerId = timerIdFromCall(setTimer, 1)
    clearTimer.mockClear()
    backend.stopScheduled.mockClear()
    backend.fadeMasterTo.mockClear()
    backend.schedule.mockClear()

    engine.play(score)

    expect(clearTimer).toHaveBeenCalledWith(cleanupTimerId)
    expect(callbacks.has(cleanupTimerId)).toBe(false)
    expect(backend.stopScheduled).toHaveBeenCalledTimes(1)
    expect(backend.fadeMasterTo).toHaveBeenCalledWith(score.masterGain, score.fadeSeconds)
    expect(backend.schedule).toHaveBeenCalledTimes(score.notes.length)
    expect(invocationOrder(clearTimer.mock.invocationCallOrder, 'clearTimer')).toBeLessThan(
      invocationOrder(backend.stopScheduled.mock.invocationCallOrder, 'stopScheduled'),
    )
    expect(invocationOrder(backend.stopScheduled.mock.invocationCallOrder, 'stopScheduled')).toBeLessThan(
      invocationOrder(backend.fadeMasterTo.mock.invocationCallOrder, 'fadeMasterTo'),
    )
    expect(invocationOrder(backend.fadeMasterTo.mock.invocationCallOrder, 'fadeMasterTo')).toBeLessThan(
      invocationOrder(backend.schedule.mock.invocationCallOrder, 'schedule'),
    )
  })

  it('does not restart an already playing score with an active loop timer', async () => {
    const { backend, engine, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)

    engine.play({ ...score, masterGain: 0.8 })

    expect(backend.schedule).toHaveBeenCalledTimes(score.notes.length)
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(backend.stopScheduled).not.toHaveBeenCalled()
  })

  it('clears the old loop before stopping, fading in, and scheduling a new score id', async () => {
    const { backend, clearTimer, engine, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    const loopTimerId = timerIdFromCall(setTimer, 0)
    clearTimer.mockClear()
    backend.stopScheduled.mockClear()
    backend.fadeMasterTo.mockClear()
    backend.schedule.mockClear()

    engine.play({ ...score, id: 'river-theme' })

    expect(clearTimer).toHaveBeenCalledWith(loopTimerId)
    expect(backend.stopScheduled).toHaveBeenCalledTimes(1)
    expect(backend.fadeMasterTo).toHaveBeenCalledWith(score.masterGain, score.fadeSeconds)
    expect(backend.schedule).toHaveBeenCalledTimes(score.notes.length)
    expect(invocationOrder(clearTimer.mock.invocationCallOrder, 'clearTimer')).toBeLessThan(
      invocationOrder(backend.stopScheduled.mock.invocationCallOrder, 'stopScheduled'),
    )
    expect(invocationOrder(backend.stopScheduled.mock.invocationCallOrder, 'stopScheduled')).toBeLessThan(
      invocationOrder(backend.fadeMasterTo.mock.invocationCallOrder, 'fadeMasterTo'),
    )
    expect(invocationOrder(backend.fadeMasterTo.mock.invocationCallOrder, 'fadeMasterTo')).toBeLessThan(
      invocationOrder(backend.schedule.mock.invocationCallOrder, 'schedule'),
    )
  })

  it('rejects invalid scores before scheduling', async () => {
    const { backend, engine, setTimer } = createHarness()
    await engine.unlock()

    expect(() => engine.play({ ...score, bpm: 0 })).toThrow('速度必须大于 0')
    expect(backend.schedule).not.toHaveBeenCalled()
    expect(setTimer).not.toHaveBeenCalled()
  })

  it('returns blocked for NotAllowedError and retries the same backend', async () => {
    const backend = createFakeBackend()
    backend.resume
      .mockRejectedValueOnce(new DOMException('user gesture required', 'NotAllowedError'))
      .mockResolvedValueOnce(undefined)
    const { createBackend, engine } = createHarness(backend)

    await expect(engine.unlock()).resolves.toEqual({ ok: false, kind: 'blocked' })
    await expect(engine.unlock()).resolves.toEqual({ ok: true })
    expect(createBackend).toHaveBeenCalledTimes(1)
  })

  it('returns unavailable when backend creation fails normally', async () => {
    const timers = createTimerHarness()
    const createBackend = vi.fn((): AudioBackend => {
      throw new Error('audio device failed')
    })
    const engine = createBrowserMusicEngine({ createBackend, ...timers })

    await expect(engine.unlock()).resolves.toEqual({ ok: false, kind: 'unavailable' })
  })

  it('makes repeated stop calls idempotent', async () => {
    const { backend, callbacks, clearTimer, engine, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    const loopTimerId = timerIdFromCall(setTimer, 0)
    clearTimer.mockClear()
    backend.stopScheduled.mockClear()
    backend.fadeMasterTo.mockClear()

    engine.stop()
    engine.stop()

    expect(callbacks).toHaveLength(0)
    expect(clearTimer).toHaveBeenCalledTimes(1)
    expect(clearTimer).toHaveBeenCalledWith(loopTimerId)
    expect(backend.stopScheduled).toHaveBeenCalledTimes(1)
    expect(backend.fadeMasterTo).toHaveBeenCalledTimes(1)
    expect(backend.fadeMasterTo).toHaveBeenCalledWith(0, 0)
  })

  it('makes repeated dispose calls idempotent', async () => {
    const { backend, callbacks, clearTimer, engine, setTimer } = createHarness()
    await engine.unlock()
    engine.play(score)
    const loopTimerId = timerIdFromCall(setTimer, 0)
    clearTimer.mockClear()
    backend.stopScheduled.mockClear()
    backend.close.mockClear()

    engine.dispose()
    engine.dispose()

    expect(callbacks).toHaveLength(0)
    expect(clearTimer).toHaveBeenCalledTimes(1)
    expect(clearTimer).toHaveBeenCalledWith(loopTimerId)
    expect(backend.stopScheduled).toHaveBeenCalledTimes(1)
    expect(backend.close).toHaveBeenCalledTimes(1)
    await expect(engine.unlock()).resolves.toEqual({ ok: false, kind: 'unavailable' })
  })

  it('still closes and releases the backend when stopping during dispose throws', async () => {
    const backend = createFakeBackend()
    backend.stopScheduled.mockImplementation(() => {
      throw new Error('unexpected stop failure')
    })
    const { createBackend, engine } = createHarness(backend)
    await engine.unlock()

    expect(() => engine.dispose()).toThrow('unexpected stop failure')
    expect(backend.close).toHaveBeenCalledTimes(1)
    await expect(engine.unlock()).resolves.toEqual({ ok: false, kind: 'unavailable' })
    expect(createBackend).toHaveBeenCalledTimes(1)
  })

  it('returns unavailable after disposal without creating a backend', async () => {
    const { createBackend, engine } = createHarness()

    engine.dispose()

    await expect(engine.unlock()).resolves.toEqual({ ok: false, kind: 'unavailable' })
    expect(createBackend).not.toHaveBeenCalled()
  })
})

function createAudioParam(value = 1) {
  return {
    value,
    cancelScheduledValues: vi.fn(),
    setValueAtTime: vi.fn(),
    linearRampToValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  }
}

function createNativeBackendHarness() {
  const destination = {}
  const gains: Array<{
    gain: ReturnType<typeof createAudioParam>
    connect: ReturnType<typeof vi.fn>
  }> = []
  const oscillators: Array<{
    type: OscillatorType
    frequency: ReturnType<typeof createAudioParam>
    connect: ReturnType<typeof vi.fn>
    start: ReturnType<typeof vi.fn>
    stop: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
  }> = []
  const filters: Array<{
    type: BiquadFilterType
    frequency: ReturnType<typeof createAudioParam>
    connect: ReturnType<typeof vi.fn>
  }> = []
  const resume = vi.fn(() => Promise.resolve())
  const close = vi.fn(() => Promise.resolve())

  const context = {
    currentTime: 10,
    state: 'running' as AudioContextState,
    destination,
    resume,
    close,
    createGain: vi.fn(() => {
      const node = { gain: createAudioParam(), connect: vi.fn() }
      gains.push(node)
      return node
    }),
    createOscillator: vi.fn(() => {
      const node = {
        type: 'sine' as OscillatorType,
        frequency: createAudioParam(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
        addEventListener: vi.fn(),
      }
      oscillators.push(node)
      return node
    }),
    createBiquadFilter: vi.fn(() => {
      const node = {
        type: 'lowpass' as BiquadFilterType,
        frequency: createAudioParam(),
        connect: vi.fn(),
      }
      filters.push(node)
      return node
    }),
  }
  const backend = createNativeAudioBackend(context as unknown as AudioContext)

  return { backend, close, context, destination, filters, gains, oscillators, resume }
}

describe('native audio backend', () => {
  it('creates a muted connected master and schedules each instrument shape', () => {
    const { backend, destination, filters, gains, oscillators } = createNativeBackendHarness()

    backend.schedule({
      startTime: 12,
      durationSeconds: 2,
      frequency: 440,
      velocity: 0.5,
      instrument: 'pluck',
    })
    backend.schedule({
      startTime: 14,
      durationSeconds: 0.3,
      frequency: 660,
      velocity: 0.4,
      instrument: 'flute',
    })
    backend.schedule({
      startTime: 15,
      durationSeconds: 0.6,
      frequency: 110,
      velocity: 0.3,
      instrument: 'drone',
    })

    expect(gains[0]?.gain.value).toBe(0)
    expect(gains[0]?.connect).toHaveBeenCalledWith(destination)
    expect(oscillators.map((source) => source.type)).toEqual(['triangle', 'sine', 'sine'])
    expect(oscillators[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(440, 12)
    expect(oscillators[0]?.stop.mock.calls[0]?.[0]).toBeCloseTo(13.45)
    expect(filters).toHaveLength(1)
    expect(filters[0]?.frequency.setValueAtTime).toHaveBeenCalledWith(1800, 14)
    expect(oscillators[1]?.stop.mock.calls[0]?.[0]).toBeCloseTo(14.35)
    expect(oscillators[2]?.stop.mock.calls[0]?.[0]).toBeCloseTo(15.65)
  })

  it('fades the master from its current value at the audio clock time', () => {
    const { backend, gains } = createNativeBackendHarness()
    const masterGain = gains[0]?.gain
    if (masterGain === undefined) throw new Error('未创建主音量节点')
    masterGain.value = 0.3

    backend.fadeMasterTo(0.8, 0.5)

    expect(masterGain.cancelScheduledValues).toHaveBeenCalledWith(10)
    expect(masterGain.setValueAtTime).toHaveBeenCalledWith(0.3, 10)
    expect(masterGain.linearRampToValueAtTime).toHaveBeenCalledWith(0.8, 10.5)
  })

  it('stops every source, ignores only InvalidStateError, and rethrows the first unknown error', () => {
    const { backend, oscillators } = createNativeBackendHarness()
    for (const instrument of ['pluck', 'flute', 'drone'] as const) {
      backend.schedule({
        startTime: 12,
        durationSeconds: 1,
        frequency: 440,
        velocity: 0.5,
        instrument,
      })
    }
    const firstSource = oscillators[0]
    const secondSource = oscillators[1]
    const thirdSource = oscillators[2]
    if (firstSource === undefined || secondSource === undefined || thirdSource === undefined) {
      throw new Error('未创建完整音源集合')
    }
    firstSource.stop.mockImplementation(() => {
      throw new Error('first stop failure')
    })
    secondSource.stop.mockImplementation(() => {
      throw new DOMException('already stopped', 'InvalidStateError')
    })

    expect(() => backend.stopScheduled()).toThrow('first stop failure')
    expect(firstSource.stop).toHaveBeenCalledTimes(2)
    expect(secondSource.stop).toHaveBeenCalledTimes(2)
    expect(thirdSource.stop).toHaveBeenCalledTimes(2)

    backend.stopScheduled()
    expect(firstSource.stop).toHaveBeenCalledTimes(2)
    expect(secondSource.stop).toHaveBeenCalledTimes(2)
    expect(thirdSource.stop).toHaveBeenCalledTimes(2)
  })

  it('resumes and closes the context only while it remains open', async () => {
    const { backend, close, context, resume } = createNativeBackendHarness()

    await backend.resume()
    await backend.close()
    context.state = 'closed'
    await backend.close()

    expect(resume).toHaveBeenCalledTimes(1)
    expect(close).toHaveBeenCalledTimes(1)
  })
})
