const storageKey = 'games.audio.music.v1'

export type MusicPreferenceLoadResult =
  | { readonly kind: 'loaded'; readonly enabled: boolean }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }

export interface MusicPreferenceStoragePort {
  load(): MusicPreferenceLoadResult
  save(enabled: boolean): { readonly ok: boolean }
}

interface StoredMusicPreference {
  readonly version: 1
  readonly enabled: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStoredPreference(value: unknown): value is StoredMusicPreference {
  return (
    isRecord(value) &&
    Object.hasOwn(value, 'version') &&
    value.version === 1 &&
    Object.hasOwn(value, 'enabled') &&
    typeof value.enabled === 'boolean'
  )
}

const unavailableStorage: MusicPreferenceStoragePort = {
  load: (): MusicPreferenceLoadResult => ({ kind: 'unavailable' }),
  save: (): { readonly ok: boolean } => ({ ok: false }),
}

export function createMusicPreferenceStorage(storage: Storage): MusicPreferenceStoragePort {
  return {
    load(): MusicPreferenceLoadResult {
      let serialized: string | null
      try {
        serialized = storage.getItem(storageKey)
      } catch {
        return { kind: 'unavailable' }
      }

      if (serialized === null) return { kind: 'loaded', enabled: true }

      let parsed: unknown
      try {
        parsed = JSON.parse(serialized)
      } catch {
        return { kind: 'invalid' }
      }

      if (!isStoredPreference(parsed)) return { kind: 'invalid' }
      return { kind: 'loaded', enabled: parsed.enabled }
    },

    save(enabled: boolean): { readonly ok: boolean } {
      const serialized = JSON.stringify({ version: 1, enabled })
      try {
        storage.setItem(storageKey, serialized)
        return { ok: true }
      } catch {
        return { ok: false }
      }
    },
  }
}

export function createBrowserMusicPreferenceStorage(): MusicPreferenceStoragePort {
  if (typeof window === 'undefined') return unavailableStorage

  let storage: Storage
  try {
    storage = window.localStorage
  } catch {
    return unavailableStorage
  }

  return createMusicPreferenceStorage(storage)
}
