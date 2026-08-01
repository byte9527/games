import type { Difficulty } from '../core/types'

const DIFFICULTIES: ReadonlyArray<{
  readonly difficulty: Difficulty
  readonly label: string
}> = [
  { difficulty: 'easy', label: '简单' },
  { difficulty: 'medium', label: '中等' },
  { difficulty: 'hard', label: '困难' },
]

export function DifficultySelector({
  difficulty,
  onSelect,
}: {
  readonly difficulty: Difficulty
  readonly onSelect: (difficulty: Difficulty) => void
}) {
  return (
    <div aria-label="选择难度" className="difficulty-selector" role="group">
      {DIFFICULTIES.map((option) => (
        <button
          aria-pressed={difficulty === option.difficulty}
          key={option.difficulty}
          onClick={() => onSelect(option.difficulty)}
          type="button"
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}
