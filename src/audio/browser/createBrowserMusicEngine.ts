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

function isNotAllowedError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'NotAllowedError'
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

  const scheduleLoop = (score: MusicScore, requestedStartTime: number) => {
    if (backend === null || disposed || !unlocked || currentScore?.id !== score.id) return

    const startTime = Math.max(
      requestedStartTime,
      backend.getCurrentTime() + schedulingLookaheadSeconds,
    )
    for (const note of buildLoopSchedule(score, startTime)) backend.schedule(note)

    const nextStart = startTime + loopDurationSeconds(score)
    const delayMs = Math.max(
      0,
      (nextStart - backend.getCurrentTime() - loopTimerLeadSeconds) * 1000,
    )
    loopTimerId = setTimer(() => {
      loopTimerId = null
      scheduleLoop(score, nextStart)
    }, delayMs)
  }

  return {
    async unlock(): Promise<MusicUnlockResult> {
      if (disposed) return { ok: false, kind: 'unavailable' }

      try {
        if (backend === null) backend = createBackend()
        await backend.resume()
        if (disposed) return { ok: false, kind: 'unavailable' }
        unlocked = true
        return { ok: true }
      } catch (error) {
        unlocked = false
        return isNotAllowedError(error)
          ? { ok: false, kind: 'blocked' }
          : { ok: false, kind: 'unavailable' }
      }
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
      scheduleLoop(score, backend.getCurrentTime() + schedulingLookaheadSeconds)
    },

    pause(fadeSeconds: number): void {
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

    dispose(): void {
      if (disposed) return
      disposed = true
      unlocked = false
      cancelLoopTimer()
      cancelCleanupTimer()
      currentScore = null

      const backendToDispose = backend
      backend = null
      if (backendToDispose === null) return

      try {
        backendToDispose.stopScheduled()
      } finally {
        void backendToDispose.close()
      }
    },
  }
}

function registerSource(sources: Set<OscillatorNode>, source: OscillatorNode): void {
  sources.add(source)
  source.addEventListener('ended', () => {
    sources.delete(source)
  }, { once: true })
}

function schedulePluck(
  context: AudioContext,
  master: GainNode,
  sources: Set<OscillatorNode>,
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
  registerSource(sources, source)
  source.start(note.startTime)
  source.stop(endTime + 0.05)
}

function scheduleSustainedTone(
  context: AudioContext,
  master: GainNode,
  sources: Set<OscillatorNode>,
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
  registerSource(sources, source)
  source.start(note.startTime)
  source.stop(endTime + 0.05)
}

export function createNativeAudioBackend(context: AudioContext): AudioBackend {
  const master = context.createGain()
  const sources = new Set<OscillatorNode>()
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
          schedulePluck(context, master, sources, note)
          return
        case 'flute': {
          const filter = context.createBiquadFilter()
          filter.type = 'lowpass'
          filter.frequency.setValueAtTime(1800, note.startTime)
          scheduleSustainedTone(context, master, sources, note, 0.35, filter)
          return
        }
        case 'drone':
          scheduleSustainedTone(context, master, sources, note, 1, null)
          return
        default: {
          const exhaustiveInstrument: never = note.instrument
          throw new Error(`Unsupported music instrument: ${exhaustiveInstrument}`)
        }
      }
    },

    fadeMasterTo(value: number, durationSeconds: number): void {
      const now = context.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(value, now + durationSeconds)
    },

    stopScheduled(): void {
      let firstError: unknown
      let hasUnexpectedError = false

      for (const source of sources) {
        try {
          source.stop()
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'InvalidStateError')) {
            if (!hasUnexpectedError) firstError = error
            hasUnexpectedError = true
          }
        } finally {
          sources.delete(source)
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
