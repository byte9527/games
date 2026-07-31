import { gameCatalog } from '../games/catalog'

export function GameCatalogPage() {
  return (
    <main className="catalog-page">
      <header className="catalog-header">
        <p className="eyebrow">离线也能玩</p>
        <h1>小游戏</h1>
        <p>没有广告，打开就玩。</p>
      </header>
      <section className="game-grid" aria-label="游戏列表">
        {gameCatalog.map((game) => (
          <a className="game-card" href={`#${game.path}`} key={game.id}>
            <span className="game-card__icon" aria-hidden="true">● ○</span>
            <strong>{game.title}</strong>
            <span>{game.description}</span>
          </a>
        ))}
      </section>
    </main>
  )
}
