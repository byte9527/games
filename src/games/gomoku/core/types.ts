export const BOARD_SIZE = 15

export type Player = 'black' | 'white'

export type Cell = Player | null

export type GameStatus = 'playing' | 'won' | 'draw'

export interface Position {
  readonly row: number
  readonly col: number
}

export interface Move extends Position {
  readonly player: Player
}

export interface GameState {
  readonly board: readonly Cell[]
  readonly currentPlayer: Player
  readonly status: GameStatus
  readonly winner: Player | null
  readonly winningLines: readonly (readonly Position[])[]
  readonly history: readonly Move[]
}

export type MoveError = 'out-of-bounds' | 'occupied' | 'game-over'

export type MoveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: MoveError; readonly state: GameState }
