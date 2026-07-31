import { GomokuPage } from '../games/gomoku/GomokuPage'
import { GameCatalogPage } from '../pages/GameCatalogPage'
import { useHashRoute } from './useHashRoute'
import './app.css'

export function App() {
  const route = useHashRoute()

  return (
    <div className="app-shell">
      {route === '/games/gomoku' ? <GomokuPage /> : <GameCatalogPage />}
    </div>
  )
}
