import type { MusicScore } from './musicScore'

export type MusicUnlockResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly kind: 'blocked' | 'unavailable' }

export interface MusicEnginePort {
  unlock(): Promise<MusicUnlockResult>
  play(score: MusicScore): void
  pause(fadeSeconds: number): void
  stop(): void
  dispose(): Promise<void>
}

export type MusicEngineFactory = () => MusicEnginePort | null
