export interface GameCatalogItem {
  id: 'gomoku'
  title: string
  description: string
  path: string
}

export const gameCatalog: readonly GameCatalogItem[] = [
  {
    id: 'gomoku',
    title: '五子棋',
    description: '本地双人，落子成五即可获胜',
    path: '/games/gomoku',
  },
]
