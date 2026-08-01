import { gameCatalog } from '../games/catalog'

export function GameCatalogPage() {
  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <p className="eyebrow">离线也能玩</p>
        <h1>小游戏</h1>
        <p>没有广告，打开就玩。</p>
      </header>
      <ul className="game-grid" aria-label="游戏列表">
        {gameCatalog.map((game) => (
          <li key={game.id}>
            <a className="game-card" href={`#${game.path}`}>
              <span className="game-card__icon" aria-hidden="true">{game.icon}</span>
              <h2>{game.title}</h2>
              <span>{game.description}</span>
            </a>
          </li>
        ))}
      </ul>
    </main>
  )
}
