import { Fragment, useId } from 'react'

export function SudokuControls({
  canUndo,
  onUndo,
  onRestart,
  onNewPuzzle,
}: {
  readonly canUndo: boolean
  readonly onUndo: () => void
  readonly onRestart: () => void
  readonly onNewPuzzle: () => void
}) {
  const unavailableDescriptionId = useId()

  return (
    <Fragment>
      <div aria-label="数独控制区" className="sudoku-controls" role="group">
        <button
          aria-describedby={canUndo ? undefined : unavailableDescriptionId}
          disabled={!canUndo}
          onClick={onUndo}
          type="button"
        >
          撤销
        </button>
        <button onClick={onRestart} type="button">重新开始</button>
        <button onClick={onNewPuzzle} type="button">换一题</button>
      </div>
      {!canUndo ? (
        <span className="visually-hidden" id={unavailableDescriptionId}>
          暂无可撤销操作
        </span>
      ) : null}
    </Fragment>
  )
}
