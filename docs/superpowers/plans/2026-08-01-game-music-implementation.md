# Reusable Game Music Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为小游戏合集增加可复用的 Web Audio 背景音乐系统，并为五子棋提供默认开启、可离线、低音量的中国风循环音乐。

**Architecture:** 在 `src/audio/` 建立与游戏规则解耦的曲目模型、浏览器音乐引擎、偏好存储和 React Provider。五子棋只提供 `gomokuMusicScore` 并通过 `useGameMusic` 声明棋局是否处于播放状态；应用级 Provider 统一处理首次交互解锁、开关持久化、页面可见性、淡入淡出和错误提示。

**Tech Stack:** React 19、TypeScript、Web Audio API、Vitest、React Testing Library、Playwright、Vite PWA/Workbox。

---

## 文件结构与固定接口

新增文件：

```text
src/audio/core/musicScore.ts
src/audio/core/musicScore.test.ts
src/audio/core/musicScheduler.ts
src/audio/core/musicScheduler.test.ts
src/audio/core/MusicEnginePort.ts
src/audio/browser/createBrowserMusicEngine.ts
src/audio/browser/createBrowserMusicEngine.test.ts
src/audio/storage/musicPreferenceStorage.ts
src/audio/storage/musicPreferenceStorage.test.ts
src/audio/AudioProvider.tsx
src/audio/AudioProvider.test.tsx
src/audio/MusicToggle.tsx
src/audio/MusicToggle.test.tsx
src/audio/useGameMusic.ts
src/games/gomoku/audio/gomokuMusicScore.ts
src/games/gomoku/audio/gomokuMusicScore.test.ts
```

修改文件：

```text
src/app/App.tsx
src/app/App.test.tsx
src/app/app.css
src/games/gomoku/GomokuPage.tsx
src/games/gomoku/GomokuPage.test.tsx
src/games/gomoku/gomoku.css
e2e/gomoku.spec.ts
e2e/offline.spec.ts
README.md
```

后续任务使用以下固定公开接口，不自行创建五子棋专属播放引擎：

```ts
export interface MusicScore {
  readonly id: string
  readonly bpm: number
  readonly beatsPerLoop: number
  readonly masterGain: number
  readonly fadeSeconds: number
  readonly notes: readonly MusicNote[]
}

export interface MusicEnginePort {
  unlock(): Promise<MusicUnlockResult>
  play(score: MusicScore): void
  pause(fadeSeconds: number): void
  stop(): void
  dispose(): void
}

export interface AudioController {
  readonly enabled: boolean
  readonly availability: 'locked' | 'ready' | 'unavailable'
  readonly notice: string | null
  toggle(): void
  dismissNotice(): void
  setGameMusic(score: MusicScore, active: boolean): () => void
}
```

所有后续 npm 命令都显式通过 `/opt/homebrew/bin/npm` 和固定 `PATH` 使用项目要求的 Node 22，具体命令在每个步骤中完整列出。

### Task 1: 定义曲目模型和确定性调度

**Files:**
- Create: `src/audio/core/musicScore.ts`
- Create: `src/audio/core/musicScore.test.ts`
- Create: `src/audio/core/musicScheduler.ts`
- Create: `src/audio/core/musicScheduler.test.ts`

- [ ] **Step 1: 写曲目校验失败测试**

创建 `src/audio/core/musicScore.test.ts`：

```ts
import { describe, expect, it } from 'vitest'

import {
  loopDurationSeconds,
  midiToFrequency,
  validateMusicScore,
  type MusicScore,
} from './musicScore'

const validNote = {
  beat: 0,
  durationBeats: 1,
  midi: 62,
  velocity: 0.5,
  instrument: 'pluck',
} as const

const validScore: MusicScore = {
  id: 'test-score',
  bpm: 60,
  beatsPerLoop: 8,
  masterGain: 0.05,
  fadeSeconds: 0.8,
  notes: [
    validNote,
    { beat: 4, durationBeats: 4, midi: 50, velocity: 0.2, instrument: 'drone' },
  ],
}

describe('musicScore', () => {
  it('接受完整且位于循环范围内的曲目', () => {
    expect(validateMusicScore(validScore)).toEqual({ ok: true })
    expect(loopDurationSeconds(validScore)).toBe(8)
    expect(midiToFrequency(69)).toBe(440)
  })

  it.each([
    [{ ...validScore, id: '' }, '曲目标识不能为空'],
    [{ ...validScore, bpm: 0 }, '速度必须大于 0'],
    [{ ...validScore, beatsPerLoop: 0 }, '循环拍数必须大于 0'],
    [{ ...validScore, masterGain: 1.1 }, '总音量必须位于 0 到 1 之间'],
    [{ ...validScore, fadeSeconds: -1 }, '淡入淡出时间不能为负数'],
    [{ ...validScore, notes: [{ ...validNote, beat: 8 }] }, '音符必须位于循环范围内'],
    [{ ...validScore, notes: [{ ...validNote, durationBeats: 0 }] }, '音符时值必须大于 0'],
    [{ ...validScore, notes: [{ ...validNote, beat: 7.5, durationBeats: 1 }] }, '音符不能越过循环末尾'],
    [{ ...validScore, notes: [{ ...validNote, velocity: 2 }] }, '音符力度必须位于 0 到 1 之间'],
    [{ ...validScore, notes: [{ ...validNote, midi: 128 }] }, 'MIDI 音高必须位于 0 到 127 之间'],
  ] as const)('拒绝无效曲目', (score, message) => {
    expect(validateMusicScore(score)).toEqual({ ok: false, message })
  })
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/core/musicScore.test.ts
```

Expected: FAIL，提示 `./musicScore` 不存在。

- [ ] **Step 3: 实现曲目模型和严格校验**

创建 `src/audio/core/musicScore.ts`：

```ts
export type MusicInstrument = 'pluck' | 'flute' | 'drone'

export interface MusicNote {
  readonly beat: number
  readonly durationBeats: number
  readonly midi: number
  readonly velocity: number
  readonly instrument: MusicInstrument
}

export interface MusicScore {
  readonly id: string
  readonly bpm: number
  readonly beatsPerLoop: number
  readonly masterGain: number
  readonly fadeSeconds: number
  readonly notes: readonly MusicNote[]
}

export type MusicScoreValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string }

export function validateMusicScore(score: MusicScore): MusicScoreValidation {
  if (score.id.trim() === '') return { ok: false, message: '曲目标识不能为空' }
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) {
    return { ok: false, message: '速度必须大于 0' }
  }
  if (!Number.isFinite(score.beatsPerLoop) || score.beatsPerLoop <= 0) {
    return { ok: false, message: '循环拍数必须大于 0' }
  }
  if (!Number.isFinite(score.masterGain) || score.masterGain < 0 || score.masterGain > 1) {
    return { ok: false, message: '总音量必须位于 0 到 1 之间' }
  }
  if (!Number.isFinite(score.fadeSeconds) || score.fadeSeconds < 0) {
    return { ok: false, message: '淡入淡出时间不能为负数' }
  }

  for (const note of score.notes) {
    if (!Number.isFinite(note.beat) || note.beat < 0 || note.beat >= score.beatsPerLoop) {
      return { ok: false, message: '音符必须位于循环范围内' }
    }
    if (!Number.isFinite(note.durationBeats) || note.durationBeats <= 0) {
      return { ok: false, message: '音符时值必须大于 0' }
    }
    if (note.beat + note.durationBeats > score.beatsPerLoop) {
      return { ok: false, message: '音符不能越过循环末尾' }
    }
    if (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
      return { ok: false, message: '音符力度必须位于 0 到 1 之间' }
    }
    if (!Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) {
      return { ok: false, message: 'MIDI 音高必须位于 0 到 127 之间' }
    }
  }

  return { ok: true }
}

export function loopDurationSeconds(score: MusicScore): number {
  return score.beatsPerLoop * 60 / score.bpm
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}
```

- [ ] **Step 4: 写调度器失败测试**

创建 `src/audio/core/musicScheduler.test.ts`：

```ts
import { describe, expect, it } from 'vitest'

import { buildLoopSchedule } from './musicScheduler'
import { type MusicScore } from './musicScore'

const score: MusicScore = {
  id: 'schedule-test',
  bpm: 60,
  beatsPerLoop: 8,
  masterGain: 0.05,
  fadeSeconds: 0.5,
  notes: [
    { beat: 3, durationBeats: 2, midi: 66, velocity: 0.4, instrument: 'flute' },
    { beat: 0, durationBeats: 1, midi: 62, velocity: 0.5, instrument: 'pluck' },
  ],
}

describe('buildLoopSchedule', () => {
  it('把拍数映射为指定 AudioContext 起点的绝对秒数', () => {
    const schedule = buildLoopSchedule(score, 10)

    expect(schedule[0]).toMatchObject({
      startTime: 10,
      durationSeconds: 1,
      velocity: 0.5,
      instrument: 'pluck',
    })
    expect(schedule[0]?.frequency).toBeCloseTo(293.6648, 3)
    expect(schedule[1]).toMatchObject({
      startTime: 13,
      durationSeconds: 2,
      velocity: 0.4,
      instrument: 'flute',
    })
    expect(schedule[1]?.frequency).toBeCloseTo(369.9944, 3)
  })

  it('不修改原始音符', () => {
    const before = structuredClone(score.notes)
    buildLoopSchedule(score, 0)
    expect(score.notes).toEqual(before)
  })
})
```

- [ ] **Step 5: 实现纯调度函数**

创建 `src/audio/core/musicScheduler.ts`：

```ts
import { midiToFrequency, type MusicInstrument, type MusicScore } from './musicScore'

export interface ScheduledMusicNote {
  readonly startTime: number
  readonly durationSeconds: number
  readonly frequency: number
  readonly velocity: number
  readonly instrument: MusicInstrument
}

export function buildLoopSchedule(
  score: MusicScore,
  loopStartTime: number,
): readonly ScheduledMusicNote[] {
  const secondsPerBeat = 60 / score.bpm

  return score.notes
    .map((note) => ({
      startTime: loopStartTime + note.beat * secondsPerBeat,
      durationSeconds: note.durationBeats * secondsPerBeat,
      frequency: midiToFrequency(note.midi),
      velocity: note.velocity,
      instrument: note.instrument,
    }))
    .sort((left, right) => left.startTime - right.startTime)
}
```

- [ ] **Step 6: 运行两组测试**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/core/musicScore.test.ts src/audio/core/musicScheduler.test.ts
```

Expected: 两个测试文件全部通过。

- [ ] **Step 7: 提交并 push**

```bash
git add src/audio/core/musicScore.ts src/audio/core/musicScore.test.ts src/audio/core/musicScheduler.ts src/audio/core/musicScheduler.test.ts
git commit -m "feat: define reusable music score model"
git push origin main
```

### Task 2: 实现可注入的浏览器音乐引擎

**Files:**
- Create: `src/audio/core/MusicEnginePort.ts`
- Create: `src/audio/browser/createBrowserMusicEngine.ts`
- Create: `src/audio/browser/createBrowserMusicEngine.test.ts`

- [ ] **Step 1: 定义音乐引擎端口**

创建 `src/audio/core/MusicEnginePort.ts`：

```ts
import { type MusicScore } from './musicScore'

export type MusicUnlockResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'blocked' | 'unavailable' }

export interface MusicEnginePort {
  unlock(): Promise<MusicUnlockResult>
  play(score: MusicScore): void
  pause(fadeSeconds: number): void
  stop(): void
  dispose(): void
}

export type MusicEngineFactory = () => MusicEnginePort | null
```

- [ ] **Step 2: 写引擎生命周期失败测试**

创建 `src/audio/browser/createBrowserMusicEngine.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'

import { type MusicScore } from '../core/musicScore'
import { createBrowserMusicEngine, type AudioBackend } from './createBrowserMusicEngine'

const score: MusicScore = {
  id: 'engine-test',
  bpm: 60,
  beatsPerLoop: 4,
  masterGain: 0.05,
  fadeSeconds: 0.5,
  notes: [{ beat: 0, durationBeats: 1, midi: 62, velocity: 0.5, instrument: 'pluck' }],
}

function fakeBackend(): AudioBackend {
  return {
    getCurrentTime: vi.fn(() => 10),
    resume: vi.fn().mockResolvedValue(undefined),
    schedule: vi.fn(),
    fadeMasterTo: vi.fn(),
    stopScheduled: vi.fn(),
    close: vi.fn().mockResolvedValue(undefined),
  }
}

describe('createBrowserMusicEngine', () => {
  it('只在 unlock 时创建后端，并用固定时间轴无漂移地调度循环', async () => {
    const backend = fakeBackend()
    const callbacks = new Map<number, () => void>()
    const setTimer = vi.fn((callback: () => void) => {
      callbacks.set(17, callback)
      return 17
    })
    const createBackend = vi.fn(() => backend)
    const engine = createBrowserMusicEngine({
      createBackend,
      setTimer,
      clearTimer: vi.fn(),
    })

    expect(createBackend).not.toHaveBeenCalled()
    expect(await engine.unlock()).toEqual({ ok: true })
    engine.play(score)

    expect(createBackend).toHaveBeenCalledOnce()
    expect(backend.schedule).toHaveBeenCalledWith(expect.objectContaining({ startTime: 10.05 }))
    expect(backend.fadeMasterTo).toHaveBeenCalledWith(0.05, 0.5)
    expect(setTimer).toHaveBeenCalledOnce()

    callbacks.get(17)?.()
    expect(backend.schedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTime: 14.05 }),
    )
  })

  it('pause 先淡出再清理，stop 和 dispose 幂等清理', async () => {
    const backend = fakeBackend()
    const callbacks = new Map<number, () => void>()
    let nextTimerId = 20
    const setTimer = vi.fn((callback: () => void) => {
      nextTimerId += 1
      callbacks.set(nextTimerId, callback)
      return nextTimerId
    })
    const clearTimer = vi.fn()
    const engine = createBrowserMusicEngine({
      createBackend: () => backend,
      setTimer,
      clearTimer,
    })

    await engine.unlock()
    engine.play(score)
    vi.mocked(backend.stopScheduled).mockClear()
    engine.pause(0.8)

    expect(backend.fadeMasterTo).toHaveBeenCalledWith(0, 0.8)
    expect(backend.stopScheduled).not.toHaveBeenCalled()
    const cleanupTimerId = nextTimerId
    callbacks.get(cleanupTimerId)?.()
    expect(backend.stopScheduled).toHaveBeenCalledOnce()

    engine.stop()
    engine.dispose()
    engine.dispose()

    expect(clearTimer).toHaveBeenCalled()
    expect(backend.close).toHaveBeenCalledOnce()
  })

  it('切换曲目时立即清理旧节点再调度新曲目', async () => {
    const backend = fakeBackend()
    const engine = createBrowserMusicEngine({
      createBackend: () => backend,
      setTimer: () => 1,
      clearTimer: vi.fn(),
    })
    await engine.unlock()
    engine.play(score)
    vi.mocked(backend.stopScheduled).mockClear()

    const nextScore: MusicScore = { ...score, id: 'engine-test-next' }
    engine.play(nextScore)

    expect(backend.stopScheduled).toHaveBeenCalledOnce()
    expect(backend.schedule).toHaveBeenLastCalledWith(
      expect.objectContaining({ startTime: 10.05 }),
    )
  })

  it('把 NotAllowedError 归类为可重试 blocked', async () => {
    const backend = fakeBackend()
    vi.mocked(backend.resume).mockRejectedValue(new DOMException('blocked', 'NotAllowedError'))
    const engine = createBrowserMusicEngine({
      createBackend: () => backend,
      setTimer: () => 1,
      clearTimer: vi.fn(),
    })

    expect(await engine.unlock()).toEqual({ ok: false, kind: 'blocked' })
  })

  it('把后端创建失败归类为 unavailable', async () => {
    const engine = createBrowserMusicEngine({
      createBackend: () => { throw new Error('audio failed') },
      setTimer: () => 1,
      clearTimer: vi.fn(),
    })

    expect(await engine.unlock()).toEqual({ ok: false, kind: 'unavailable' })
  })
})
```

- [ ] **Step 3: 运行测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/browser/createBrowserMusicEngine.test.ts
```

Expected: FAIL，提示浏览器音乐引擎不存在。

- [ ] **Step 4: 实现循环引擎**

创建 `src/audio/browser/createBrowserMusicEngine.ts`，先实现可注入调度核心：

```ts
import { buildLoopSchedule, type ScheduledMusicNote } from '../core/musicScheduler'
import { loopDurationSeconds, validateMusicScore, type MusicScore } from '../core/musicScore'
import { type MusicEnginePort, type MusicUnlockResult } from '../core/MusicEnginePort'

export interface AudioBackend {
  getCurrentTime(): number
  resume(): Promise<void>
  schedule(note: ScheduledMusicNote): void
  fadeMasterTo(value: number, durationSeconds: number): void
  stopScheduled(): void
  close(): Promise<void>
}

interface BrowserMusicEngineDependencies {
  readonly createBackend: () => AudioBackend
  readonly setTimer: (callback: () => void, delayMs: number) => number
  readonly clearTimer: (timerId: number) => void
}

export function createBrowserMusicEngine(
  dependencies: BrowserMusicEngineDependencies,
): MusicEnginePort {
  let backend: AudioBackend | null = null
  let loopTimerId: number | null = null
  let cleanupTimerId: number | null = null
  let currentScoreId: string | null = null
  let disposed = false

  function cancelTimers(): void {
    if (loopTimerId !== null) {
      dependencies.clearTimer(loopTimerId)
      loopTimerId = null
    }
    if (cleanupTimerId !== null) {
      dependencies.clearTimer(cleanupTimerId)
      cleanupTimerId = null
    }
  }

  function clearImmediately(): void {
    cancelTimers()
    backend?.stopScheduled()
  }

  function scheduleLoop(score: MusicScore, requestedStartTime: number): void {
    if (backend === null || disposed) return
    const startTime = Math.max(requestedStartTime, backend.getCurrentTime() + 0.05)
    for (const note of buildLoopSchedule(score, startTime)) backend.schedule(note)
    const nextStartTime = startTime + loopDurationSeconds(score)
    loopTimerId = dependencies.setTimer(
      () => {
        loopTimerId = null
        scheduleLoop(score, nextStartTime)
      },
      Math.max(0, (nextStartTime - backend.getCurrentTime() - 0.1) * 1000),
    )
  }

  async function unlock(): Promise<MusicUnlockResult> {
    if (disposed) return { ok: false, kind: 'unavailable' }

    try {
      backend ??= dependencies.createBackend()
      await backend.resume()
      return { ok: true }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotAllowedError') {
        return { ok: false, kind: 'blocked' }
      }
      return { ok: false, kind: 'unavailable' }
    }
  }

  return {
    unlock,
    play(score) {
      if (backend === null || disposed) return
      const validation = validateMusicScore(score)
      if (!validation.ok) throw new Error(validation.message)
      if (currentScoreId === score.id && loopTimerId !== null) return
      clearImmediately()
      currentScoreId = score.id
      backend.fadeMasterTo(score.masterGain, score.fadeSeconds)
      scheduleLoop(score, backend.getCurrentTime() + 0.05)
    },
    pause(fadeSeconds) {
      if (backend === null || disposed) return
      cancelTimers()
      backend.fadeMasterTo(0, fadeSeconds)
      currentScoreId = null
      cleanupTimerId = dependencies.setTimer(() => {
        cleanupTimerId = null
        backend?.stopScheduled()
      }, fadeSeconds * 1000)
    },
    stop() {
      clearImmediately()
      currentScoreId = null
      backend?.fadeMasterTo(0, 0)
    },
    dispose() {
      if (disposed) return
      disposed = true
      clearImmediately()
      currentScoreId = null
      void backend?.close()
      backend = null
    },
  }
}
```

- [ ] **Step 5: 实现原生 Web Audio 后端**

在同一文件追加以下原生后端。包络时间全部受音符时值约束，避免短音符生成逆序的 `AudioParam` 调度：

```ts
function schedulePluck(
  context: AudioContext,
  destination: AudioNode,
  note: ScheduledMusicNote,
  sources: Set<OscillatorNode>,
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const noteEnd = note.startTime + Math.min(note.durationSeconds, 1.4)
  const attackEnd = note.startTime + Math.min(0.02, note.durationSeconds / 2)
  oscillator.type = 'triangle'
  oscillator.frequency.setValueAtTime(note.frequency, note.startTime)
  gain.gain.setValueAtTime(0.0001, note.startTime)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, note.velocity), attackEnd)
  gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd)
  oscillator.connect(gain).connect(destination)
  sources.add(oscillator)
  oscillator.addEventListener('ended', () => sources.delete(oscillator), { once: true })
  oscillator.start(note.startTime)
  oscillator.stop(noteEnd + 0.05)
}

function scheduleFlute(
  context: AudioContext,
  destination: AudioNode,
  note: ScheduledMusicNote,
  sources: Set<OscillatorNode>,
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const filter = context.createBiquadFilter()
  const noteEnd = note.startTime + note.durationSeconds
  const attackEnd = note.startTime + Math.min(0.35, note.durationSeconds / 3)
  const releaseStart = Math.max(attackEnd, noteEnd - Math.min(0.5, note.durationSeconds / 3))
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(note.frequency, note.startTime)
  filter.type = 'lowpass'
  filter.frequency.setValueAtTime(1800, note.startTime)
  gain.gain.setValueAtTime(0.0001, note.startTime)
  gain.gain.linearRampToValueAtTime(note.velocity, attackEnd)
  gain.gain.setValueAtTime(note.velocity, releaseStart)
  gain.gain.linearRampToValueAtTime(0.0001, noteEnd)
  oscillator.connect(filter).connect(gain).connect(destination)
  sources.add(oscillator)
  oscillator.addEventListener('ended', () => sources.delete(oscillator), { once: true })
  oscillator.start(note.startTime)
  oscillator.stop(noteEnd + 0.05)
}

function scheduleDrone(
  context: AudioContext,
  destination: AudioNode,
  note: ScheduledMusicNote,
  sources: Set<OscillatorNode>,
): void {
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  const noteEnd = note.startTime + note.durationSeconds
  const attackEnd = note.startTime + Math.min(1, note.durationSeconds / 3)
  const releaseStart = Math.max(attackEnd, noteEnd - Math.min(1, note.durationSeconds / 3))
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(note.frequency, note.startTime)
  gain.gain.setValueAtTime(0.0001, note.startTime)
  gain.gain.linearRampToValueAtTime(note.velocity, attackEnd)
  gain.gain.setValueAtTime(note.velocity, releaseStart)
  gain.gain.linearRampToValueAtTime(0.0001, noteEnd)
  oscillator.connect(gain).connect(destination)
  sources.add(oscillator)
  oscillator.addEventListener('ended', () => sources.delete(oscillator), { once: true })
  oscillator.start(note.startTime)
  oscillator.stop(noteEnd + 0.05)
}

export function createNativeAudioBackend(context: AudioContext): AudioBackend {
  const master = context.createGain()
  const sources = new Set<OscillatorNode>()
  master.gain.value = 0
  master.connect(context.destination)

  function stopScheduled(): void {
    for (const source of sources) {
      try {
        source.stop()
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'InvalidStateError')) throw error
      }
    }
    sources.clear()
  }

  return {
    getCurrentTime: () => context.currentTime,
    resume: () => context.resume(),
    schedule(note) {
      if (note.instrument === 'pluck') schedulePluck(context, master, note, sources)
      else if (note.instrument === 'flute') scheduleFlute(context, master, note, sources)
      else scheduleDrone(context, master, note, sources)
    },
    fadeMasterTo(value, durationSeconds) {
      const now = context.currentTime
      master.gain.cancelScheduledValues(now)
      master.gain.setValueAtTime(master.gain.value, now)
      master.gain.linearRampToValueAtTime(value, now + durationSeconds)
    },
    stopScheduled,
    async close() {
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
```

- [ ] **Step 6: 运行引擎测试、类型检查**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/browser/createBrowserMusicEngine.test.ts src/audio/core/musicScheduler.test.ts
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run typecheck
```

Expected: 测试通过，类型检查退出码为 0。

- [ ] **Step 7: 提交并 push**

```bash
git add src/audio/core/MusicEnginePort.ts src/audio/browser/createBrowserMusicEngine.ts src/audio/browser/createBrowserMusicEngine.test.ts
git commit -m "feat: add browser music engine"
git push origin main
```

### Task 3: 实现全局音乐偏好存储

**Files:**
- Create: `src/audio/storage/musicPreferenceStorage.ts`
- Create: `src/audio/storage/musicPreferenceStorage.test.ts`

- [ ] **Step 1: 写存储边界失败测试**

创建 `src/audio/storage/musicPreferenceStorage.test.ts`：

```ts
import { describe, expect, it, vi } from 'vitest'

import { createMusicPreferenceStorage } from './musicPreferenceStorage'

function memoryStorage(initial: string | null = null): Storage {
  let value = initial
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => { value = next }),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    get length() { return value === null ? 0 : 1 },
  }
}

describe('musicPreferenceStorage', () => {
  it('无记录时默认开启', () => {
    expect(createMusicPreferenceStorage(memoryStorage()).load())
      .toEqual({ kind: 'loaded', enabled: true })
  })

  it('读取并保存版本化布尔值', () => {
    const storage = memoryStorage('{"version":1,"enabled":false}')
    const preferences = createMusicPreferenceStorage(storage)

    expect(preferences.load()).toEqual({ kind: 'loaded', enabled: false })
    expect(preferences.save(true)).toEqual({ ok: true })
    expect(storage.setItem).toHaveBeenCalledWith(
      'games.audio.music.v1',
      '{"version":1,"enabled":true}',
    )
  })

  it('拒绝无效结构', () => {
    expect(createMusicPreferenceStorage(memoryStorage('{}')).load())
      .toEqual({ kind: 'invalid' })
    expect(createMusicPreferenceStorage(memoryStorage('{broken')).load())
      .toEqual({ kind: 'invalid' })
  })

  it('把浏览器拒绝访问转换为 unavailable', () => {
    const storage = memoryStorage()
    vi.mocked(storage.getItem).mockImplementation(() => { throw new DOMException('blocked') })

    expect(createMusicPreferenceStorage(storage).load())
      .toEqual({ kind: 'unavailable' })
  })
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/storage/musicPreferenceStorage.test.ts
```

Expected: FAIL，提示偏好存储模块不存在。

- [ ] **Step 3: 实现严格存储适配器**

创建 `src/audio/storage/musicPreferenceStorage.ts`：

```ts
const MUSIC_PREFERENCE_KEY = 'games.audio.music.v1'

export type MusicPreferenceLoadResult =
  | { readonly kind: 'loaded'; readonly enabled: boolean }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }

export interface MusicPreferenceStoragePort {
  load(): MusicPreferenceLoadResult
  save(enabled: boolean): { readonly ok: boolean }
}

function isStoredPreference(value: unknown): value is { version: 1; enabled: boolean } {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return record.version === 1 && typeof record.enabled === 'boolean'
}

export function createMusicPreferenceStorage(storage: Storage): MusicPreferenceStoragePort {
  return {
    load() {
      let raw: string | null
      try {
        raw = storage.getItem(MUSIC_PREFERENCE_KEY)
      } catch {
        return { kind: 'unavailable' }
      }
      if (raw === null) return { kind: 'loaded', enabled: true }

      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch {
        return { kind: 'invalid' }
      }
      return isStoredPreference(parsed)
        ? { kind: 'loaded', enabled: parsed.enabled }
        : { kind: 'invalid' }
    },
    save(enabled) {
      try {
        storage.setItem(MUSIC_PREFERENCE_KEY, JSON.stringify({ version: 1, enabled }))
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }
}

export function createBrowserMusicPreferenceStorage(): MusicPreferenceStoragePort {
  try {
    return createMusicPreferenceStorage(window.localStorage)
  } catch {
    return {
      load: () => ({ kind: 'unavailable' }),
      save: () => ({ ok: false }),
    }
  }
}
```

这里的 `catch` 只包围浏览器存储访问或 JSON 解析边界：访问失败映射为 `unavailable`，损坏 JSON 映射为 `invalid`，不捕获 Provider 或棋局逻辑错误。浏览器 `localStorage` getter 本身被拒绝时，返回的端口也会持续报告不可用，而不是让应用初始化失败。

- [ ] **Step 4: 运行存储测试**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/storage/musicPreferenceStorage.test.ts
```

Expected: 该测试文件全部通过。

- [ ] **Step 5: 提交并 push**

```bash
git add src/audio/storage/musicPreferenceStorage.ts src/audio/storage/musicPreferenceStorage.test.ts
git commit -m "feat: persist global music preference"
git push origin main
```

### Task 4: 建立应用级 AudioProvider 和 useGameMusic

**Files:**
- Create: `src/audio/AudioProvider.tsx`
- Create: `src/audio/AudioProvider.test.tsx`
- Create: `src/audio/useGameMusic.ts`
- Modify: `src/app/App.tsx:1-28`
- Modify: `src/app/App.test.tsx:17-23`

- [ ] **Step 1: 写 Provider 状态机失败测试**

创建 `src/audio/AudioProvider.test.tsx`，定义 Fake：

```tsx
import { StrictMode } from 'react'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { AudioProvider, useAudioController } from './AudioProvider'
import { type MusicEnginePort } from './core/MusicEnginePort'
import { type MusicScore } from './core/musicScore'
import { type MusicPreferenceStoragePort } from './storage/musicPreferenceStorage'
import { useGameMusic } from './useGameMusic'

const score: MusicScore = {
  id: 'provider-test',
  bpm: 60,
  beatsPerLoop: 4,
  masterGain: 0.05,
  fadeSeconds: 0.5,
  notes: [{ beat: 0, durationBeats: 1, midi: 62, velocity: 0.5, instrument: 'pluck' }],
}

function fakeEngine(): MusicEnginePort {
  return {
    unlock: vi.fn().mockResolvedValue({ ok: true }),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  }
}

function Harness({
  active = true,
  score: activeScore = score,
}: {
  readonly active?: boolean
  readonly score?: MusicScore
}) {
  const audio = useAudioController()
  useGameMusic(activeScore, active)
  return (
    <>
      <button type="button" onClick={audio.toggle}>{audio.enabled ? '关闭音乐' : '开启音乐'}</button>
      <output>{audio.availability}</output>
      {audio.notice ? <p role="status">{audio.notice}</p> : null}
    </>
  )
}

function renderProvider(
  engine: MusicEnginePort,
  storage: MusicPreferenceStoragePort = {
    load: () => ({ kind: 'loaded', enabled: true }),
    save: () => ({ ok: true }),
  },
) {
  return render(
    <AudioProvider engineFactory={() => engine} storage={storage}>
      <Harness />
    </AudioProvider>,
  )
}
```

在同文件加入以下完整测试：

```tsx
it('默认开启但可信用户操作前不解锁，操作后播放活动曲目', async () => {
  const engine = fakeEngine()
  renderProvider(engine)

  expect(engine.unlock).not.toHaveBeenCalled()

  document.dispatchEvent(new Event('pointerdown'))
  await waitFor(() => expect(engine.unlock).toHaveBeenCalledOnce())
  await waitFor(() => expect(engine.play).toHaveBeenCalledWith(score))
  expect(screen.getByText('ready')).toBeInTheDocument()
})

it('blocked 保持 locked 并允许下一次操作重试', async () => {
  const engine = fakeEngine()
  vi.mocked(engine.unlock)
    .mockResolvedValueOnce({ ok: false, kind: 'blocked' })
    .mockResolvedValueOnce({ ok: true })
  renderProvider(engine)

  document.dispatchEvent(new Event('pointerdown'))
  await waitFor(() => expect(engine.unlock).toHaveBeenCalledTimes(1))
  expect(screen.getByText('locked')).toBeInTheDocument()

  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  await waitFor(() => expect(engine.unlock).toHaveBeenCalledTimes(2))
  expect(screen.getByText('ready')).toBeInTheDocument()
})

it('并发用户操作只共享一次解锁，并且 StrictMode 下只创建一个引擎', async () => {
  const unlockGate: { resolve?: (result: { readonly ok: true }) => void } = {}
  const engine = fakeEngine()
  vi.mocked(engine.unlock).mockImplementation(() => new Promise((resolve) => {
    unlockGate.resolve = resolve
  }))
  const engineFactory = vi.fn(() => engine)

  render(
    <StrictMode>
      <AudioProvider engineFactory={engineFactory} storage={{
        load: () => ({ kind: 'loaded', enabled: true }),
        save: () => ({ ok: true }),
      }}>
        <Harness />
      </AudioProvider>
    </StrictMode>,
  )

  document.dispatchEvent(new Event('pointerdown'))
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }))
  expect(engineFactory).toHaveBeenCalledOnce()
  expect(engine.unlock).toHaveBeenCalledOnce()

  await act(async () => {
    unlockGate.resolve?.({ ok: true })
    await Promise.resolve()
  })
  await waitFor(() => expect(engine.play).toHaveBeenCalledWith(score))
})

it('unavailable 显示明确提示', async () => {
  const engine = fakeEngine()
  vi.mocked(engine.unlock).mockResolvedValue({ ok: false, kind: 'unavailable' })
  renderProvider(engine)

  document.dispatchEvent(new Event('pointerdown'))

  expect(await screen.findByText('unavailable')).toBeInTheDocument()
  expect(screen.getByRole('status')).toHaveTextContent('当前浏览器无法播放音乐')
})

it('保存失败时保留内存开关并提示刷新后可能恢复', async () => {
  const user = userEvent.setup()
  const engine = fakeEngine()
  renderProvider(engine, {
    load: () => ({ kind: 'loaded', enabled: true }),
    save: () => ({ ok: false }),
  })

  await user.click(screen.getByRole('button', { name: '关闭音乐' }))

  expect(screen.getByRole('button', { name: '开启音乐' })).toBeInTheDocument()
  expect(screen.getByRole('status'))
    .toHaveTextContent('无法保存音乐设置，刷新后可能恢复默认值。')
})

it('已保存关闭状态时不自动解锁，重新开启的点击负责解锁和播放', async () => {
  const user = userEvent.setup()
  const engine = fakeEngine()
  const save = vi.fn(() => ({ ok: true }))
  renderProvider(engine, {
    load: () => ({ kind: 'loaded', enabled: false }),
    save,
  })

  document.dispatchEvent(new Event('pointerdown'))
  expect(engine.unlock).not.toHaveBeenCalled()

  await user.click(screen.getByRole('button', { name: '开启音乐' }))
  await waitFor(() => expect(engine.unlock).toHaveBeenCalledOnce())
  await waitFor(() => expect(engine.play).toHaveBeenCalledWith(score))
  expect(save).toHaveBeenCalledWith(true)
})

it('隐藏页面暂停，恢复可见后继续活动曲目', async () => {
  const engine = fakeEngine()
  renderProvider(engine)
  document.dispatchEvent(new Event('pointerdown'))
  await waitFor(() => expect(engine.play).toHaveBeenCalledWith(score))

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(engine.pause).toHaveBeenCalledWith(score.fadeSeconds)

  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  act(() => document.dispatchEvent(new Event('visibilitychange')))
  expect(engine.play).toHaveBeenLastCalledWith(score)
})

it('切换曲目时继续复用同一引擎并播放新曲目', async () => {
  const nextScore: MusicScore = { ...score, id: 'provider-test-next' }
  const engine = fakeEngine()
  const view = renderProvider(engine)
  document.dispatchEvent(new Event('pointerdown'))
  await waitFor(() => expect(engine.play).toHaveBeenCalledWith(score))

  view.rerender(
    <AudioProvider engineFactory={() => engine} storage={{
      load: () => ({ kind: 'loaded', enabled: true }),
      save: () => ({ ok: true }),
    }}>
      <Harness score={nextScore} />
    </AudioProvider>,
  )

  await waitFor(() => expect(engine.play).toHaveBeenLastCalledWith(nextScore))
})

it('拒绝注册无效曲目并显示明确提示', async () => {
  const engine = fakeEngine()
  const invalidScore: MusicScore = { ...score, bpm: 0 }
  render(
    <AudioProvider engineFactory={() => engine} storage={{
      load: () => ({ kind: 'loaded', enabled: true }),
      save: () => ({ ok: true }),
    }}>
      <Harness score={invalidScore} />
    </AudioProvider>,
  )

  expect(await screen.findByRole('status'))
    .toHaveTextContent('曲目配置无效：速度必须大于 0')
  expect(engine.play).not.toHaveBeenCalled()
})

afterEach(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
  window.localStorage.clear()
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/AudioProvider.test.tsx
```

Expected: FAIL，提示 Provider 不存在。

- [ ] **Step 3: 实现 Provider 的明确状态流**

创建完整的 `src/audio/AudioProvider.tsx`。`unlockPromiseRef` 合并同一时刻的解锁请求；`storageRef` 避免普通重渲染重复创建存储适配器；清理 effect 负责 StrictMode 重放、路由卸载和异步解锁结束后的状态保护：

```tsx
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

import { createDefaultMusicEngine } from './browser/createBrowserMusicEngine'
import { type MusicEngineFactory, type MusicEnginePort } from './core/MusicEnginePort'
import { validateMusicScore, type MusicScore } from './core/musicScore'
import {
  createBrowserMusicPreferenceStorage,
  type MusicPreferenceStoragePort,
} from './storage/musicPreferenceStorage'

export interface AudioController {
  readonly enabled: boolean
  readonly availability: 'locked' | 'ready' | 'unavailable'
  readonly notice: string | null
  toggle(): void
  dismissNotice(): void
  setGameMusic(score: MusicScore, active: boolean): () => void
}

interface AudioState {
  readonly enabled: boolean
  readonly availability: AudioController['availability']
  readonly notice: string | null
}

interface MusicScene {
  readonly score: MusicScore
  readonly active: boolean
}

const AudioControllerContext = createContext<AudioController | null>(null)

function loadInitialState(storage: MusicPreferenceStoragePort): AudioState {
  const result = storage.load()
  if (result.kind === 'loaded') {
    return { enabled: result.enabled, availability: 'locked', notice: null }
  }
  if (result.kind === 'invalid') {
    return {
      enabled: true,
      availability: 'locked',
      notice: '音乐设置已失效，本次使用默认开启。',
    }
  }
  return {
    enabled: true,
    availability: 'locked',
    notice: '无法读取音乐设置，本次使用默认开启。',
  }
}

export function AudioProvider({
  children,
  engineFactory = createDefaultMusicEngine,
  storage,
}: {
  readonly children: ReactNode
  readonly engineFactory?: MusicEngineFactory
  readonly storage?: MusicPreferenceStoragePort
}) {
  const storageRef = useRef<MusicPreferenceStoragePort | null>(null)
  if (storageRef.current === null) {
    storageRef.current = storage ?? createBrowserMusicPreferenceStorage()
  }
  const preferenceStorage = storageRef.current
  const [state, setState] = useState<AudioState>(() => loadInitialState(preferenceStorage))
  const enabledRef = useRef(state.enabled)
  const [scene, setScene] = useState<MusicScene | null>(null)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')
  const engineRef = useRef<MusicEnginePort | null>(null)
  const unlockPromiseRef = useRef<Promise<void> | null>(null)
  const disposedRef = useRef(false)

  const ensureUnlocked = useCallback((): Promise<void> => {
    if (state.availability === 'unavailable') return Promise.resolve()
    if (unlockPromiseRef.current !== null) return unlockPromiseRef.current

    const pending = (async () => {
      const engine = engineRef.current ?? engineFactory()
      if (engine === null) {
        if (!disposedRef.current) {
          setState((current) => ({
            ...current,
            availability: 'unavailable',
            notice: '当前浏览器无法播放音乐。',
          }))
        }
        return
      }

      engineRef.current = engine
      const result = await engine.unlock()
      if (disposedRef.current) return
      if (result.ok) {
        setState((current) => ({ ...current, availability: 'ready' }))
      } else if (result.kind === 'unavailable') {
        setState((current) => ({
          ...current,
          availability: 'unavailable',
          notice: '当前浏览器无法播放音乐。',
        }))
      }
    })()

    unlockPromiseRef.current = pending
    const clearPending = () => {
      if (unlockPromiseRef.current === pending) unlockPromiseRef.current = null
    }
    void pending.then(clearPending, clearPending)
    return pending
  }, [engineFactory, state.availability])

  useEffect(() => {
    if (!state.enabled || state.availability !== 'locked') return
    const unlock = () => { void ensureUnlocked() }
    document.addEventListener('pointerdown', unlock, { capture: true })
    document.addEventListener('keydown', unlock, { capture: true })
    return () => {
      document.removeEventListener('pointerdown', unlock, { capture: true })
      document.removeEventListener('keydown', unlock, { capture: true })
    }
  }, [ensureUnlocked, state.availability, state.enabled])

  useEffect(() => {
    const updateVisibility = () => setPageVisible(document.visibilityState !== 'hidden')
    document.addEventListener('visibilitychange', updateVisibility)
    return () => document.removeEventListener('visibilitychange', updateVisibility)
  }, [])

  useEffect(() => {
    const engine = engineRef.current
    if (engine === null || state.availability !== 'ready') return
    if (!state.enabled || !pageVisible) {
      engine.pause(scene?.score.fadeSeconds ?? 0)
    } else if (scene === null) {
      engine.stop()
    } else if (scene.active) {
      engine.play(scene.score)
    } else {
      engine.pause(scene.score.fadeSeconds)
    }
  }, [pageVisible, scene, state.availability, state.enabled])

  useEffect(() => {
    disposedRef.current = false
    return () => {
      disposedRef.current = true
      engineRef.current?.stop()
      engineRef.current?.dispose()
      engineRef.current = null
      unlockPromiseRef.current = null
    }
  }, [])

  const toggle = useCallback(() => {
    const nextEnabled = !enabledRef.current
    enabledRef.current = nextEnabled
    setState((current) => ({ ...current, enabled: nextEnabled }))
    if (!preferenceStorage.save(nextEnabled).ok) {
      setState((current) => ({
        ...current,
        notice: '无法保存音乐设置，刷新后可能恢复默认值。',
      }))
    }
    if (nextEnabled) void ensureUnlocked()
  }, [ensureUnlocked, preferenceStorage])

  const dismissNotice = useCallback(() => {
    setState((current) => ({ ...current, notice: null }))
  }, [])

  const setGameMusic = useCallback((score: MusicScore, active: boolean) => {
    const validation = validateMusicScore(score)
    if (!validation.ok) {
      engineRef.current?.stop()
      setScene(null)
      setState((current) => ({
        ...current,
        notice: `曲目配置无效：${validation.message}`,
      }))
      return () => undefined
    }

    setScene({ score, active })
    return () => {
      setScene((current) => current?.score.id === score.id ? null : current)
    }
  }, [])

  const value = useMemo<AudioController>(() => ({
    enabled: state.enabled,
    availability: state.availability,
    notice: state.notice,
    toggle,
    dismissNotice,
    setGameMusic,
  }), [dismissNotice, setGameMusic, state, toggle])

  return (
    <AudioControllerContext.Provider value={value}>
      {children}
    </AudioControllerContext.Provider>
  )
}

export function useAudioController(): AudioController {
  const controller = useContext(AudioControllerContext)
  if (controller === null) throw new Error('useAudioController 必须在 AudioProvider 内使用')
  return controller
}
```

创建 `src/audio/useGameMusic.ts`：

```ts
import { useEffect } from 'react'

import { useAudioController } from './AudioProvider'
import { type MusicScore } from './core/musicScore'

export function useGameMusic(score: MusicScore, active: boolean): void {
  const { setGameMusic } = useAudioController()

  useEffect(
    () => setGameMusic(score, active),
    [active, score, setGameMusic],
  )
}
```

- [ ] **Step 4: 在 App 根部安装 Provider**

修改 `src/app/App.tsx`：

```tsx
import { AudioProvider } from '../audio/AudioProvider'

function AppContent() {
  const route = useHashRoute()
  const activeGame = gameCatalog.find((game) => game.path === route)
  const GamePage = activeGame ? gamePages[activeGame.id] : null

  return (
    <div className="app-shell">
      <div className="pwa-controls">
        <InstallPrompt />
        <UpdatePrompt />
      </div>
      {GamePage ? <GamePage /> : <GameCatalogPage />}
    </div>
  )
}

export function App() {
  return (
    <AudioProvider>
      <AppContent />
    </AudioProvider>
  )
}
```

在 `src/app/App.test.tsx` 的 `beforeEach` 增加 `window.localStorage.clear()`，现有断言保持严格不变。

- [ ] **Step 5: 运行 Provider 和 App 测试**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/AudioProvider.test.tsx src/app/App.test.tsx
```

Expected: Provider 测试和现有 App 测试全部通过，无未处理 Promise。

- [ ] **Step 6: 提交并 push**

```bash
git add src/audio/AudioProvider.tsx src/audio/AudioProvider.test.tsx src/audio/useGameMusic.ts src/app/App.tsx src/app/App.test.tsx
git commit -m "feat: add shared game audio provider"
git push origin main
```

### Task 5: 增加共享音乐开关

**Files:**
- Create: `src/audio/MusicToggle.tsx`
- Create: `src/audio/MusicToggle.test.tsx`
- Modify: `src/app/app.css:38-63`

- [ ] **Step 1: 写开关语义失败测试**

创建 `src/audio/MusicToggle.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { vi } from 'vitest'

import { AudioProvider } from './AudioProvider'
import { type MusicEnginePort } from './core/MusicEnginePort'
import { MusicToggle } from './MusicToggle'

function engine(unlock: MusicEnginePort['unlock'] = vi.fn().mockResolvedValue({ ok: true })): MusicEnginePort {
  return {
    unlock,
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(),
  }
}

it('展示可访问的音乐开关并保存关闭状态', async () => {
  const user = userEvent.setup()
  const save = vi.fn(() => ({ ok: true }))
  render(
    <AudioProvider engineFactory={() => engine()} storage={{
      load: () => ({ kind: 'loaded', enabled: true }),
      save,
    }}>
      <MusicToggle />
    </AudioProvider>,
  )

  const toggle = screen.getByRole('button', { name: '关闭音乐' })
  expect(toggle).toHaveAttribute('aria-pressed', 'true')
  expect(toggle).toHaveTextContent('音乐开')

  await user.click(toggle)

  expect(screen.getByRole('button', { name: '开启音乐' }))
    .toHaveAttribute('aria-pressed', 'false')
  expect(save).toHaveBeenCalledWith(false)
})

it('音频永久不可用后禁用按钮', async () => {
  render(
    <AudioProvider
      engineFactory={() => engine(vi.fn().mockResolvedValue({ ok: false, kind: 'unavailable' }))}
      storage={{
        load: () => ({ kind: 'loaded', enabled: true }),
        save: () => ({ ok: true }),
      }}
    >
      <MusicToggle />
    </AudioProvider>,
  )

  document.dispatchEvent(new Event('pointerdown'))

  const toggle = await screen.findByRole('button', { name: '音乐不可用' })
  await waitFor(() => expect(toggle).toBeDisabled())
  expect(toggle).toHaveAccessibleDescription('当前浏览器无法播放音乐。')
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/MusicToggle.test.tsx
```

Expected: FAIL，提示 `MusicToggle` 不存在。

- [ ] **Step 3: 实现共享开关**

创建 `src/audio/MusicToggle.tsx`：

```tsx
import { useId } from 'react'

import { useAudioController } from './AudioProvider'

export function MusicToggle() {
  const { availability, enabled, toggle } = useAudioController()
  const unavailable = availability === 'unavailable'
  const unavailableDescriptionId = useId()

  return (
    <>
      <button
        aria-describedby={unavailable ? unavailableDescriptionId : undefined}
        aria-label={unavailable ? '音乐不可用' : enabled ? '关闭音乐' : '开启音乐'}
        aria-pressed={enabled}
        className="music-toggle"
        disabled={unavailable}
        type="button"
        onClick={toggle}
      >
        {unavailable ? '音乐不可用' : enabled ? '音乐开' : '音乐关'}
      </button>
      {unavailable ? (
        <span className="visually-hidden" id={unavailableDescriptionId}>
          当前浏览器无法播放音乐。
        </span>
      ) : null}
    </>
  )
}
```

- [ ] **Step 4: 添加共享样式**

在 `src/app/app.css` 增加：

```css
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  white-space: nowrap;
  border: 0;
  clip-path: inset(50%);
}

.music-toggle {
  min-width: 88px;
  min-height: 44px;
  padding: 8px 14px;
  color: #4b3019;
  background: rgb(255 249 237 / 88%);
  border: 1px solid #c5a374;
  border-radius: 999px;
  font-weight: 800;
  cursor: pointer;
}

.music-toggle[aria-pressed="false"] {
  color: #715b46;
  background: #eadfca;
}

.music-toggle:disabled {
  cursor: not-allowed;
  opacity: 0.62;
}
```

- [ ] **Step 5: 运行组件测试和类型检查**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/audio/MusicToggle.test.tsx src/audio/AudioProvider.test.tsx
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run typecheck
```

Expected: 测试通过，类型检查退出码为 0。

- [ ] **Step 6: 提交并 push**

```bash
git add src/audio/MusicToggle.tsx src/audio/MusicToggle.test.tsx src/app/app.css
git commit -m "feat: add reusable music toggle"
git push origin main
```

### Task 6: 配置并接入五子棋中国风曲目

**Files:**
- Create: `src/games/gomoku/audio/gomokuMusicScore.ts`
- Create: `src/games/gomoku/audio/gomokuMusicScore.test.ts`
- Modify: `src/games/gomoku/GomokuPage.tsx:1-106`
- Modify: `src/games/gomoku/GomokuPage.test.tsx`
- Modify: `src/games/gomoku/gomoku.css:1-48`

- [ ] **Step 1: 写曲目约束失败测试**

创建 `src/games/gomoku/audio/gomokuMusicScore.test.ts`：

```ts
import { expect, it } from 'vitest'

import { validateMusicScore } from '../../../audio/core/musicScore'
import { gomokuMusicScore } from './gomokuMusicScore'

it('提供低音量、32 秒且包含三种声部的中国风循环', () => {
  expect(validateMusicScore(gomokuMusicScore)).toEqual({ ok: true })
  expect(gomokuMusicScore.bpm).toBe(60)
  expect(gomokuMusicScore.beatsPerLoop).toBe(32)
  expect(gomokuMusicScore.masterGain).toBeLessThanOrEqual(0.06)
  expect(new Set(gomokuMusicScore.notes.map((note) => note.instrument)))
    .toEqual(new Set(['pluck', 'flute', 'drone']))
})
```

- [ ] **Step 2: 实现确定性曲目**

创建 `src/games/gomoku/audio/gomokuMusicScore.ts`：

```ts
import { type MusicScore } from '../../../audio/core/musicScore'

export const gomokuMusicScore: MusicScore = {
  id: 'gomoku-calm-chinese-v1',
  bpm: 60,
  beatsPerLoop: 32,
  masterGain: 0.055,
  fadeSeconds: 0.8,
  notes: [
    { beat: 0, durationBeats: 16, midi: 50, velocity: 0.16, instrument: 'drone' },
    { beat: 16, durationBeats: 16, midi: 45, velocity: 0.14, instrument: 'drone' },
    { beat: 0, durationBeats: 1.4, midi: 62, velocity: 0.42, instrument: 'pluck' },
    { beat: 3, durationBeats: 1.2, midi: 66, velocity: 0.34, instrument: 'pluck' },
    { beat: 6, durationBeats: 1.4, midi: 69, velocity: 0.38, instrument: 'pluck' },
    { beat: 10, durationBeats: 1.1, midi: 71, velocity: 0.30, instrument: 'pluck' },
    { beat: 13, durationBeats: 1.5, midi: 69, velocity: 0.36, instrument: 'pluck' },
    { beat: 16, durationBeats: 1.4, midi: 66, velocity: 0.40, instrument: 'pluck' },
    { beat: 19, durationBeats: 1.2, midi: 64, velocity: 0.32, instrument: 'pluck' },
    { beat: 22, durationBeats: 1.5, midi: 62, velocity: 0.38, instrument: 'pluck' },
    { beat: 26, durationBeats: 1.2, midi: 57, velocity: 0.28, instrument: 'pluck' },
    { beat: 29, durationBeats: 1.6, midi: 62, velocity: 0.40, instrument: 'pluck' },
    { beat: 8, durationBeats: 5, midi: 74, velocity: 0.16, instrument: 'flute' },
    { beat: 24, durationBeats: 5, midi: 71, velocity: 0.15, instrument: 'flute' },
  ],
}
```

- [ ] **Step 3: 为 GomokuPage 测试安装真实 Provider 边界**

在 `src/games/gomoku/GomokuPage.test.tsx` 引入 `AudioProvider`、`MusicEnginePort` 和 `gomokuMusicScore`，定义：

```tsx
const audioEngine: MusicEnginePort = {
  unlock: vi.fn().mockResolvedValue({ ok: true }),
  play: vi.fn(),
  pause: vi.fn(),
  stop: vi.fn(),
  dispose: vi.fn(),
}

function renderPage(storage: GomokuStoragePort = new FakeStorage({ kind: 'empty' })) {
  return render(
    <AudioProvider engineFactory={() => audioEngine} storage={{
      load: () => ({ kind: 'loaded', enabled: true }),
      save: () => ({ ok: true }),
    }}>
      <GomokuPage storage={storage} />
    </AudioProvider>,
  )
}
```

把现有直接渲染 `GomokuPage` 的用例改为通过同一包装器。产品代码不得加入静默 no-op Provider fallback。

新增：

```tsx
it('进行中播放，终局暂停，悔棋和再来一局后恢复五子棋音乐', async () => {
  const user = userEvent.setup()
  renderPage(new FakeStorage({ kind: 'loaded', state: blackNearWin() }))

  document.dispatchEvent(new Event('pointerdown'))
  await waitFor(() => expect(audioEngine.play).toHaveBeenCalledWith(gomokuMusicScore))

  await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
  expect(audioEngine.pause).toHaveBeenCalledWith(gomokuMusicScore.fadeSeconds)

  await user.click(screen.getByRole('button', { name: '悔棋一步' }))
  await waitFor(() => expect(audioEngine.play).toHaveBeenLastCalledWith(gomokuMusicScore))

  await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
  await user.click(screen.getByRole('button', { name: '再来一局' }))
  await waitFor(() => expect(audioEngine.play).toHaveBeenLastCalledWith(gomokuMusicScore))
})

it('音频不可用时仍可正常落子', async () => {
  const user = userEvent.setup()
  vi.mocked(audioEngine.unlock).mockResolvedValueOnce({ ok: false, kind: 'unavailable' })
  renderPage()

  document.dispatchEvent(new Event('pointerdown'))
  expect(await screen.findByText('当前浏览器无法播放音乐。')).toBeInTheDocument()

  await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
  expect(screen.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeInTheDocument()
})
```

在 `beforeEach` 清理所有 audioEngine mock。

- [ ] **Step 4: 运行定向测试并确认红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/games/gomoku/audio/gomokuMusicScore.test.ts src/games/gomoku/GomokuPage.test.tsx
```

Expected: 曲目测试可通过；页面生命周期测试因尚未接入音乐而失败。

- [ ] **Step 5: 接入 Hook、按钮和提示**

修改 `src/games/gomoku/GomokuPage.tsx`，增加：

```tsx
import { useAudioController } from '../../audio/AudioProvider'
import { MusicToggle } from '../../audio/MusicToggle'
import { useGameMusic } from '../../audio/useGameMusic'
import { gomokuMusicScore } from './audio/gomokuMusicScore'
```

在 controller 初始化后加入：

```tsx
const audio = useAudioController()
useGameMusic(gomokuMusicScore, controller.game.status === 'playing')
const visibleNotice = controller.notice ?? audio.notice

function dismissVisibleNotice(): void {
  if (controller.notice !== null) controller.dismissNotice()
  else audio.dismissNotice()
}
```

将标题替换为：

```tsx
<div className="game-title-row">
  <h1>五子棋</h1>
  <MusicToggle />
</div>
```

将 NoticeBanner 改为：

```tsx
<NoticeBanner message={visibleNotice} onDismiss={dismissVisibleNotice} />
```

现有 `game-content` 的 `inert` 和 `aria-hidden` 保持不变，使弹窗打开时音乐按钮和棋盘一起退出交互。

- [ ] **Step 6: 添加响应式标题布局**

在 `src/games/gomoku/gomoku.css` 加入：

```css
.gomoku-page .game-title-row {
  display: grid;
  grid-template-columns: minmax(88px, 1fr) auto minmax(88px, 1fr);
  align-items: center;
  gap: 10px;
}

.gomoku-page .game-title-row h1 {
  grid-column: 2;
}

.gomoku-page .game-title-row .music-toggle {
  grid-column: 3;
  justify-self: end;
}

@media (max-width: 480px) {
  .gomoku-page .game-title-row {
    grid-template-columns: 1fr;
  }

  .gomoku-page .game-title-row h1,
  .gomoku-page .game-title-row .music-toggle {
    grid-column: 1;
    justify-self: center;
  }
}
```

删除原 `.game-header h1` 中与新布局冲突的 margin，只保留颜色、字号和文字样式。

- [ ] **Step 7: 运行五子棋测试和类型检查**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test -- src/games/gomoku/audio/gomokuMusicScore.test.ts src/games/gomoku/GomokuPage.test.tsx src/games/gomoku/components/GomokuBoard.test.tsx
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run typecheck
```

Expected: 新增音乐测试和既有五子棋测试全部通过，类型检查退出码为 0。

- [ ] **Step 8: 提交并 push**

```bash
git add src/games/gomoku/audio/gomokuMusicScore.ts src/games/gomoku/audio/gomokuMusicScore.test.ts src/games/gomoku/GomokuPage.tsx src/games/gomoku/GomokuPage.test.tsx src/games/gomoku/gomoku.css
git commit -m "feat: add gomoku background music"
git push origin main
```

### Task 7: 增加浏览器、离线和文档验收

**Files:**
- Modify: `e2e/gomoku.spec.ts`
- Modify: `e2e/offline.spec.ts`
- Modify: `README.md`

- [ ] **Step 1: 添加音乐偏好 E2E**

在 `e2e/gomoku.spec.ts` 增加：

```ts
test('音乐开关跨刷新保存并可重新开启', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })

  await page.goto('/#/games/gomoku')

  const enabled = page.getByRole('button', { name: '关闭音乐' })
  await expect(enabled).toHaveAttribute('aria-pressed', 'true')
  await enabled.click()

  await expect(page.getByRole('button', { name: '开启音乐' }))
    .toHaveAttribute('aria-pressed', 'false')

  await page.reload()
  const disabled = page.getByRole('button', { name: '开启音乐' })
  await expect(disabled).toHaveAttribute('aria-pressed', 'false')

  await disabled.click()
  await expect(page.getByRole('button', { name: '关闭音乐' }))
    .toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('link', { name: '返回小游戏' }).click()
  await expect(page.getByRole('heading', { name: '小游戏' })).toBeVisible()
  expect(errors).toEqual([])
})
```

- [ ] **Step 2: 扩展离线测试**

在 `e2e/offline.spec.ts` 的离线 reload 后加入：

```ts
const musicToggle = page.getByRole('button', { name: '关闭音乐' })
await expect(musicToggle).toBeVisible()
await expect(musicToggle).toBeEnabled()
await musicToggle.click()
await expect(page.getByRole('button', { name: '开启音乐' }))
  .toHaveAttribute('aria-pressed', 'false')
```

不监听或断言扬声器输出；离线测试验证已缓存 JavaScript 能初始化音乐模块和更新控制状态。

- [ ] **Step 3: 更新 README**

在 README 功能列表增加：

```markdown
- 五子棋对局内置低音量中国风背景音乐，支持全局开关、偏好记忆和后台暂停。
- 音乐由 Web Audio API 本地合成，不请求第三方音频资源，离线时仍可使用。
```

- [ ] **Step 4: 运行定向 E2E**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run test:e2e -- --project=desktop-chromium --project=mobile-chromium e2e/gomoku.spec.ts e2e/offline.spec.ts
```

Expected: 新增音乐用例、现有完整对局和离线用例通过；仅已有明确浏览器能力条件允许 skip。

- [ ] **Step 5: 提交并 push**

```bash
git add e2e/gomoku.spec.ts e2e/offline.spec.ts README.md
git commit -m "test: cover game music browser flows"
git push origin main
```

### Task 8: 全量验证、部署路径检查和最终评审

**Files:**
- Modify only when verification exposes a root-cause defect.

- [ ] **Step 1: 运行全量单元测试**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test
```

Expected: 所有测试文件通过，失败数为 0。

- [ ] **Step 2: 运行类型检查和默认构建**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run typecheck
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run build
```

Expected: 两条命令退出码均为 0；Vite 输出 `dist/` 和 Service Worker。

- [ ] **Step 3: 验证 GitHub Pages 基础路径和预缓存**

Run:

```bash
DEPLOY_BASE=/games/ env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run build
rg -n '/games/assets/|/games/manifest.webmanifest' dist/index.html
rg -n 'assets/index-.*\.js|manifest.webmanifest' dist/sw.js
if rg -n 'https?://[^"[:space:]]+\.(mp3|ogg|wav)' dist; then exit 1; fi
```

Expected: 前两次 `rg` 均匹配；页面资源使用 `/games/` 前缀，`sw.js` 预缓存构建后的 JavaScript 和 manifest；最后的远程音乐检查无匹配且整体退出码为 0。

- [ ] **Step 4: 运行 Chromium E2E 全集**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run test:e2e -- --project=desktop-chromium --project=mobile-chromium
```

Expected: Chromium 项目全部通过，失败数为 0。

- [ ] **Step 5: 检查生产依赖和工作区**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm audit --omit=dev
git status --short --branch
```

Expected: 生产依赖漏洞数为 0；工作区只包含本任务预期变更或完全干净。

- [ ] **Step 6: 若验证发现根因缺陷，修复后单独提交并 push**

只有实际修改代码时执行：先用 `git status --short` 得到精确文件列表，逐个传给 `git add`，不得使用 `git add .`；随后提交 `fix: harden game music lifecycle` 并执行 `git push origin main`。如果修复属于某个既有任务，应优先使用该任务对应的更具体 commit message。

不得为了通过验证放宽断言、跳过测试、加入 `any`、非空断言、静默 fallback 或吞掉异常。若全部验证通过且没有代码变化，不创建空 commit；此前每个实现任务均已独立提交并 push。

- [ ] **Step 7: 请求代码评审**

评审必须确认：

- 首次可信用户操作前没有创建或播放音频。
- StrictMode、页面隐藏和路由切换后没有残留定时器、节点或重复上下文。
- 曲目、Provider 和存储不依赖五子棋规则类型。
- 音频或偏好失败有明确状态，棋局仍可完整进行。
- 音量上限、后台暂停、离线无远程请求和 `/games/` 路径满足设计。
- Critical 和 Important 问题为 0。
