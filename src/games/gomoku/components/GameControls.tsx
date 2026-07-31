export function GameControls({
  canUndo,
  onUndo,
  onRestart,
}: {
  readonly canUndo: boolean
  readonly onUndo: () => void
  readonly onRestart: () => void
}) {
  return (
    <div className="game-controls">
      <button type="button" disabled={!canUndo} onClick={onUndo}>
        悔棋
      </button>
      <button type="button" onClick={onRestart}>
        重新开始
      </button>
    </div>
  )
}
