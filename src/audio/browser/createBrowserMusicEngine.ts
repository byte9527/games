import type { MusicEnginePort, MusicUnlockResult } from '../core/MusicEnginePort'
import {
  loopDurationSeconds,
  type MusicScore,
  validateMusicScore,
} from '../core/musicScore'
import { buildLoopSchedule, type ScheduledMusicNote } from '../core/musicScheduler'

const schedulingLookaheadSeconds = 0.05
const loopTimerLeadSeconds = 0.1
const minimumExponentialGain = 0.0001

export interface AudioBackend {
  getCurrentTime(): number
  resume(): Promise<void>
  schedule(note: ScheduledMusicNote): void
  fadeMasterTo(value: number, durationSeconds: number): void
  stopScheduled(): void
  close(): Promise<void>
}

export interface BrowserMusicEngineDependencies {
  readonly createBackend: () => AudioBackend
  readonly setTimer: (callback: () => void, delayMs: number) => number
  readonly clearTimer: (timerId: number) => void
}

function hasErrorName(error: unknown, expectedName: string): boolean {
  if ((typeof error !== 'object' || error === null) && typeof error !== 'function') return false

  try {
    return Reflect.get(error, 'name') === expectedName
  } catch {
    return false
  }
}

export function createBrowserMusicEngine({
  createBackend,
  setTimer,
  clearTimer,
}: BrowserMusicEngineDependencies): MusicEnginePort {
  let backend: AudioBackend | null = null
  let currentScore: MusicScore | null = null
  let loopTimerId: number | null = null
  let cleanupTimerId: number | null = null
  let unlockPromise: Promise<MusicUnlockResult> | null = null
  let disposalPromise: Promise<void> | null = null
  let unlocked = false
  let disposed = false

  const cancelLoopTimer = () => {
    if (loopTimerId === null) return
    clearTimer(loopTimerId)
    loopTimerId = null
  }

  const cancelCleanupTimer = () => {
    if (cleanupTimerId === null) return
    clearTimer(cleanupTimerId)
    cleanupTimerId = null
  }

  const scheduleLoop = (
    score: MusicScore,
    requestedStartTime: number,
    preserveTimeGrid: boolean,
  ) => {
    if (backend === null || disposed || !unlocked || currentScore?.id !== score.id) return

    const currentTime = backend.getCurrentTime()
    const earliestStartTime = currentTime + schedulingLookaheadSeconds
    const durationSeconds = loopDurationSeconds(score)
    const skippedLoops = preserveTimeGrid && requestedStartTime < earliestStartTime
      ? Math.ceil((earliestStartTime - requestedStartTime) / durationSeconds)
      : 0
    const startTime = preserveTimeGrid
      ? requestedStartTime + skippedLoops * durationSeconds
      : Math.max(requestedStartTime, earliestStartTime)
    for (const note of buildLoopSchedule(score, startTime)) backend.schedule(note)

    const nextStart = startTime + durationSeconds
    const delayMs = Math.max(
      0,
      (nextStart - backend.getCurrentTime() - loopTimerLeadSeconds) * 1000,
    )
    loopTimerId = setTimer(() => {
      loopTimerId = null
      scheduleLoop(score, nextStart, true)
    }, delayMs)
  }

  const performUnlock = async (): Promise<MusicUnlockResult> => {
    if (disposed) return { ok: false, kind: 'unavailable' }

    try {
      if (backend === null) backend = createBackend()
      await backend.resume()
      if (disposed) return { ok: false, kind: 'unavailable' }
      unlocked = true
      return { ok: true }
    } catch (error) {
      unlocked = false
      if (disposed) return { ok: false, kind: 'unavailable' }
      return hasErrorName(error, 'NotAllowedError')
        ? { ok: false, kind: 'blocked' }
        : { ok: false, kind: 'unavailable' }
    }
  }

  const disposeBackend = async (backendToDispose: AudioBackend | null): Promise<void> => {
    if (backendToDispose === null) return

    let stopError: unknown
    let closeError: unknown
    let stopFailed = false
    let closeFailed = false

    try {
      backendToDispose.stopScheduled()
    } catch (error) {
      stopError = error
      stopFailed = true
    }

    try {
      await backendToDispose.close()
    } catch (error) {
      closeError = error
      closeFailed = true
    }

    if (stopFailed && closeFailed) {
      throw new AggregateError([stopError, closeError], '音乐后端停止和关闭均失败')
    }
    if (stopFailed) throw stopError
    if (closeFailed) throw closeError
  }

  return {
    unlock(): Promise<MusicUnlockResult> {
      if (disposed) return Promise.resolve({ ok: false, kind: 'unavailable' })
      if (unlockPromise !== null) return unlockPromise

      const pendingUnlock = performUnlock()
      unlockPromise = pendingUnlock
      void pendingUnlock.then(
        () => {
          if (unlockPromise === pendingUnlock) unlockPromise = null
        },
        () => {
          if (unlockPromise === pendingUnlock) unlockPromise = null
        },
      )
      return pendingUnlock
    },

    play(score: MusicScore): void {
      if (backend === null || disposed || !unlocked) return

      const validation = validateMusicScore(score)
      if (!validation.ok) throw new Error(`无效曲目：${validation.message}`)
      if (currentScore?.id === score.id && loopTimerId !== null) return

      const needsScheduledNodeCleanup =
        currentScore !== null || loopTimerId !== null || cleanupTimerId !== null
      cancelLoopTimer()
      cancelCleanupTimer()
      if (needsScheduledNodeCleanup) backend.stopScheduled()

      currentScore = score
      backend.fadeMasterTo(score.masterGain, score.fadeSeconds)
      scheduleLoop(score, backend.getCurrentTime() + schedulingLookaheadSeconds, false)
    },

    pause(fadeSeconds: number): void {
      if (!Number.isFinite(fadeSeconds) || fadeSeconds < 0) {
        throw new Error('淡出时间必须是有限的非负数')
      }
      if (backend === null || disposed || !unlocked) return

      cancelLoopTimer()
      cancelCleanupTimer()
      backend.fadeMasterTo(0, fadeSeconds)
      currentScore = null
      cleanupTimerId = setTimer(() => {
        cleanupTimerId = null
        if (backend !== null && !disposed) backend.stopScheduled()
      }, fadeSeconds * 1000)
    },

    stop(): void {
      if (backend === null || disposed) return
      if (currentScore === null && loopTimerId === null && cleanupTimerId === null) return

      cancelLoopTimer()
      cancelCleanupTimer()
      currentScore = null
      try {
        backend.stopScheduled()
      } finally {
        backend.fadeMasterTo(0, 0)
      }
    },

    dispose(): Promise<void> {
      if (disposalPromise !== null) return disposalPromise
      disposed = true
      unlocked = false
      cancelLoopTimer()
      cancelCleanupTimer()
      currentScore = null

      const backendToDispose = backend
      backend = null
      disposalPromise = disposeBackend(backendToDispose)
      return disposalPromise
    },
  }
}

interface AudioVoice {
  readonly source: OscillatorNode
  readonly envelope: GainNode
  readonly filter: BiquadFilterNode | null
  cleaned: boolean
}

function cleanupVoice(voices: Set<AudioVoice>, voice: AudioVoice): void {
  if (voice.cleaned) return
  voice.cleaned = true
  voices.delete(voice)

  let firstError: unknown
  let cleanupFailed = false
  for (const node of [voice.source, voice.envelope, voice.filter]) {
    if (node === null) continue
    try {
      node.disconnect()
    } catch (error) {
      if (!cleanupFailed) firstError = error
      cleanupFailed = true
    }
  }

  if (cleanupFailed) throw firstError
}

function registerVoice(
  voices: Set<AudioVoice>,
  source: OscillatorNode,
  envelope: GainNode,
  filter: BiquadFilterNode | null,
): void {
  const voice: AudioVoice = { source, envelope, filter, cleaned: false }
  voices.add(voice)
  source.addEventListener('ended', () => {
    cleanupVoice(voices, voice)
  }, { once: true })
}

function schedulePluck(
  context: AudioContext,
  master: GainNode,
  voices: Set<AudioVoice>,
  note: ScheduledMusicNote,
): void {
  const source = context.createOscillator()
  const envelope = context.createGain()
  const attackDuration = Math.min(0.02, note.durationSeconds / 2)
  const endTime = note.startTime + Math.min(note.durationSeconds, 1.4)

  source.type = 'triangle'
  source.frequency.setValueAtTime(note.frequency, note.startTime)
  envelope.gain.setValueAtTime(minimumExponentialGain, note.startTime)
  envelope.gain.exponentialRampToValueAtTime(
    Math.max(minimumExponentialGain, note.velocity),
    note.startTime + attackDuration,
  )
  envelope.gain.exponentialRampToValueAtTime(minimumExponentialGain, endTime)
  source.connect(envelope)
  envelope.connect(master)
  registerVoice(voices, source, envelope, null)
  source.start(note.startTime)
  source.stop(endTime + 0.05)
}

function scheduleSustainedTone(
  context: AudioContext,
  master: GainNode,
  voices: Set<AudioVoice>,
  note: ScheduledMusicNote,
  attackLimitSeconds: number,
  filter: BiquadFilterNode | null,
): void {
  const source = context.createOscillator()
  const envelope = context.createGain()
  const attackDuration = Math.min(attackLimitSeconds, note.durationSeconds / 3)
  const releaseDuration = Math.min(attackLimitSeconds, note.durationSeconds / 3)
  const attackEndTime = note.startTime + attackDuration
  const endTime = note.startTime + note.durationSeconds
  const releaseStartTime = Math.max(attackEndTime, endTime - releaseDuration)

  source.type = 'sine'
  source.frequency.setValueAtTime(note.frequency, note.startTime)
  envelope.gain.setValueAtTime(0, note.startTime)
  envelope.gain.linearRampToValueAtTime(note.velocity, attackEndTime)
  envelope.gain.setValueAtTime(note.velocity, releaseStartTime)
  envelope.gain.linearRampToValueAtTime(0, endTime)
  source.connect(envelope)
  if (filter === null) {
    envelope.connect(master)
  } else {
    envelope.connect(filter)
    filter.connect(master)
  }
  registerVoice(voices, source, envelope, filter)
  source.start(note.startTime)
  source.stop(endTime + 0.05)
}

export function createNativeAudioBackend(context: AudioContext): AudioBackend {
  const master = context.createGain()
  const voices = new Set<AudioVoice>()
  master.gain.value = 0
  master.connect(context.destination)

  return {
    getCurrentTime(): number {
      return context.currentTime
    },

    async resume(): Promise<void> {
      await context.resume()
    },

    schedule(note: ScheduledMusicNote): void {
      switch (note.instrument) {
        case 'pluck':
          schedulePluck(context, master, voices, note)
          return
        case 'flute': {
          const filter = context.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(1800, note.startTime)
          scheduleSustainedTone(context, master, voices, note, 0.35, filter)
          return
        }
        case 'drone':
          scheduleSustainedTone(context, master, voices, note, 1, null)
          return
        default: {
          const exhaustiveInstrument: never = note.instrument
          throw new Error(`Unsupported music instrument: ${exhaustiveInstrument}`)
        }
      }
    },

    fadeMasterTo(value: number, durationSeconds: number): void {
      const now = context.currentTime
      master.gain.cancelAndHoldAtTime(now)
      if (durationSeconds === 0) {
        master.gain.setValueAtTime(value, now)
      } else {
        master.gain.linearRampToValueAtTime(value, now + durationSeconds)
      }
    },

    stopScheduled(): void {
      let firstError: unknown
      let hasUnexpectedError = false

      for (const voice of voices) {
        try {
          voice.source.stop()
        } catch (error) {
          if (!hasErrorName(error, 'InvalidStateError')) {
            if (!hasUnexpectedError) firstError = error
            hasUnexpectedError = true
          }
        } finally {
          try {
            cleanupVoice(voices, voice)
          } catch (error) {
            if (!hasUnexpectedError) firstError = error
            hasUnexpectedError = true
          }
        }
      }

      if (hasUnexpectedError) throw firstError
    },

    async close(): Promise<void> {
      if (context.state !== 'closed') await context.close()
    },
  }
}

export function createDefaultMusicEngine(): MusicEnginePort | null {
  const AudioContextConstructor = window.AudioContext
  if (AudioContextConstructor === undefined) return null

  return createBrowserMusicEngine({
    createBackend: () => createNativeAudioBackend(new AudioContextConstructor()),
    setTimer: (callback, delayMs) => window.setTimeout(callback, delayMs),
    clearTimer: (timerId) => window.clearTimeout(timerId),
  })
}
