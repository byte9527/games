export type GameId = 'gomoku' | 'sudoku'

export interface GameCatalogItem {
  readonly id: GameId
  readonly title: string
  readonly description: string
  readonly path: string
  readonly icon: string
}

export const gameCatalog: readonly GameCatalogItem[] = [
  {
    id: 'gomoku',
    title: '五子棋',
    description: '本地双人，落子成五即可获胜',
    path: '/games/gomoku',
    icon: '● ○',
  },
  {
    id: 'sudoku',
    title: '数独',
    description: '经典九宫格，安静专注地挑战逻辑',
    path: '/games/sudoku',
    icon: '1 2 3',
  },
]
