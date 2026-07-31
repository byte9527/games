import type { ComponentType } from 'react'
import { gameCatalog, type GameCatalogItem } from '../games/catalog'
import { GomokuPage } from '../games/gomoku/GomokuPage'
import { GameCatalogPage } from '../pages/GameCatalogPage'
import { useHashRoute } from './useHashRoute'
import './app.css'

const gamePages: Record<GameCatalogItem['id'], ComponentType> = {
  gomoku: GomokuPage,
}

export function App() {
  const route = useHashRoute()
  const activeGame = gameCatalog.find((game) => game.path === route)
  const GamePage = activeGame ? gamePages[activeGame.id] : null

  return (
    <div className="app-shell">
      {GamePage ? <GamePage /> : <GameCatalogPage />}
    </div>
  )
}
