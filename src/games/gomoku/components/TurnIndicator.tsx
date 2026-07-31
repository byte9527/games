import { type GameState } from '../core/types'

function indicatorText(game: GameState): string {
  if (game.status === 'draw') return '本局和棋'

  if (game.status === 'won') {
    if (game.winner === 'black') return '黑方获胜'
    if (game.winner === 'white') return '白方获胜'
    return '棋局状态异常'
  }

  return game.currentPlayer === 'black' ? '黑方回合' : '白方回合'
}

export function TurnIndicator({ game }: { game: GameState }) {
  return (
    <div className="turn-indicator" role="status" aria-live="polite">
      {indicatorText(game)}
    </div>
  )
}
