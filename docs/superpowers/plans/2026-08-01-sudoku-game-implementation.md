# Sudoku Game Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 PWA 小游戏合集内增加可离线游玩的标准 9×9 单人数独，包含三个难度、候选数、撤销、自动存档、可见页面计时、可访问键盘操作和专属本地合成音乐。

**Architecture:** 数独规则保持为无 React 依赖的不可变核心；题库通过提供器接口供应经过唯一解验证的静态题目；Hook 负责编排存储、计时和页面可见性；页面组件只渲染状态并分发明确动作。存储、音乐和 PWA 继续复用现有端口和生命周期，不新增平行机制。

**Tech Stack:** React 19、TypeScript 7、Vite 6、Vitest、Testing Library、Playwright、Web Audio API、`localStorage`、`vite-plugin-pwa`

---

## Execution Constraints

- 用户已授权直接在 `main` 增量开发。
- 每个任务完成并通过定向验证后，使用 Conventional Commit，随后 `git push origin main`。
- 只精确 `git add` 本任务文件，不使用 `git add .`。
- 每个任务执行 TDD：先写测试、观察正确失败，再写最小实现。
- 每个任务完成后依次进行规格审查和代码质量审查；Critical 或 Important 必须修复并复审。
- 禁止使用 `any`、非空断言、静默 fallback、吞异常、删除有效断言或无条件跳过测试。
- 固定 Node.js 22 命令前缀：

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm
```

## File Map

```text
src/games/sudoku/
├── audio/
│   ├── sudokuMusicScore.test.ts
│   └── sudokuMusicScore.ts
├── components/
│   ├── CompletionDialog.tsx
│   ├── ConfirmDialog.tsx
│   ├── Controls.test.tsx
│   ├── DifficultySelector.tsx
│   ├── NumberPad.tsx
│   ├── SudokuBoard.test.tsx
│   ├── SudokuBoard.tsx
│   └── SudokuControls.tsx
├── core/
│   ├── board.test.ts
│   ├── board.ts
│   ├── game.test.ts
│   ├── game.ts
│   └── types.ts
├── puzzles/
│   ├── data.ts
│   ├── generator.ts
│   ├── provider.test.ts
│   ├── provider.ts
│   ├── solver.test.ts
│   └── solver.ts
├── storage/
│   ├── schema.ts
│   ├── storage.test.ts
│   └── storage.ts
├── SudokuPage.test.tsx
├── SudokuPage.tsx
├── sudoku.css
├── useSudokuGame.test.tsx
└── useSudokuGame.ts
scripts/generate-sudoku-puzzles.ts
e2e/sudoku.spec.ts
```

### Task 1: 建立数独棋盘模型、坐标和冲突检测

**Files:**
- Create: `src/games/sudoku/core/types.ts`
- Create: `src/games/sudoku/core/board.ts`
- Create: `src/games/sudoku/core/board.test.ts`

- [ ] **Step 1: 写棋盘坐标和冲突失败测试**

创建 `board.test.ts`：

```ts
import {
  conflictIndices,
  createBoardFromString,
  isSolvedBoard,
  peerIndices,
} from './board'

describe('sudoku board', () => {
  it('为中心格返回同行、同列和同宫的 20 个唯一关联格', () => {
    const peers = peerIndices(40)
    expect(peers).toHaveLength(20)
    expect(new Set(peers).size).toBe(20)
    expect(peers).toContain(36)
    expect(peers).toContain(4)
    expect(peers).toContain(30)
    expect(peers).not.toContain(40)
  })

  it('同时标记同行、同列和同宫的全部重复数字', () => {
    const board = createBoardFromString(
      '500000005' +
      '050000000' +
      '000000000'.repeat(7),
    )
    expect([...conflictIndices(board)].sort((a, b) => a - b)).toEqual([0, 8, 10])
  })

  it('只有填满且无冲突的棋盘才算完成', () => {
    const solved = createBoardFromString(
      '534678912672195348198342567859761423426853791713924856961537284287419635345286179',
    )
    expect(isSolvedBoard(solved)).toBe(true)
    expect(isSolvedBoard(solved.with(0, null))).toBe(false)
    expect(isSolvedBoard(solved.with(0, 6))).toBe(false)
  })
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run:

```bash
npm test -- src/games/sudoku/core/board.test.ts
```

Expected: FAIL，提示 `./board` 不存在。

- [ ] **Step 3: 实现严格类型和棋盘纯函数**

`types.ts`：

```ts
export const SUDOKU_SIZE = 9
export const CELL_COUNT = SUDOKU_SIZE * SUDOKU_SIZE

export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9
export type CellValue = Digit | null
export type Difficulty = 'easy' | 'medium' | 'hard'
export type GameStatus = 'playing' | 'completed'
export type CandidateMask = number

export interface CellChange {
  readonly index: number
  readonly beforeValue: CellValue
  readonly afterValue: CellValue
  readonly beforeCandidates: CandidateMask
  readonly afterCandidates: CandidateMask
}

export interface HistoryEntry {
  readonly changes: readonly CellChange[]
}

export interface SudokuGameState {
  readonly puzzleId: string
  readonly difficulty: Difficulty
  readonly givens: readonly CellValue[]
  readonly values: readonly CellValue[]
  readonly candidates: readonly CandidateMask[]
  readonly selectedIndex: number
  readonly noteMode: boolean
  readonly history: readonly HistoryEntry[]
  readonly elapsedMs: number
  readonly status: GameStatus
}
```

`board.ts` 必须完整实现并导出：

```ts
import { CELL_COUNT, SUDOKU_SIZE, type CellValue, type Digit } from './types'

export function assertCellIndex(index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= CELL_COUNT) {
    throw new Error('数独格子索引必须是 0 至 80 的整数')
  }
}

export function rowOf(index: number): number {
  assertCellIndex(index)
  return Math.floor(index / SUDOKU_SIZE)
}

export function colOf(index: number): number {
  assertCellIndex(index)
  return index % SUDOKU_SIZE
}

export function boxOf(index: number): number {
  return Math.floor(rowOf(index) / 3) * 3 + Math.floor(colOf(index) / 3)
}

export function peerIndices(index: number): readonly number[] {
  const row = rowOf(index)
  const col = colOf(index)
  const boxRow = Math.floor(row / 3) * 3
  const boxCol = Math.floor(col / 3) * 3
  const peers = new Set<number>()

  for (let cursor = 0; cursor < SUDOKU_SIZE; cursor += 1) {
    peers.add(row * SUDOKU_SIZE + cursor)
    peers.add(cursor * SUDOKU_SIZE + col)
  }
  for (let rowOffset = 0; rowOffset < 3; rowOffset += 1) {
    for (let colOffset = 0; colOffset < 3; colOffset += 1) {
      peers.add((boxRow + rowOffset) * 9 + boxCol + colOffset)
    }
  }
  peers.delete(index)
  return [...peers].sort((left, right) => left - right)
}

function parseDigit(character: string): CellValue {
  if (character === '0') return null
  const value = Number(character)
  if (!Number.isInteger(value) || value < 1 || value > 9) {
    throw new Error('数独棋盘只能包含 0 至 9')
  }
  return value as Digit
}

export function createBoardFromString(serialized: string): readonly CellValue[] {
  if (serialized.length !== CELL_COUNT) throw new Error('数独棋盘必须包含 81 格')
  return Array.from(serialized, parseDigit)
}

export function conflictIndices(values: readonly CellValue[]): ReadonlySet<number> {
  if (values.length !== CELL_COUNT) throw new Error('数独棋盘必须包含 81 格')
  const conflicts = new Set<number>()
  const groups: number[][] = []

  for (let row = 0; row < 9; row += 1) {
    groups.push(Array.from({ length: 9 }, (_, col) => row * 9 + col))
  }
  for (let col = 0; col < 9; col += 1) {
    groups.push(Array.from({ length: 9 }, (_, row) => row * 9 + col))
  }
  for (let box = 0; box < 9; box += 1) {
    const startRow = Math.floor(box / 3) * 3
    const startCol = (box % 3) * 3
    groups.push(Array.from({ length: 9 }, (_, offset) =>
      (startRow + Math.floor(offset / 3)) * 9 + startCol + (offset % 3)))
  }

  for (const group of groups) {
    const positions = new Map<Digit, number[]>()
    for (const index of group) {
      const value = values[index]
      if (value === null) continue
      const matching = positions.get(value) ?? []
      matching.push(index)
      positions.set(value, matching)
    }
    for (const matching of positions.values()) {
      if (matching.length > 1) for (const index of matching) conflicts.add(index)
    }
  }
  return conflicts
}

export function isSolvedBoard(values: readonly CellValue[]): boolean {
  return values.length === CELL_COUNT &&
    values.every((value) => value !== null) &&
    conflictIndices(values).size === 0
}
```

- [ ] **Step 4: 运行定向测试**

Run: `npm test -- src/games/sudoku/core/board.test.ts`

Expected: 3 tests PASS。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/core/types.ts src/games/sudoku/core/board.ts src/games/sudoku/core/board.test.ts
git commit -m "feat: add sudoku board model"
git push origin main
```

### Task 2: 实现输入、候选数、原子撤销和完成状态

**Files:**
- Create: `src/games/sudoku/core/game.ts`
- Create: `src/games/sudoku/core/game.test.ts`
- Modify: `src/games/sudoku/core/types.ts`

- [ ] **Step 1: 写状态转换失败测试**

测试覆盖给定格不可改、普通输入、候选切换、关联候选自动清除、一次撤销完整恢复、擦除和完成：

```ts
import {
  createSudokuGame,
  enterDigit,
  eraseSelected,
  selectCell,
  toggleNoteMode,
  undo,
} from './game'

const givens = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'

it('输入正式数字会清除关联候选，撤销原子恢复全部变化', () => {
  let game = createSudokuGame('easy-001', 'easy', givens)
  game = selectCell(game, 2)
  game = toggleNoteMode(game)
  game = enterDigit(game, 4)
  game = selectCell(game, 3)
  game = enterDigit(game, 4)
  game = toggleNoteMode(game)
  game = selectCell(game, 2)
  game = enterDigit(game, 4)

  expect(game.values[2]).toBe(4)
  expect(game.candidates[3]).toBe(0)

  const restored = undo(game)
  expect(restored.values[2]).toBeNull()
  expect(restored.candidates[2]).toBe(1 << 3)
  expect(restored.candidates[3]).toBe(1 << 3)
})

it('给定数字不可修改且无变化不进入历史', () => {
  const game = selectCell(createSudokuGame('easy-001', 'easy', givens), 0)
  expect(enterDigit(game, 9)).toBe(game)
  expect(eraseSelected(game)).toBe(game)
  expect(game.history).toHaveLength(0)
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/core/game.test.ts`

Expected: FAIL，提示 `./game` 不存在。

- [ ] **Step 3: 实现不可变操作 API**

`game.ts` 导出：

```ts
export type MoveDirection =
  | 'up'
  | 'down'
  | 'left'
  | 'right'
  | 'row-start'
  | 'row-end'

export function createSudokuGame(
  puzzleId: string,
  difficulty: Difficulty,
  serializedGivens: string,
): SudokuGameState

export function selectCell(state: SudokuGameState, index: number): SudokuGameState
export function moveSelection(state: SudokuGameState, direction: MoveDirection): SudokuGameState
export function toggleNoteMode(state: SudokuGameState): SudokuGameState
export function enterDigit(state: SudokuGameState, digit: Digit): SudokuGameState
export function eraseSelected(state: SudokuGameState): SudokuGameState
export function undo(state: SudokuGameState): SudokuGameState
export function resetSudokuGame(state: SudokuGameState): SudokuGameState
export function withElapsedMs(state: SudokuGameState, elapsedMs: number): SudokuGameState
export function replaySudokuHistory(
  initialState: SudokuGameState,
  history: readonly HistoryEntry[],
): SudokuGameState | null
```

实现要求：

- `CandidateMask` 使用第 `digit - 1` 位。
- 只复制发生变化的数组；输入状态保持不可变。
- 每次输入先收集 `CellChange[]`，没有变化时返回原对象。
- 普通数字输入清除当前候选，并从 `peerIndices()` 中移除同一候选位。
- 历史 entry 保存当前格和全部受影响 peer 的前后状态。
- `undo()` 逆向应用最后一条 entry，完成棋局撤销后恢复 `playing`。
- `replaySudokuHistory()` 从初始题面逐条校验每个 change 的 before 状态，再应用 after 状态；任何索引、给定格、候选 mask 或前置状态不一致都返回 `null`。
- 状态更新后使用 `isSolvedBoard()` 计算 `completed`，不读取题目答案。
- 所有 digit、index、elapsed 输入执行有限整数校验。

- [ ] **Step 4: 运行 core 测试**

```bash
npm test -- src/games/sudoku/core/board.test.ts src/games/sudoku/core/game.test.ts
```

Expected: 全部 PASS。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/core/types.ts src/games/sudoku/core/game.ts src/games/sudoku/core/game.test.ts
git commit -m "feat: add sudoku input and undo rules"
git push origin main
```

### Task 3: 实现唯一解求解器和题目接口

**Files:**
- Create: `src/games/sudoku/puzzles/solver.ts`
- Create: `src/games/sudoku/puzzles/solver.test.ts`
- Create: `src/games/sudoku/puzzles/provider.ts`

- [ ] **Step 1: 写求解和校验失败测试**

```ts
import { analyzePuzzle, countSolutions, solvePuzzle } from './solver'

const puzzle = '530070000600195000098000060800060003400803001700020006060000280000419005000080079'
const solution = '534678912672195348198342567859761423426853791713924856961537284287419635345286179'

it('求解标准题并确认唯一解', () => {
  expect(solvePuzzle(puzzle)).toBe(solution)
  expect(countSolutions(puzzle, 2)).toBe(1)
})

it('无解题返回 null，空盘在上限 2 时立即停止', () => {
  expect(solvePuzzle(`55${'0'.repeat(79)}`)).toBeNull()
  expect(countSolutions('0'.repeat(81), 2)).toBe(2)
})

it('返回分支次数供离线难度生成器使用', () => {
  const analysis = analyzePuzzle(puzzle)
  expect(analysis.solution).toBe(solution)
  expect(analysis.solutionCount).toBe(1)
  expect(analysis.branchDecisions).toBeGreaterThanOrEqual(0)
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/puzzles/solver.test.ts`

Expected: FAIL，提示 solver 不存在。

- [ ] **Step 3: 实现 MRV 回溯求解器**

实现要求：

- 解析 81 位字符串，不接受其他字符。
- 每轮选择候选数最少的空格，即 `MRV（最少剩余值）`。
- 候选值按 1 至 9 固定顺序，保证生成和测试确定性。
- `countSolutions` 达到 limit 立即返回，不枚举剩余解。
- 输入棋盘已有冲突时立即判定 0 解。
- 导出：

```ts
export interface PuzzleAnalysis {
  readonly solution: string | null
  readonly solutionCount: number
  readonly branchDecisions: number
}

export function solvePuzzle(serialized: string): string | null
export function countSolutions(serialized: string, limit: number): number
export function analyzePuzzle(serialized: string): PuzzleAnalysis
```

`provider.ts` 定义：

```ts
import type { Difficulty, Digit } from '../core/types'

export interface SudokuPuzzle {
  readonly id: string
  readonly difficulty: Difficulty
  readonly givens: readonly (Digit | null)[]
  readonly solution: readonly Digit[]
}

export interface SudokuPuzzleProvider {
  getById(id: string): SudokuPuzzle | null
  next(difficulty: Difficulty, previousId: string | null): SudokuPuzzle
  all(): readonly SudokuPuzzle[]
}
```

- [ ] **Step 4: 运行求解器测试和类型检查**

```bash
npm test -- src/games/sudoku/puzzles/solver.test.ts
npm run typecheck
```

Expected: PASS，类型错误 0。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/puzzles/solver.ts src/games/sudoku/puzzles/solver.test.ts src/games/sudoku/puzzles/provider.ts
git commit -m "feat: add sudoku puzzle solver"
git push origin main
```

### Task 4: 生成并验证 60 道静态离线题目

**Files:**
- Create: `src/games/sudoku/puzzles/generator.ts`
- Create: `scripts/generate-sudoku-puzzles.ts`
- Create: `src/games/sudoku/puzzles/data.ts`
- Create: `src/games/sudoku/puzzles/provider.test.ts`
- Modify: `src/games/sudoku/puzzles/provider.ts`
- Modify: `package.json`
- Modify: `tsconfig.node.json`

- [ ] **Step 1: 写静态题库失败测试**

```ts
import { builtinSudokuPuzzleProvider } from './provider'
import { analyzePuzzle } from './solver'

it('每个难度恰有 20 道稳定且唯一解的题', () => {
  const puzzles = builtinSudokuPuzzleProvider.all()
  expect(puzzles).toHaveLength(60)
  for (const difficulty of ['easy', 'medium', 'hard'] as const) {
    expect(puzzles.filter((puzzle) => puzzle.difficulty === difficulty)).toHaveLength(20)
  }
  expect(new Set(puzzles.map((puzzle) => puzzle.id)).size).toBe(60)

  for (const puzzle of puzzles) {
    const givens = puzzle.givens.map((value) => value ?? 0).join('')
    const solution = puzzle.solution.join('')
    const analysis = analyzePuzzle(givens)
    expect(analysis.solutionCount).toBe(1)
    expect(analysis.solution).toBe(solution)
    puzzle.givens.forEach((value, index) => {
      if (value !== null) expect(value).toBe(puzzle.solution[index])
    })
  }
})

it('next 不连续返回同一道题', () => {
  const first = builtinSudokuPuzzleProvider.next('easy', null)
  const second = builtinSudokuPuzzleProvider.next('easy', first.id)
  expect(second.id).not.toBe(first.id)
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/puzzles/provider.test.ts`

Expected: FAIL，提示内置 provider 或 data 不存在。

- [ ] **Step 3: 实现仅开发期使用的确定性生成器**

`generator.ts` 使用固定种子 PRNG、标准合法终盘的数字/行/列置换、唯一解删格和 `analyzePuzzle()` 难度指标。固定门槛：

```ts
export const generationRules = {
  easy: { clues: 40, minimumBranches: 0, maximumBranches: 1 },
  medium: { clues: 34, minimumBranches: 2, maximumBranches: 8 },
  hard: { clues: 28, minimumBranches: 9, maximumBranches: Number.POSITIVE_INFINITY },
} as const
```

生成器必须：

- 每次删除一个格后调用 `countSolutions(candidate, 2)`，只有唯一解才保留删除。
- 达到目标 clues 后调用 `analyzePuzzle()`；不符合当前难度门槛则换下一个固定 seed。
- 使用 `difficulty-index` 生成稳定 ID，例如 `easy-001`。
- 同一 seed 和版本必须产生逐字节相同输出。
- 搜索超过 10,000 个 seed 仍无法凑齐某难度时抛出明确错误。

`scripts/generate-sudoku-puzzles.ts` 调用生成器并把完整结果格式化写入 `data.ts`。`package.json` 增加：

```json
{
  "scripts": {
    "sudoku:puzzles": "node --experimental-strip-types scripts/generate-sudoku-puzzles.ts"
  }
}
```

`tsconfig.node.json` 在现有 `compilerOptions` 中增加：

```json
{
  "allowImportingTsExtensions": true
}
```

脚本使用显式 `.ts` 扩展名导入 `generator.ts`，从而让 Node.js 22 的类型擦除直接执行同一份生成逻辑，不复制求解器或生成器实现。

Run:

```bash
npm run sudoku:puzzles
```

Expected: 生成 60 条静态数据。

- [ ] **Step 4: 完成内置 provider**

实现要求：

- 模块加载时把字符串数据解析为只读 puzzle。
- 未知 ID 返回 `null`。
- `next()` 只在指定难度内选择。
- 选择算法使用模块内轮转游标，不依赖远程随机源；传入 previous ID 时跳过该题。
- 题库为空或 difficulty 不存在时抛出明确开发错误。
- `all()` 返回只读数组，调用方不能修改内部数据。

- [ ] **Step 5: 运行题库和生成稳定性验证**

```bash
npm run sudoku:puzzles
git diff --exit-code src/games/sudoku/puzzles/data.ts
npm test -- src/games/sudoku/puzzles/solver.test.ts src/games/sudoku/puzzles/provider.test.ts
```

Expected: 60 道题通过唯一解和难度验证，第二次生成无 diff。

- [ ] **Step 6: 提交并 push**

```bash
git add package.json tsconfig.node.json scripts/generate-sudoku-puzzles.ts src/games/sudoku/puzzles/generator.ts src/games/sudoku/puzzles/data.ts src/games/sudoku/puzzles/provider.ts src/games/sudoku/puzzles/provider.test.ts
git commit -m "feat: add offline sudoku puzzle catalog"
git push origin main
```

### Task 5: 实现严格存储 schema 和浏览器适配器

**Files:**
- Create: `src/games/sudoku/storage/schema.ts`
- Create: `src/games/sudoku/storage/storage.ts`
- Create: `src/games/sudoku/storage/storage.test.ts`

- [ ] **Step 1: 写 schema 和存储失败测试**

覆盖有效 round-trip、未知字段、非法 mask、非法历史、未知 puzzle ID、损坏 JSON、getter/setter/remove 失败、完成棋局清除：

```ts
it('严格恢复活动棋局并拒绝未知字段', () => {
  const game = playedGame()
  const encoded = encodeStoredSudoku(game, 12_345)
  expect(decodeStoredSudoku(encoded, provider)).toEqual({ game, savedAt: 12_345 })
  expect(decodeStoredSudoku({ ...encoded, extra: true }, provider)).toBeNull()
})

it('完成棋局不会作为活动存档保存', () => {
  const storageLike = createStorageLike()
  const storage = new SudokuStorage(storageLike, provider)
  expect(storage.save(completedGame(), 50_000)).toEqual({ ok: true })
  expect(storageLike.removeItem).toHaveBeenCalledWith('games:sudoku:active:v1')
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/storage/storage.test.ts`

Expected: FAIL，提示存储模块不存在。

- [ ] **Step 3: 定义严格 schema**

```ts
interface StoredSudokuV1 {
  readonly version: 1
  readonly puzzleId: string
  readonly difficulty: 'easy' | 'medium' | 'hard'
  readonly values: readonly (number | null)[]
  readonly candidates: readonly number[]
  readonly selectedIndex: number
  readonly noteMode: boolean
  readonly history: readonly {
    readonly changes: readonly {
      readonly index: number
      readonly beforeValue: number | null
      readonly afterValue: number | null
      readonly beforeCandidates: number
      readonly afterCandidates: number
    }[]
  }[]
  readonly elapsedMs: number
  readonly savedAt: number
}
```

严格要求：

- 顶层和所有嵌套对象只能包含定义字段。
- 数组必须密集、长度正确。
- candidate mask 必须是 0 至 511 的整数。
- 使用 Task 2 的 `replaySudokuHistory()` 回放 history；回放后必须逐格等于保存 values/candidates，不能只信任快照。
- givens 从 provider 按 puzzle ID 重建，不写入存档。
- 只接受 `playing`；完整棋盘或无历史的初始棋局不作为活动存档。

- [ ] **Step 4: 实现存储端口**

```ts
export type SudokuLoadResult =
  | { readonly kind: 'empty' }
  | { readonly kind: 'loaded'; readonly game: SudokuGameState; readonly savedAt: number }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'unavailable' }

export interface SudokuStoragePort {
  load(): SudokuLoadResult
  save(game: SudokuGameState, savedAt: number): { readonly ok: boolean }
  clear(): { readonly ok: boolean }
  loadPreviousPuzzleId(difficulty: Difficulty): string | null
  savePreviousPuzzleId(difficulty: Difficulty, puzzleId: string): { readonly ok: boolean }
}
```

活动键：`games:sudoku:active:v1`；最近题目键：`games:sudoku:recent:v1`。损坏活动存档先尝试移除，移除失败返回 unavailable。最近题目记录损坏时返回 null，并尝试移除损坏记录。

- [ ] **Step 5: 运行存储测试**

Run: `npm test -- src/games/sudoku/storage/storage.test.ts`

Expected: 全部 PASS。

- [ ] **Step 6: 提交并 push**

```bash
git add src/games/sudoku/storage/schema.ts src/games/sudoku/storage/storage.ts src/games/sudoku/storage/storage.test.ts
git commit -m "feat: persist sudoku game progress"
git push origin main
```

### Task 6: 实现 Hook、可见页面计时和棋局编排

**Files:**
- Create: `src/games/sudoku/useSudokuGame.ts`
- Create: `src/games/sudoku/useSudokuGame.test.tsx`

- [ ] **Step 1: 写控制器失败测试**

测试覆盖默认简单题、恢复存档、损坏/不可用提示、输入保存、候选/撤销、新题不重复、隐藏暂停计时、完成清除。

定义可注入时钟：

```ts
export interface SudokuClock {
  now(): number
  setInterval(callback: () => void, intervalMs: number): number
  clearInterval(timerId: number): void
}
```

关键测试：

```ts
it('只累计可见 playing 时间并在隐藏时保存', () => {
  const clock = createFakeClock()
  const storage = createStorage({ kind: 'empty' })
  const view = renderHook(() => useSudokuGame({ storage, puzzles: provider, clock }))

  act(() => clock.advance(2_500))
  expect(view.result.current.elapsedMs).toBe(2_500)

  act(() => setVisibility('hidden'))
  act(() => clock.advance(5_000))
  expect(view.result.current.elapsedMs).toBe(2_500)
  expect(storage.save).toHaveBeenLastCalledWith(expect.anything(), expect.any(Number))
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/useSudokuGame.test.tsx`

Expected: FAIL，提示 Hook 不存在。

- [ ] **Step 3: 实现控制器接口**

```ts
export interface SudokuController {
  readonly game: SudokuGameState
  readonly conflicts: ReadonlySet<number>
  readonly notice: string | null
  readonly elapsedMs: number
  readonly hasProgress: boolean
  select(index: number): void
  move(direction: MoveDirection): void
  enter(digit: Digit): void
  erase(): void
  toggleNotes(): void
  undo(): void
  restart(): void
  newPuzzle(difficulty: Difficulty): void
  dismissNotice(): void
}
```

实现要求：

- 初始化只读取一次初始 storage/provider，兼容 StrictMode。
- ref 保存最新 game、storage、provider 和可见计时起点。
- display tick 每 1 秒触发渲染，但 elapsed 使用 `clock.now()` 差值。
- hidden 时结算当前可见片段、停止 interval、同步保存；visible 且 playing 时重新建立起点和 interval。
- 游戏动作先通过 core 得到 next state；无变化时不保存、不渲染。
- 完成后停止 timer、清活动存档，并保留 completion UI state。
- `newPuzzle()` 保存 previous ID，调用 provider.next，创建全新状态。
- save 失败提示“自动保存不可用，本局仍可继续。”，内存状态不回滚。
- invalid load 提示“旧数独进度无法恢复，已开始新题。”。
- effect cleanup 必须清 interval 和 visibility listener；异步状态不得在卸载后写入。

- [ ] **Step 4: 验证 Hook 生命周期**

```bash
npm test -- src/games/sudoku/useSudokuGame.test.tsx
npm run typecheck
```

Expected: 全部 PASS；StrictMode 监听和 interval 数量配对。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/useSudokuGame.ts src/games/sudoku/useSudokuGame.test.tsx
git commit -m "feat: add sudoku game controller"
git push origin main
```

### Task 7: 构建可访问棋盘和键盘输入

**Files:**
- Create: `src/games/sudoku/components/SudokuBoard.tsx`
- Create: `src/games/sudoku/components/SudokuBoard.test.tsx`

- [ ] **Step 1: 写棋盘交互失败测试**

```tsx
it('方向键、数字键、候选模式和擦除通过明确回调工作', async () => {
  const user = userEvent.setup()
  const callbacks = createCallbacks()
  render(<SudokuBoard game={game} conflicts={new Set([2])} {...callbacks} />)

  const first = screen.getByRole('button', { name: '第 1 行第 1 列，给定数字 5' })
  const empty = screen.getByRole('button', { name: '第 1 行第 3 列，空格，存在冲突' })
  empty.focus()
  await user.keyboard('{ArrowRight}4n5{Backspace}')

  expect(callbacks.onMove).toHaveBeenCalledWith('right')
  expect(callbacks.onDigit).toHaveBeenCalledWith(4)
  expect(callbacks.onToggleNotes).toHaveBeenCalledOnce()
  expect(callbacks.onDigit).toHaveBeenCalledWith(5)
  expect(callbacks.onErase).toHaveBeenCalledOnce()
  expect(first).toHaveAttribute('aria-disabled', 'true')
})
```

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/components/SudokuBoard.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现棋盘语义和 roving tabindex**

```ts
interface SudokuBoardProps {
  readonly game: SudokuGameState
  readonly conflicts: ReadonlySet<number>
  readonly onSelect: (index: number) => void
  readonly onMove: (direction: MoveDirection) => void
  readonly onDigit: (digit: Digit) => void
  readonly onErase: () => void
  readonly onToggleNotes: () => void
  readonly onUndo: () => void
}
```

实现要求：

- 外层 `role="grid"`，名称“九乘九数独棋盘”。
- 81 格使用原生 button，只有 selectedIndex 为 `tabIndex=0`。
- 给定格使用 `aria-disabled="true"`，不能使用原生 disabled，以便仍可聚焦和高亮。
- 稳定状态属性：`data-given`、`data-selected`、`data-related`、`data-same-value`、`data-conflict`、`data-box-row`、`data-box-col`。
- 候选数按 3×3 小网格渲染；缺失候选保留布局占位并 `aria-hidden`。
- 可访问名称描述行列、给定/玩家数字、候选和冲突。
- 捕获数字键、方向键、Home、End、Delete、Backspace、N、Ctrl/Meta+Z；不拦截无关快捷键。
- selection 更新后聚焦新 selected button；卸载后不访问旧节点。

- [ ] **Step 4: 运行组件测试**

Run: `npm test -- src/games/sudoku/components/SudokuBoard.test.tsx`

Expected: 全部 PASS。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/components/SudokuBoard.tsx src/games/sudoku/components/SudokuBoard.test.tsx
git commit -m "feat: add accessible sudoku board"
git push origin main
```

### Task 8: 构建数字键盘、控制区和对话框

**Files:**
- Create: `src/games/sudoku/components/NumberPad.tsx`
- Create: `src/games/sudoku/components/SudokuControls.tsx`
- Create: `src/games/sudoku/components/DifficultySelector.tsx`
- Create: `src/games/sudoku/components/ConfirmDialog.tsx`
- Create: `src/games/sudoku/components/CompletionDialog.tsx`
- Create: `src/games/sudoku/components/Controls.test.tsx`

- [ ] **Step 1: 写控制组件失败测试**

```tsx
it('数字键盘提供稳定名称和候选状态', async () => {
  const user = userEvent.setup()
  const onDigit = vi.fn()
  const onToggleNotes = vi.fn()
  render(<NumberPad noteMode onDigit={onDigit} onErase={vi.fn()} onToggleNotes={onToggleNotes} />)

  await user.click(screen.getByRole('button', { name: '数字 7' }))
  await user.click(screen.getByRole('button', { name: '候选模式' }))
  expect(onDigit).toHaveBeenCalledWith(7)
  expect(onToggleNotes).toHaveBeenCalledOnce()
  expect(screen.getByRole('button', { name: '候选模式' })).toHaveAttribute('aria-pressed', 'true')
})
```

覆盖 1-9、候选、擦除、撤销禁用原因、三难度、确认取消、完成用时和返回链接。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/components/Controls.test.tsx`

Expected: FAIL，组件不存在。

- [ ] **Step 3: 实现组件**

- `ConfirmDialog` 接收 `kind: 'restart' | 'new-puzzle' | 'difficulty'`，提供明确标题、正文和确认按钮。
- 初始焦点为取消按钮，Escape 取消，页面负责恢复触发控件焦点。
- `CompletionDialog` 标题“数独完成”，展示难度和 `formatElapsedTime()`，操作“再来一题”“返回小游戏”。
- `DifficultySelector` 三个 button，当前难度 `aria-pressed=true`。
- `SudokuControls` 的 disabled 撤销关联隐藏说明“暂无可撤销操作”。

```ts
export function formatElapsedTime(elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs < 0) {
    throw new Error('数独用时必须是有限的非负数')
  }
  const totalSeconds = Math.floor(elapsedMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`
}
```

- [ ] **Step 4: 运行控制组件测试**

Run: `npm test -- src/games/sudoku/components/Controls.test.tsx`

Expected: 全部 PASS。

- [ ] **Step 5: 提交并 push**

```bash
git add src/games/sudoku/components/NumberPad.tsx src/games/sudoku/components/SudokuControls.tsx src/games/sudoku/components/DifficultySelector.tsx src/games/sudoku/components/ConfirmDialog.tsx src/games/sudoku/components/CompletionDialog.tsx src/games/sudoku/components/Controls.test.tsx
git commit -m "feat: add sudoku controls and dialogs"
git push origin main
```

### Task 9: 组装页面、响应式样式和页面测试

**Files:**
- Create: `src/games/sudoku/SudokuPage.tsx`
- Create: `src/games/sudoku/SudokuPage.test.tsx`
- Create: `src/games/sudoku/sudoku.css`

- [ ] **Step 1: 写页面流程失败测试**

测试使用真实 `AudioProvider` 和 fake engine/storage/provider：

```tsx
it('输入、候选、撤销和重新开始确认形成完整页面流程', async () => {
  const user = userEvent.setup()
  renderPage()

  await user.click(screen.getByRole('button', { name: /第 1 行第 3 列，空格/ }))
  await user.click(screen.getByRole('button', { name: '候选模式' }))
  await user.click(screen.getByRole('button', { name: '数字 4' }))
  expect(screen.getByRole('button', { name: /第 1 行第 3 列.*候选 4/ })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '撤销' }))
  expect(screen.getByRole('button', { name: /第 1 行第 3 列，空格/ })).toBeVisible()

  await user.click(screen.getByRole('button', { name: '重新开始' }))
  expect(screen.getByRole('dialog', { name: '重新开始这道题？' })).toBeVisible()
  await user.click(screen.getByRole('button', { name: '取消' }))
})
```

覆盖默认页面、输入/候选/撤销、确认重新开始、换题/难度、损坏提示、完成弹窗、背景 inert 和焦点恢复。

- [ ] **Step 2: 运行测试并确认红灯**

Run: `npm test -- src/games/sudoku/SudokuPage.test.tsx`

Expected: FAIL，页面不存在。

- [ ] **Step 3: 组装页面**

要求：

- `useMemo` 创建 browser storage，注入时保持测试端口。
- `useSudokuGame` 是唯一棋局状态来源。
- header 包含返回链接、标题、MusicToggle、难度和格式化用时。
- 冲突状态为“当前有 N 个冲突格”。
- notice 优先游戏存储提示，其次全局音频提示。
- 有历史时 restart/new/difficulty 打开确认；无进度直接执行。
- completion 或 confirm 打开时 `.game-content` 同时 `inert` 和 `aria-hidden`。
- completion 后不提供撤销，只有再来一题和返回。
- Modal 关闭后恢复到触发按钮。

- [ ] **Step 4: 实现响应式样式**

`sudoku.css`：

- `.sudoku-page` 最大宽度 920px。
- 320px 起单列，棋盘使用 9 列 grid 和 `aspect-ratio: 1`。
- 宫边界使用 data 属性加粗，不只依赖颜色。
- 给定、玩家数字、候选、selected、related、same-value、conflict 使用独立选择器。
- 760px 以上棋盘和控制面板双列，棋盘最大 620px。
- 按钮最小触控高度 44px；320px 无水平溢出。
- `forced-colors: active` 保留宫线、焦点和冲突。
- `prefers-reduced-motion: reduce` 将非必要动画/transition 降至 0.01ms。

- [ ] **Step 5: 运行页面测试和类型检查**

```bash
npm test -- src/games/sudoku/SudokuPage.test.tsx src/games/sudoku/components/SudokuBoard.test.tsx src/games/sudoku/components/Controls.test.tsx
npm run typecheck
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交并 push**

```bash
git add src/games/sudoku/SudokuPage.tsx src/games/sudoku/SudokuPage.test.tsx src/games/sudoku/sudoku.css
git commit -m "feat: build sudoku game page"
git push origin main
```

### Task 10: 接入专属音乐、合集和应用路由

**Files:**
- Create: `src/games/sudoku/audio/sudokuMusicScore.ts`
- Create: `src/games/sudoku/audio/sudokuMusicScore.test.ts`
- Modify: `src/games/sudoku/SudokuPage.tsx`
- Modify: `src/games/catalog.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/pages/GameCatalogPage.tsx`
- Modify: `src/pages/GameCatalogPage.test.tsx`
- Modify: `src/app/App.test.tsx`

- [ ] **Step 1: 写音乐与路由失败测试**

```ts
import { loopDurationSeconds, validateMusicScore } from '../../../audio/core/musicScore'
import { sudokuMusicScore } from './sudokuMusicScore'

it('数独曲目合法、低音量且循环约 36 秒', () => {
  expect(validateMusicScore(sudokuMusicScore)).toEqual({ ok: true })
  expect(sudokuMusicScore.masterGain).toBeLessThanOrEqual(0.055)
  expect(loopDurationSeconds(sudokuMusicScore)).toBeGreaterThanOrEqual(32)
  expect(loopDurationSeconds(sudokuMusicScore)).toBeLessThanOrEqual(40)
})
```

扩展 catalog 测试，断言“数独”卡片进入 `#/games/sudoku`，返回后两个卡片均存在。

- [ ] **Step 2: 运行测试并确认红灯**

```bash
npm test -- src/games/sudoku/audio/sudokuMusicScore.test.ts src/pages/GameCatalogPage.test.tsx src/app/App.test.tsx
```

Expected: FAIL，曲目和 route 不存在。

- [ ] **Step 3: 定义数独音乐**

- ID `sudoku-calm-focus`。
- 60 BPM，36 beats loop，`fadeSeconds: 0.8`。
- `masterGain: 0.05`。
- 只使用现有 `pluck`、`flute`、`pad`。
- 固定音符，无运行时随机数，留白多于五子棋。
- `SudokuPage` 仅在 `game.status === 'playing'` 时 `useGameMusic()`。

- [ ] **Step 4: 扩展 catalog 和 route**

`catalog.ts`：

```ts
export type GameId = 'gomoku' | 'sudoku'

export interface GameCatalogItem {
  readonly id: GameId
  readonly title: string
  readonly description: string
  readonly path: string
  readonly icon: string
}
```

两个条目图标为 `● ○` 和 `1 2 3`；`GameCatalogPage` 不再硬编码图标。`App.tsx` 的 `gamePages` 增加 `sudoku: SudokuPage`。

- [ ] **Step 5: 运行音乐、页面和路由测试**

```bash
npm test -- src/games/sudoku/audio/sudokuMusicScore.test.ts src/games/sudoku/SudokuPage.test.tsx src/pages/GameCatalogPage.test.tsx src/app/App.test.tsx
npm run typecheck
```

Expected: 全部 PASS。

- [ ] **Step 6: 提交并 push**

```bash
git add src/games/sudoku/audio/sudokuMusicScore.ts src/games/sudoku/audio/sudokuMusicScore.test.ts src/games/sudoku/SudokuPage.tsx src/games/catalog.ts src/app/App.tsx src/pages/GameCatalogPage.tsx src/pages/GameCatalogPage.test.tsx src/app/App.test.tsx
git commit -m "feat: integrate sudoku into game catalog"
git push origin main
```

### Task 11: 浏览器、离线、README 和最终验收

**Files:**
- Create: `e2e/sudoku.spec.ts`
- Modify: `e2e/offline.spec.ts`
- Modify: `e2e/responsive.spec.ts`
- Modify: `README.md`
- Modify only if root-cause verification exposes a defect.

- [ ] **Step 1: 写数独 E2E**

`e2e/sudoku.spec.ts` 覆盖：

1. 从合集进入数独。
2. 选择空格并输入正式数字。
3. 开启候选、输入候选、撤销。
4. 刷新后恢复题目、输入、候选和难度。
5. 重新开始取消保留状态，确认后清空。
6. 切换难度和换题不连续重复。
7. 桌面键盘方向、数字、N、Delete、Ctrl/Meta+Z。
8. pageerror、console error、全部 HTTP(S) 和 media 请求；跨域和 media 均为空。

使用格子可访问名称和 `data-puzzle-id`，不依赖 CSS 位置截图。

- [ ] **Step 2: 扩展离线和响应式 E2E**

离线：

- 联网访问数独并等待 Service Worker ready。
- 写入正式数字和候选后刷新确认存档。
- context offline 后 reload。
- 断言 81 格、存档值、候选、数字键盘、音乐开关可用。
- 离线继续输入并撤销。
- `finally` 恢复 online。
- external requests 和 media requests 均为空。

响应式：

- 320×740、375×812、iPhone 13、768、1440 无水平溢出。
- 棋盘正方形，数字键盘按钮可见且至少 44px。
- 强制颜色下宫线、焦点和冲突可辨识。
- 减少动画下 transition 接近 0。
- 弹窗打开后 `.game-content` inert/aria-hidden，关闭后焦点恢复。

- [ ] **Step 3: 更新 README**

新增数独说明：

- 标准 9×9，简单/中等/困难。
- 候选数、撤销、自动保存、仅前台计时。
- 内置唯一解题库，离线可用。
- 专属本地合成音乐，共享全局开关。
- 无提示、排行、账号或远程题目。

隐私章节说明数独活动进度和最近题目标识只在当前浏览器保存。

- [ ] **Step 4: 运行定向 E2E**

```bash
npm run test:e2e -- --project=desktop-chromium --project=mobile-chromium e2e/sudoku.spec.ts e2e/offline.spec.ts e2e/responsive.spec.ts
```

Expected: 0 failure；只允许已有且有明确浏览器能力原因的 skip。

- [ ] **Step 5: 提交并 push**

```bash
git add e2e/sudoku.spec.ts e2e/offline.spec.ts e2e/responsive.spec.ts README.md
git commit -m "test: cover sudoku browser and offline flows"
git push origin main
```

- [ ] **Step 6: 运行全量单元测试、类型和默认构建**

```bash
npm test
npm run typecheck
npm run build
```

Expected: 0 failed；Vite 生成 `dist/` 和 Service Worker。

- [ ] **Step 7: 验证 Pages 基础路径、预缓存和无媒体**

```bash
DEPLOY_BASE=/games/ npm run build
rg -n '/games/assets/|/games/manifest.webmanifest' dist/index.html
rg -n 'assets/index-.*\.js|manifest.webmanifest' dist/sw.js
if rg -n 'https?://[^"[:space:]]+\.(mp3|ogg|wav)' dist src; then exit 1; fi
if find dist src -type f \( -name '*.mp3' -o -name '*.ogg' -o -name '*.wav' \) | grep .; then exit 1; fi
```

Expected: `/games/` 匹配；主 JS 和 manifest 预缓存；媒体文件和远程音频 URL 均为 0。

- [ ] **Step 8: 运行全量 Chromium E2E、依赖和工作区检查**

```bash
npm run test:e2e -- --project=desktop-chromium --project=mobile-chromium
npm audit --omit=dev
git diff --check
git status --short --branch
```

Expected: E2E 0 failed；生产依赖漏洞 0；工作区干净且 `HEAD == origin/main`。

- [ ] **Step 9: 最终评审**

最终规格和质量审查必须确认：

- 60 道题均唯一解，难度数量准确，题库静态离线。
- core 不依赖 React、DOM、存储或音频。
- 给定、候选、自动清理、撤销和完成状态不可变且可验证。
- 存储严格 schema，损坏/不可用有明确状态，完成棋局不恢复。
- 隐藏页面不计时、不播放；监听器和 interval 无残留。
- 键盘、触控、320px、强制颜色、减少动画和 Modal 可访问性通过。
- 音乐复用现有可信激活和恢复状态机，不新增平行机制。
- 离线无跨域和媒体请求，`/games/` 路径正确。
- Critical 和 Important 为 0。

若验证暴露根因缺陷：先使用 systematic debugging 定位，再用 TDD 修复；精确提交更具体的 Conventional Commit 并 push，不创建空 commit。
