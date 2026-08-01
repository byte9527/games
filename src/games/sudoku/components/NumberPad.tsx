import type { Digit } from '../core/types'

const DIGITS: readonly Digit[] = [1, 2, 3, 4, 5, 6, 7, 8, 9]

export function NumberPad({
  noteMode,
  onDigit,
  onErase,
  onToggleNotes,
}: {
  readonly noteMode: boolean
  readonly onDigit: (digit: Digit) => void
  readonly onErase: () => void
  readonly onToggleNotes: () => void
}) {
  return (
    <div aria-label="数独数字键盘" className="number-pad" role="group">
      {DIGITS.map((digit) => (
        <button
          aria-label={`数字 ${digit}`}
          key={digit}
          onClick={() => onDigit(digit)}
          type="button"
        >
          {digit}
        </button>
      ))}
      <button aria-pressed={noteMode} onClick={onToggleNotes} type="button">
        <span>候选模式</span>
        <span aria-hidden="true">{noteMode ? '开' : '关'}</span>
      </button>
      <button onClick={onErase} type="button">擦除</button>
    </div>
  )
}
