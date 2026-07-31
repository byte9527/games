import { type GameState } from '../core/types'
import { decodeStoredGame, encodeStoredGame } from './schema'

export const STORAGE_KEY = 'games:gomoku:active:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }

export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' }

export interface GomokuStoragePort {
  load(): LoadResult
  save(state: GameState): SaveResult
  clear(): SaveResult
}

export class GomokuStorage implements GomokuStoragePort {
  constructor(private readonly storage: StorageLike) {}

  load(): LoadResult {
    let serialized: string | null
    try {
      serialized = this.storage.getItem(STORAGE_KEY)
    } catch {
      return { kind: 'unavailable' }
    }

    if (serialized === null) return { kind: 'empty' }

    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      return this.removeInvalid()
    }

    const state = decodeStoredGame(parsed)
    if (state === null) return this.removeInvalid()
    return { kind: 'loaded', state }
  }

  save(state: GameState): SaveResult {
    if (state.history.length === 0 || state.status !== 'playing') return this.clear()

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(encodeStoredGame(state)))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }

  clear(): SaveResult {
    try {
      this.storage.removeItem(STORAGE_KEY)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }

  private removeInvalid(): LoadResult {
    const result = this.clear()
    return result.ok ? { kind: 'invalid' } : { kind: 'unavailable' }
  }
}

const unavailableStorage: GomokuStoragePort = {
  load: () => ({ kind: 'unavailable' }),
  save: () => ({ ok: false, reason: 'unavailable' }),
  clear: () => ({ ok: false, reason: 'unavailable' }),
}

export function createBrowserGomokuStorage(): GomokuStoragePort {
  if (typeof window === 'undefined') return unavailableStorage

  try {
    return new GomokuStorage(window.localStorage)
  } catch {
    return unavailableStorage
  }
}
