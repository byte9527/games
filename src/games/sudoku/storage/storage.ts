import type { Difficulty, SudokuGameState } from '../core/types'
import {
  builtinSudokuPuzzleProvider,
  type SudokuPuzzleProvider,
} from '../puzzles/provider'
import { decodeStoredSudoku, encodeStoredSudoku } from './schema'

export const ACTIVE_SUDOKU_STORAGE_KEY = 'games:sudoku:active:v1'
export const RECENT_SUDOKU_STORAGE_KEY = 'games:sudoku:recent:v1'

interface StoredRecentSudokuV1 {
  version: 1
  easy: string | null
  medium: string | null
  hard: string | null
}

const RECENT_KEYS = ['version', 'easy', 'medium', 'hard'] as const

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type SudokuLoadResult =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'loaded'
      readonly game: SudokuGameState
      readonly savedAt: number
    }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }

export interface SudokuStoragePort {
  load(): SudokuLoadResult
  save(game: SudokuGameState, savedAt: number): { readonly ok: boolean }
  clear(): { readonly ok: boolean }
  loadPreviousPuzzleId(difficulty: Difficulty): string | null
  savePreviousPuzzleId(
    difficulty: Difficulty,
    puzzleId: string,
  ): { readonly ok: boolean }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasExactRecentKeys(value: object): boolean {
  const keys = Reflect.ownKeys(value)
  return (
    keys.length === RECENT_KEYS.length &&
    RECENT_KEYS.every((key) => Object.hasOwn(value, key)) &&
    keys.every(
      (key) =>
        typeof key === 'string' && RECENT_KEYS.some((expected) => expected === key),
    )
  )
}

function isDifficulty(value: unknown): value is Difficulty {
  return value === 'easy' || value === 'medium' || value === 'hard'
}

const emptyRecent = (): StoredRecentSudokuV1 => ({
  version: 1,
  easy: null,
  medium: null,
  hard: null,
})

function decodeRecent(
  value: unknown,
  provider: SudokuPuzzleProvider,
): StoredRecentSudokuV1 | null {
  if (!isRecord(value) || !hasExactRecentKeys(value) || value.version !== 1) {
    return null
  }

  const decoded = emptyRecent()
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    const puzzleId = value[difficulty]
    if (puzzleId === null) continue
    if (typeof puzzleId !== 'string' || puzzleId.trim().length === 0) return null

    const puzzle = provider.getById(puzzleId)
    if (puzzle === null || puzzle.difficulty !== difficulty) return null
    decoded[difficulty] = puzzleId
  }
  return decoded
}

export class SudokuStorage implements SudokuStoragePort {
  constructor(
    private readonly storage: StorageLike,
    private readonly provider: SudokuPuzzleProvider = builtinSudokuPuzzleProvider,
  ) {}

  load(): SudokuLoadResult {
    let serialized: string | null
    try {
      serialized = this.storage.getItem(ACTIVE_SUDOKU_STORAGE_KEY)
    } catch {
      return { kind: 'unavailable' }
    }

    if (serialized === null) return { kind: 'empty' }

    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      return this.removeInvalidActive()
    }

    const decoded = decodeStoredSudoku(parsed, this.provider)
    if (decoded === null) return this.removeInvalidActive()
    return { kind: 'loaded', game: decoded.game, savedAt: decoded.savedAt }
  }

  save(
    game: SudokuGameState,
    savedAt: number,
  ): { readonly ok: boolean } {
    if (game.status !== 'playing') return this.clear()

    const encoded = encodeStoredSudoku(game, savedAt)
    if (decodeStoredSudoku(encoded, this.provider) === null) {
      throw new Error('Sudoku game does not match the configured puzzle provider')
    }
    const serialized = JSON.stringify(encoded)

    try {
      this.storage.setItem(ACTIVE_SUDOKU_STORAGE_KEY, serialized)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  clear(): { readonly ok: boolean } {
    try {
      this.storage.removeItem(ACTIVE_SUDOKU_STORAGE_KEY)
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  loadPreviousPuzzleId(difficulty: Difficulty): string | null {
    if (!isDifficulty(difficulty)) return null

    let serialized: string | null
    try {
      serialized = this.storage.getItem(RECENT_SUDOKU_STORAGE_KEY)
    } catch {
      return null
    }

    if (serialized === null) return null

    let parsed: unknown
    try {
      parsed = JSON.parse(serialized)
    } catch {
      this.removeInvalidRecent()
      return null
    }

    const recent = decodeRecent(parsed, this.provider)
    if (recent === null) {
      this.removeInvalidRecent()
      return null
    }
    return recent[difficulty]
  }

  savePreviousPuzzleId(
    difficulty: Difficulty,
    puzzleId: string,
  ): { readonly ok: boolean } {
    if (!isDifficulty(difficulty)) return { ok: false }

    const puzzle = this.provider.getById(puzzleId)
    if (puzzle === null || puzzle.difficulty !== difficulty) return { ok: false }

    let serialized: string | null
    try {
      serialized = this.storage.getItem(RECENT_SUDOKU_STORAGE_KEY)
    } catch {
      return { ok: false }
    }

    let recent = emptyRecent()
    if (serialized !== null) {
      let parsed: unknown
      try {
        parsed = JSON.parse(serialized)
      } catch {
        parsed = null
      }
      recent = decodeRecent(parsed, this.provider) ?? emptyRecent()
    }

    const updated: StoredRecentSudokuV1 = { ...recent, [difficulty]: puzzleId }
    try {
      this.storage.setItem(RECENT_SUDOKU_STORAGE_KEY, JSON.stringify(updated))
      return { ok: true }
    } catch {
      return { ok: false }
    }
  }

  private removeInvalidActive(): SudokuLoadResult {
    return this.clear().ok ? { kind: 'invalid' } : { kind: 'unavailable' }
  }

  private removeInvalidRecent(): void {
    try {
      this.storage.removeItem(RECENT_SUDOKU_STORAGE_KEY)
    } catch {
      // recent 仅用于轮换题目，清理失败不能阻断调用方。
    }
  }
}

const unavailableSudokuStorage: SudokuStoragePort = {
  load: () => ({ kind: 'unavailable' }),
  save: () => ({ ok: false }),
  clear: () => ({ ok: false }),
  loadPreviousPuzzleId: () => null,
  savePreviousPuzzleId: () => ({ ok: false }),
}

export function createBrowserSudokuStorage(): SudokuStoragePort {
  if (typeof window === 'undefined') return unavailableSudokuStorage

  let storage: StorageLike | null | undefined
  try {
    storage = window.localStorage
  } catch {
    return unavailableSudokuStorage
  }

  return storage === null || storage === undefined
    ? unavailableSudokuStorage
    : new SudokuStorage(storage)
}
