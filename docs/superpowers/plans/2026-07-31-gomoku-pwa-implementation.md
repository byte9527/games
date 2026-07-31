# Gomoku PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个无广告、纯本地、可离线安装的小游戏合集，并交付首个支持本地双人、自动恢复和休闲规则的五子棋游戏。

**Architecture:** 使用 React 构建合集外壳和游戏界面，使用与 React 无关的纯 TypeScript 模块处理五子棋规则。浏览器能力通过独立适配器接入：`localStorage` 负责活动棋局，`vite-plugin-pwa` 负责安装、离线缓存和更新提示；静态站点通过 GitHub Pages 发布。

**Tech Stack:** React、TypeScript、Vite、Vitest、React Testing Library、Playwright、vite-plugin-pwa、GitHub Actions

---

## 开始前约束

- 开始实施前阅读 `docs/superpowers/specs/2026-07-31-gomoku-pwa-design.md`。
- 实施时使用独立 worktree（工作树）和固定分支 `feat/gomoku-pwa`，不要直接在用户当前工作区开发。
- 所有产品代码遵循测试驱动：先写失败测试，确认失败原因正确，再写最小实现。
- 规则核心不得导入 React、DOM（文档对象模型）、`localStorage` 或 PWA API。
- 不接入远程字体、图片、广告、统计或任何运行时第三方服务。
- 每个任务完成并通过该任务列出的验证后，单独提交并立即推送到远端。
- Commit Message（提交信息）采用 Conventional Commits（约定式提交）风格，不附加项目私有规则。允许的常用类型包括 `feat`、`fix`、`test`、`docs`、`chore`、`ci` 和 `refactor`；标题使用英文祈使语气，简洁描述当前任务的唯一目标。
- 实施分支首次推送使用 `git push -u origin HEAD` 建立上游，后续追加提交使用普通 `git push`；只有明确发生 rebase（变基）或其他历史改写时才使用 `git push --force-with-lease`，禁止使用 `--force`。

## 文件职责总览

```text
package.json                              # 依赖与本地命令
vite.config.ts                            # Vite、React、PWA 和部署 base 配置
playwright.config.ts                      # 生产预览端到端测试
index.html                                # 应用 HTML 入口
public/icon-source.svg                    # PWA 图标源文件
scripts/generate-pwa-icons.mjs            # 生成 PNG 与 Apple 图标
src/main.tsx                              # React 挂载入口
src/app/App.tsx                           # 路由与全局页面框架
src/app/useHashRoute.ts                   # 只监听 window.location.hash 的最小路由 Hook
src/app/AppErrorBoundary.tsx              # 不可预期渲染错误兜底
src/app/app.css                           # 全局主题与响应式布局
src/pages/GameCatalogPage.tsx             # 小游戏合集首页
src/games/catalog.ts                      # 游戏元数据注册表
src/games/gomoku/core/types.ts            # 五子棋领域类型
src/games/gomoku/core/board.ts            # 棋盘索引和边界工具
src/games/gomoku/core/win.ts              # 获胜线检测
src/games/gomoku/core/game.ts             # 创建、落子、悔棋和重置
src/games/gomoku/storage/schema.ts        # 存档结构与严格校验
src/games/gomoku/storage/storage.ts       # localStorage 适配器
src/games/gomoku/useGomokuGame.ts         # 界面与规则/存储之间的控制器
src/games/gomoku/components/*.tsx         # 棋盘、提示、控制和弹窗
src/games/gomoku/GomokuPage.tsx           # 五子棋页面组装
src/games/gomoku/gomoku.css               # 木质棋盘视觉
src/pwa/useInstallPrompt.ts                # 浏览器安装事件管理
src/pwa/InstallPrompt.tsx                  # 安装按钮与平台指引
src/pwa/UpdatePrompt.tsx                   # 新版本更新提示
src/test/setup.ts                          # Vitest 浏览器环境配置
e2e/gomoku.spec.ts                         # 核心用户流程
e2e/offline.spec.ts                        # 离线重新打开验证
.github/workflows/deploy-pages.yml         # GitHub Pages 构建与部署
```

### Task 1: 建立 React、TypeScript 与测试骨架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `tsconfig.app.json`
- Create: `tsconfig.node.json`
- Create: `vite.config.ts`
- Create: `index.html`
- Create: `src/test/setup.ts`
- Create: `src/app/App.test.tsx`
- Create: `src/app/App.tsx`
- Create: `src/main.tsx`
- Create: `src/app/app.css`
- Modify: `.gitignore`

- [ ] **Step 1: 创建包配置和 TypeScript 配置**

`package.json`：

```json
{
  "name": "games",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "engines": {
    "node": ">=22.9.0 <23"
  },
  "packageManager": "npm@10.8.3",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "typecheck": "tsc -b --pretty false",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "icons": "node scripts/generate-pwa-icons.mjs"
  }
}
```

`tsconfig.json`：

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`：

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "allowJs": false,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "forceConsistentCasingInFileNames": true,
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "types": ["vite/client", "vitest/globals", "@testing-library/jest-dom"]
  },
  "include": ["src"]
}
```

`tsconfig.node.json`：

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "playwright.config.ts", "scripts"]
}
```

- [ ] **Step 2: 安装运行和测试依赖**

Run:

```bash
npm install react react-dom
npm install -D typescript vite @vitejs/plugin-react @types/react @types/react-dom vitest jsdom@26.1.0 @testing-library/react @testing-library/jest-dom @testing-library/user-event @playwright/test vite-plugin-pwa sharp
npm install -D --save-exact @types/node@22.9.0
npx playwright install chromium
```

Expected: 命令退出码为 0，`package-lock.json` 和 `node_modules/` 已生成。

`@types/node@22.9.0` 必须精确匹配 `engines.node` 支持的最低 Node 22.9.0，避免类型声明接受较新 Node 22 小版本才提供的运行时 API。`jsdom@26.1.0` 保持与该 Node 版本兼容。

- [ ] **Step 3: 配置 Vite 和 Vitest**

`vite.config.ts`：

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

`src/test/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
})
```

在 `.gitignore` 追加：

```gitignore
node_modules/
dist/
coverage/
playwright-report/
test-results/
*.tsbuildinfo
```

- [ ] **Step 4: 写应用骨架的失败测试**

`src/app/App.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App', () => {
  it('renders the game collection heading', () => {
    window.location.hash = '#/'
    render(<App />)
    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: 运行测试并确认失败**

Run: `npm test -- src/app/App.test.tsx`

Expected: FAIL，原因是 `./App` 尚不存在。

- [ ] **Step 6: 写最小应用骨架**

`src/app/App.tsx`：

```tsx
import './app.css'

export function App() {
  return (
    <main className="app-shell">
      <h1>小游戏</h1>
    </main>
  )
}
```

`src/main.tsx`：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'

const root = document.getElementById('root')

if (!root) {
  throw new Error('Missing #root element')
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

`src/app/app.css`：

```css
:root {
  font-family: ui-rounded, "SF Pro Rounded", "PingFang SC", system-ui, sans-serif;
  color: #3f2c1d;
  background: #f5ead4;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
}

* { box-sizing: border-box; }
body { margin: 0; min-width: 320px; min-height: 100vh; }
button, a { font: inherit; }
.app-shell { min-height: 100vh; padding: 24px 16px; }
```

`index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
    <meta name="theme-color" content="#6f4b2a" />
    <title>小游戏</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: 验证测试、类型和构建**

Run:

```bash
npm test -- src/app/App.test.tsx
npm run typecheck
npm run build
```

Expected: 三个命令全部退出码为 0；测试显示 1 passed；`dist/` 生成。

- [ ] **Step 8: 提交应用骨架**

```bash
git add package.json package-lock.json tsconfig*.json vite.config.ts index.html src .gitignore
git commit -m "chore: scaffold React game collection"
git push -u origin HEAD
```

### Task 2: 建立游戏注册表、合集首页与静态路由

**Files:**
- Create: `src/games/catalog.ts`
- Create: `src/pages/GameCatalogPage.tsx`
- Create: `src/pages/GameCatalogPage.test.tsx`
- Create: `src/games/gomoku/GomokuPage.tsx`
- Create: `src/app/useHashRoute.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

- [ ] **Step 1: 写合集导航失败测试**

`src/pages/GameCatalogPage.test.tsx`：

```tsx
import userEvent from '@testing-library/user-event'
import { render, screen, waitFor } from '@testing-library/react'
import { App } from '../app/App'

describe('game catalog', () => {
  it('opens gomoku from the catalog', async () => {
    window.location.hash = '#/'
    const user = userEvent.setup()
    render(<App />)

    expect(screen.getByRole('heading', { name: '小游戏' })).toBeInTheDocument()
    await user.click(screen.getByRole('link', { name: /五子棋/ }))

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '五子棋' })).toBeInTheDocument()
      expect(window.location.hash).toBe('#/games/gomoku')
    })
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/pages/GameCatalogPage.test.tsx`

Expected: FAIL，页面中找不到“五子棋”链接。

- [ ] **Step 3: 实现注册表、首页和路由**

`src/games/catalog.ts`：

```ts
export interface GameCatalogItem {
  id: 'gomoku'
  title: string
  description: string
  path: string
}

export const gameCatalog: readonly GameCatalogItem[] = [
  {
    id: 'gomoku',
    title: '五子棋',
    description: '本地双人，落子成五即可获胜',
    path: '/games/gomoku',
  },
]
```

`src/pages/GameCatalogPage.tsx`：

```tsx
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
```

`src/games/gomoku/GomokuPage.tsx`：

```tsx
export function GomokuPage() {
  return (
    <main className="gomoku-page">
      <a href="#/">返回小游戏</a>
      <h1>五子棋</h1>
    </main>
  )
}
```

`src/app/useHashRoute.ts`：

```ts
import { useEffect, useState } from 'react'

const readRoute = () => window.location.hash.slice(1) || '/'

export function useHashRoute() {
  const [route, setRoute] = useState(readRoute)
  useEffect(() => {
    const updateRoute = () => setRoute(readRoute())
    window.addEventListener('hashchange', updateRoute)
    return () => window.removeEventListener('hashchange', updateRoute)
  }, [])
  return route
}
```

`src/app/App.tsx`：

```tsx
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
```

在 `src/app/app.css` 追加：

```css
.catalog-page, .gomoku-page { width: min(100%, 960px); margin: 0 auto; }
.catalog-header { padding: 32px 0 20px; }
.catalog-header h1 { margin: 4px 0; font-size: clamp(2rem, 9vw, 3.5rem); }
.eyebrow { margin: 0; color: #8a5c2d; font-weight: 700; }
.game-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; }
.game-card { display: grid; gap: 8px; min-height: 180px; padding: 22px; color: inherit; text-decoration: none; background: #fff9ed; border: 1px solid #d8bd91; border-radius: 20px; box-shadow: 0 12px 30px rgb(82 52 24 / 10%); }
.game-card__icon { font-size: 2rem; }
```

- [ ] **Step 4: 验证路由并提交**

Run:

```bash
npm test -- src/pages/GameCatalogPage.test.tsx src/app/App.test.tsx
npm run typecheck
```

Expected: 全部通过。

```bash
git add src/app src/pages src/games/catalog.ts src/games/gomoku/GomokuPage.tsx
git commit -m "feat: add game catalog navigation"
git push
```

### Task 3: 实现五子棋基础状态与合法落子

**Files:**
- Create: `src/games/gomoku/core/types.ts`
- Create: `src/games/gomoku/core/board.ts`
- Create: `src/games/gomoku/core/game.ts`
- Create: `src/games/gomoku/core/game.test.ts`

- [ ] **Step 1: 写基础规则失败测试**

`src/games/gomoku/core/game.test.ts`：

```ts
import { BOARD_SIZE } from './types'
import { createGame, placeStone } from './game'

describe('gomoku game', () => {
  it('starts with an empty 15 by 15 board and black to move', () => {
    const game = createGame()
    expect(game.board).toHaveLength(BOARD_SIZE * BOARD_SIZE)
    expect(game.board.every((cell) => cell === null)).toBe(true)
    expect(game.currentPlayer).toBe('black')
    expect(game.status).toBe('playing')
  })

  it('places a stone, switches player, and preserves the input state', () => {
    const game = createGame()
    const result = placeStone(game, { row: 7, col: 7 })

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state.board[7 * BOARD_SIZE + 7]).toBe('black')
    expect(result.state.currentPlayer).toBe('white')
    expect(result.state.history).toEqual([{ row: 7, col: 7, player: 'black' }])
    expect(game.board[7 * BOARD_SIZE + 7]).toBeNull()
  })

  it.each([
    [{ row: -1, col: 0 }, 'out-of-bounds'],
    [{ row: 15, col: 0 }, 'out-of-bounds'],
  ] as const)('rejects invalid position %o', (position, error) => {
    expect(placeStone(createGame(), position)).toMatchObject({ ok: false, error })
  })

  it('rejects an occupied position', () => {
    const first = placeStone(createGame(), { row: 7, col: 7 })
    if (!first.ok) throw new Error('setup failed')
    expect(placeStone(first.state, { row: 7, col: 7 })).toMatchObject({
      ok: false,
      error: 'occupied',
    })
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/core/game.test.ts`

Expected: FAIL，原因是领域模块尚不存在。

- [ ] **Step 3: 实现领域类型、索引和基础落子**

`src/games/gomoku/core/types.ts`：

```ts
export const BOARD_SIZE = 15

export type Player = 'black' | 'white'
export type Cell = Player | null
export type GameStatus = 'playing' | 'won' | 'draw'

export interface Position { row: number; col: number }
export interface Move extends Position { player: Player }

export interface GameState {
  readonly board: readonly Cell[]
  readonly currentPlayer: Player
  readonly status: GameStatus
  readonly winner: Player | null
  readonly winningLines: readonly (readonly Position[])[]
  readonly history: readonly Move[]
}

export type MoveError = 'out-of-bounds' | 'occupied' | 'game-over'
export type MoveResult =
  | { readonly ok: true; readonly state: GameState }
  | { readonly ok: false; readonly error: MoveError; readonly state: GameState }
```

`src/games/gomoku/core/board.ts`：

```ts
import { BOARD_SIZE, type Position } from './types'

export const isInBounds = ({ row, col }: Position) =>
  Number.isInteger(row) && Number.isInteger(col) &&
  row >= 0 && row < BOARD_SIZE && col >= 0 && col < BOARD_SIZE

export const toIndex = ({ row, col }: Position) => row * BOARD_SIZE + col
export const oppositePlayer = (player: 'black' | 'white') =>
  player === 'black' ? 'white' : 'black'
```

`src/games/gomoku/core/game.ts`：

```ts
import { isInBounds, oppositePlayer, toIndex } from './board'
import { BOARD_SIZE, type GameState, type MoveResult, type Position } from './types'

export function createGame(): GameState {
  return {
    board: Array.from({ length: BOARD_SIZE * BOARD_SIZE }, () => null),
    currentPlayer: 'black',
    status: 'playing',
    winner: null,
    winningLines: [],
    history: [],
  }
}

export function placeStone(state: GameState, position: Position): MoveResult {
  if (state.status !== 'playing') return { ok: false, error: 'game-over', state }
  if (!isInBounds(position)) return { ok: false, error: 'out-of-bounds', state }
  const index = toIndex(position)
  if (state.board[index] !== null) return { ok: false, error: 'occupied', state }

  const board = [...state.board]
  board[index] = state.currentPlayer
  return {
    ok: true,
    state: {
      ...state,
      board,
      currentPlayer: oppositePlayer(state.currentPlayer),
      history: [...state.history, { ...position, player: state.currentPlayer }],
    },
  }
}
```

- [ ] **Step 4: 验证基础规则并提交**

Run: `npm test -- src/games/gomoku/core/game.test.ts`

Expected: 4 组测试全部通过。

```bash
git add src/games/gomoku/core
git commit -m "feat: add gomoku move rules"
git push
```

### Task 4: 实现胜负、多获胜线与和棋判定

**Files:**
- Create: `src/games/gomoku/core/win.ts`
- Create: `src/games/gomoku/core/win.test.ts`
- Modify: `src/games/gomoku/core/game.ts`
- Modify: `src/games/gomoku/core/game.test.ts`

- [ ] **Step 1: 写胜负检测失败测试**

`src/games/gomoku/core/win.test.ts`：

```ts
import { BOARD_SIZE, type Cell } from './types'
import { findWinningLines } from './win'

const boardWith = (stones: Array<[number, number]>) => {
  const board: Cell[] = Array(BOARD_SIZE * BOARD_SIZE).fill(null)
  for (const [row, col] of stones) board[row * BOARD_SIZE + col] = 'black'
  return board
}

describe('findWinningLines', () => {
  it.each([
    [[7, 3], [0, 1]],
    [[3, 7], [1, 0]],
    [[3, 3], [1, 1]],
    [[3, 11], [1, -1]],
  ] as const)('finds five stones from %o in direction %o', ([row, col], [dr, dc]) => {
    const stones = Array.from({ length: 5 }, (_, index) => [row + dr * index, col + dc * index] as [number, number])
    const board = boardWith(stones)
    expect(findWinningLines(board, { row: stones[2][0], col: stones[2][1] }, 'black')).toHaveLength(1)
  })

  it('returns the complete overline and every winning direction', () => {
    const stones: Array<[number, number]> = []
    for (let col = 4; col <= 9; col += 1) stones.push([7, col])
    for (let row = 5; row <= 9; row += 1) stones.push([row, 7])
    const lines = findWinningLines(boardWith(stones), { row: 7, col: 7 }, 'black')
    expect(lines.map((line) => line.length).sort()).toEqual([5, 6])
  })
})
```

在 `src/games/gomoku/core/game.test.ts` 追加：

```ts
it('wins before switching player and rejects later moves', () => {
  let state = createGame()
  const sequence = [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7]]
  for (const [row, col] of sequence) {
    const result = placeStone(state, { row, col })
    if (!result.ok) throw new Error(result.error)
    state = result.state
  }
  expect(state.status).toBe('won')
  expect(state.winner).toBe('black')
  expect(state.currentPlayer).toBe('black')
  expect(placeStone(state, { row: 0, col: 0 })).toMatchObject({ ok: false, error: 'game-over' })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/core/win.test.ts src/games/gomoku/core/game.test.ts`

Expected: FAIL，原因是 `findWinningLines` 不存在且终局未判定。

- [ ] **Step 3: 实现获胜线检测并接入落子流程**

`src/games/gomoku/core/win.ts`：

```ts
import { isInBounds, toIndex } from './board'
import type { Cell, Player, Position } from './types'

const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]] as const

export function findWinningLines(
  board: readonly Cell[],
  origin: Position,
  player: Player,
): readonly (readonly Position[])[] {
  return DIRECTIONS.flatMap(([rowStep, colStep]) => {
    const backward: Position[] = []
    const forward: Position[] = []

    for (let distance = 1; ; distance += 1) {
      const position = { row: origin.row - rowStep * distance, col: origin.col - colStep * distance }
      if (!isInBounds(position) || board[toIndex(position)] !== player) break
      backward.unshift(position)
    }
    for (let distance = 1; ; distance += 1) {
      const position = { row: origin.row + rowStep * distance, col: origin.col + colStep * distance }
      if (!isInBounds(position) || board[toIndex(position)] !== player) break
      forward.push(position)
    }

    const line = [...backward, origin, ...forward]
    return line.length >= 5 ? [line] : []
  })
}
```

在 `placeStone` 创建棋子后加入：

```ts
const winningLines = findWinningLines(board, position, state.currentPlayer)
const won = winningLines.length > 0
const draw = !won && board.every((cell) => cell !== null)

return {
  ok: true,
  state: {
    ...state,
    board,
    currentPlayer: won || draw ? state.currentPlayer : oppositePlayer(state.currentPlayer),
    status: won ? 'won' : draw ? 'draw' : 'playing',
    winner: won ? state.currentPlayer : null,
    winningLines,
    history: [...state.history, { ...position, player: state.currentPlayer }],
  },
}
```

并在文件顶部导入 `findWinningLines`。

- [ ] **Step 4: 增加无五连满盘和棋测试**

在 `game.test.ts` 追加以下完整测试；该分块图案在四个方向的最大连续长度为 2，最后空位选择黑棋位置，使落子前黑白数量均为 112：

```ts
it('declares a draw when the final move fills a board without five in a row', () => {
  const board: Cell[] = Array.from({ length: BOARD_SIZE * BOARD_SIZE }, (_, index) => {
    const row = Math.floor(index / BOARD_SIZE)
    const col = index % BOARD_SIZE
    return (Math.floor(row / 2) + col) % 2 === 0 ? 'black' as const : 'white' as const
  })
  const finalPosition = { row: 14, col: 13 }
  board[finalPosition.row * BOARD_SIZE + finalPosition.col] = null

  for (let row = 0; row < BOARD_SIZE; row += 1) {
    for (let col = 0; col < BOARD_SIZE; col += 1) {
      const player = board[row * BOARD_SIZE + col]
      if (player) expect(findWinningLines(board, { row, col }, player)).toHaveLength(0)
    }
  }

  const result = placeStone({
    ...createGame(),
    board,
    currentPlayer: 'black',
  }, finalPosition)

  expect(result.ok).toBe(true)
  if (!result.ok) return
  expect(result.state.status).toBe('draw')
  expect(result.state.winner).toBeNull()
})
```

同时在测试文件顶部导入 `findWinningLines`，并从 `types.ts` 导入 `Cell` 类型。

- [ ] **Step 5: 验证胜负规则并提交**

Run: `npm test -- src/games/gomoku/core`

Expected: 横、竖、斜线、长连、多线、终局和和棋测试全部通过。

```bash
git add src/games/gomoku/core
git commit -m "feat: detect gomoku game results"
git push
```

### Task 5: 实现悔棋、重放与重新开始

**Files:**
- Modify: `src/games/gomoku/core/game.ts`
- Modify: `src/games/gomoku/core/game.test.ts`

- [ ] **Step 1: 写悔棋失败测试**

在 `game.test.ts` 追加：

```ts
describe('undoLastMove', () => {
  it('returns the turn to the removed stone owner', () => {
    const first = placeStone(createGame(), { row: 7, col: 7 })
    if (!first.ok) throw new Error(first.error)
    const undone = undoLastMove(first.state)
    expect(undone.history).toHaveLength(0)
    expect(undone.currentPlayer).toBe('black')
    expect(undone.board.every((cell) => cell === null)).toBe(true)
  })

  it('restores play after undoing a winning move', () => {
    let state = createGame()
    const sequence = [[7, 3], [8, 3], [7, 4], [8, 4], [7, 5], [8, 5], [7, 6], [8, 6], [7, 7]]
    for (const [row, col] of sequence) {
      const result = placeStone(state, { row, col })
      if (!result.ok) throw new Error(result.error)
      state = result.state
    }
    const undone = undoLastMove(state)
    expect(undone.status).toBe('playing')
    expect(undone.winner).toBeNull()
    expect(undone.currentPlayer).toBe('black')
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/core/game.test.ts`

Expected: FAIL，`undoLastMove` 尚未导出。

- [ ] **Step 3: 实现重放、悔棋和重置**

在 `game.ts` 追加：

```ts
import type { Move } from './types'

export function replayMoves(moves: readonly Move[]): GameState | null {
  let state = createGame()
  for (const move of moves) {
    if (move.player !== state.currentPlayer) return null
    const result = placeStone(state, move)
    if (!result.ok) return null
    state = result.state
  }
  return state
}

export function undoLastMove(state: GameState): GameState {
  if (state.history.length === 0) return state
  return replayMoves(state.history.slice(0, -1)) ?? createGame()
}

export function resetGame(): GameState {
  return createGame()
}
```

将 `GameState`、`MoveResult`、`Position`、`Move` 合并到同一个类型导入语句，避免重复导入。

- [ ] **Step 4: 验证并提交**

Run: `npm test -- src/games/gomoku/core && npm run typecheck`

Expected: 全部通过。

```bash
git add src/games/gomoku/core
git commit -m "feat: add gomoku undo and replay"
git push
```

### Task 6: 实现严格的活动棋局存储适配器

**Files:**
- Create: `src/games/gomoku/storage/schema.ts`
- Create: `src/games/gomoku/storage/storage.ts`
- Create: `src/games/gomoku/storage/storage.test.ts`

- [ ] **Step 1: 写存储失败测试**

`src/games/gomoku/storage/storage.test.ts`：

```ts
import { createGame, placeStone } from '../core/game'
import { GomokuStorage, STORAGE_KEY, type StorageLike } from './storage'

class MemoryStorage implements StorageLike {
  values = new Map<string, string>()
  getItem(key: string) { return this.values.get(key) ?? null }
  setItem(key: string, value: string) { this.values.set(key, value) }
  removeItem(key: string) { this.values.delete(key) }
}

describe('GomokuStorage', () => {
  it('saves and restores an active game', () => {
    const memory = new MemoryStorage()
    const storage = new GomokuStorage(memory)
    const moved = placeStone(createGame(), { row: 7, col: 7 })
    if (!moved.ok) throw new Error(moved.error)
    expect(storage.save(moved.state)).toEqual({ ok: true })
    expect(storage.load()).toEqual({ kind: 'loaded', state: moved.state })
  })

  it('clears invalid data and reports it', () => {
    const memory = new MemoryStorage()
    memory.setItem(STORAGE_KEY, '{broken')
    const storage = new GomokuStorage(memory)
    expect(storage.load()).toEqual({ kind: 'invalid' })
    expect(memory.getItem(STORAGE_KEY)).toBeNull()
  })

  it('does not keep an empty or finished game', () => {
    const memory = new MemoryStorage()
    const storage = new GomokuStorage(memory)
    expect(storage.save(createGame())).toEqual({ ok: true })
    expect(memory.getItem(STORAGE_KEY)).toBeNull()
  })

  it('reports unavailable storage without throwing', () => {
    const storage = new GomokuStorage({
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('blocked') },
      removeItem: () => { throw new Error('blocked') },
    })
    expect(storage.load()).toEqual({ kind: 'unavailable' })
    expect(storage.save(createGame())).toEqual({ ok: false, reason: 'unavailable' })
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/storage/storage.test.ts`

Expected: FAIL，存储模块尚不存在。

- [ ] **Step 3: 实现结构编码和严格校验**

`src/games/gomoku/storage/schema.ts`：

```ts
import { replayMoves } from '../core/game'
import type { GameState, Move, Player } from '../core/types'

export const STORAGE_VERSION = 1

type StoredGame = { version: 1; state: GameState }

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null
const isPlayer = (value: unknown): value is Player => value === 'black' || value === 'white'
const isMove = (value: unknown): value is Move =>
  isObject(value) &&
  typeof value.row === 'number' && Number.isInteger(value.row) &&
  typeof value.col === 'number' && Number.isInteger(value.col) &&
  isPlayer(value.player)

export function encodeStoredGame(state: GameState): StoredGame {
  return { version: STORAGE_VERSION, state }
}

export function decodeStoredGame(value: unknown): GameState | null {
  if (!isObject(value) || value.version !== STORAGE_VERSION || !isObject(value.state)) return null
  const candidate = value.state
  if (!Array.isArray(candidate.history) || !candidate.history.every(isMove)) return null
  if (!Array.isArray(candidate.board) || candidate.board.length !== 225) return null
  if (candidate.status !== 'playing' || candidate.winner !== null) return null
  if (!isPlayer(candidate.currentPlayer) || !Array.isArray(candidate.winningLines)) return null

  const replayed = replayMoves(candidate.history)
  if (!replayed || replayed.status !== 'playing' || replayed.history.length === 0) return null
  if (JSON.stringify(replayed.board) !== JSON.stringify(candidate.board)) return null
  if (replayed.currentPlayer !== candidate.currentPlayer) return null
  if (candidate.winningLines.length !== 0) return null
  return replayed
}
```

- [ ] **Step 4: 实现可注入的存储适配器**

`src/games/gomoku/storage/storage.ts`：

```ts
import type { GameState } from '../core/types'
import { decodeStoredGame, encodeStoredGame } from './schema'

export const STORAGE_KEY = 'games:gomoku:active:v1'

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export type LoadResult =
  | { kind: 'empty' }
  | { kind: 'loaded'; state: GameState }
  | { kind: 'invalid' }
  | { kind: 'unavailable' }
export type SaveResult = { ok: true } | { ok: false; reason: 'unavailable' }

export interface GomokuStoragePort {
  load(): LoadResult
  save(state: GameState): SaveResult
  clear(): SaveResult
}

export class GomokuStorage implements GomokuStoragePort {
  constructor(private readonly storage: StorageLike) {}

  load(): LoadResult {
    try {
      const raw = this.storage.getItem(STORAGE_KEY)
      if (raw === null) return { kind: 'empty' }
      const state = decodeStoredGame(JSON.parse(raw))
      if (state) return { kind: 'loaded', state }
      this.storage.removeItem(STORAGE_KEY)
      return { kind: 'invalid' }
    } catch (error) {
      if (error instanceof SyntaxError) {
        try { this.storage.removeItem(STORAGE_KEY) } catch { return { kind: 'unavailable' } }
        return { kind: 'invalid' }
      }
      return { kind: 'unavailable' }
    }
  }

  save(state: GameState): SaveResult {
    if (state.status !== 'playing' || state.history.length === 0) return this.clear()
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(encodeStoredGame(state)))
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }

  clear(): SaveResult {
    try {
      this.storage.removeItem(STORAGE_KEY)
      return { ok: true }
    } catch {
      return { ok: false, reason: 'unavailable' }
    }
  }
}

const unavailableStorage: GomokuStoragePort = {
  load: () => ({ kind: 'unavailable' }),
  save: () => ({ ok: false, reason: 'unavailable' }),
  clear: () => ({ ok: false, reason: 'unavailable' }),
}

export function createBrowserGomokuStorage(): GomokuStoragePort {
  try {
    return new GomokuStorage(window.localStorage)
  } catch {
    return unavailableStorage
  }
}
```

- [ ] **Step 5: 验证损坏、版本、内容不一致和写入失败**

在 `storage.test.ts` 追加：

```ts
it('rejects an unsupported storage version', () => {
  const memory = new MemoryStorage()
  const storage = new GomokuStorage(memory)
  const moved = placeStone(createGame(), { row: 7, col: 7 })
  if (!moved.ok) throw new Error(moved.error)
  storage.save(moved.state)
  const raw = memory.getItem(STORAGE_KEY)
  if (raw === null) throw new Error('expected saved game')
  const value = JSON.parse(raw) as { version: number }
  value.version = 2
  memory.setItem(STORAGE_KEY, JSON.stringify(value))
  expect(storage.load()).toEqual({ kind: 'invalid' })
})

it('rejects a board that disagrees with move history', () => {
  const memory = new MemoryStorage()
  const storage = new GomokuStorage(memory)
  const moved = placeStone(createGame(), { row: 7, col: 7 })
  if (!moved.ok) throw new Error(moved.error)
  storage.save(moved.state)
  const raw = memory.getItem(STORAGE_KEY)
  if (raw === null) throw new Error('expected saved game')
  const value = JSON.parse(raw) as {
    state: { board: Array<'black' | 'white' | null> }
  }
  value.state.board[0] = 'white'
  memory.setItem(STORAGE_KEY, JSON.stringify(value))
  expect(storage.load()).toEqual({ kind: 'invalid' })
})

it('reports a write failure', () => {
  const moved = placeStone(createGame(), { row: 7, col: 7 })
  if (!moved.ok) throw new Error(moved.error)
  const storage = new GomokuStorage({
    getItem: () => null,
    setItem: () => { throw new Error('quota exceeded') },
    removeItem: () => undefined,
  })
  expect(storage.save(moved.state)).toEqual({ ok: false, reason: 'unavailable' })
})
```

Run: `npm test -- src/games/gomoku/storage && npm run typecheck`

Expected: 所有存储测试通过，且没有宽松恢复损坏数据。

- [ ] **Step 6: 提交存储层**

```bash
git add src/games/gomoku/storage
git commit -m "feat: persist active gomoku games"
git push
```

### Task 7: 实现界面控制器并连接规则与存储

**Files:**
- Create: `src/games/gomoku/useGomokuGame.ts`
- Create: `src/games/gomoku/useGomokuGame.test.tsx`

- [ ] **Step 1: 写控制器失败测试**

`src/games/gomoku/useGomokuGame.test.tsx`：

```tsx
import { act, renderHook } from '@testing-library/react'
import type { GomokuStoragePort } from './storage/storage'
import { useGomokuGame } from './useGomokuGame'

const emptyStorage = (): GomokuStoragePort => ({
  load: () => ({ kind: 'empty' }),
  save: () => ({ ok: true }),
  clear: () => ({ ok: true }),
})

describe('useGomokuGame', () => {
  it('places and undoes moves through the rule core', () => {
    const { result } = renderHook(() => useGomokuGame(emptyStorage()))
    act(() => result.current.play({ row: 7, col: 7 }))
    expect(result.current.game.history).toHaveLength(1)
    act(() => result.current.undo())
    expect(result.current.game.history).toHaveLength(0)
  })

  it('shows explicit notice for invalid restore data', () => {
    const storage: GomokuStoragePort = { ...emptyStorage(), load: () => ({ kind: 'invalid' }) }
    const { result } = renderHook(() => useGomokuGame(storage))
    expect(result.current.notice).toBe('旧对局无法恢复，已开始新棋局。')
  })

  it('keeps the in-memory game when saving fails', () => {
    const storage: GomokuStoragePort = {
      ...emptyStorage(),
      save: () => ({ ok: false, reason: 'unavailable' }),
    }
    const { result } = renderHook(() => useGomokuGame(storage))
    act(() => result.current.play({ row: 7, col: 7 }))
    expect(result.current.game.history).toHaveLength(1)
    expect(result.current.notice).toBe('自动保存不可用，本局仍可继续。')
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/useGomokuGame.test.tsx`

Expected: FAIL，Hook 尚不存在。

- [ ] **Step 3: 实现控制器**

`src/games/gomoku/useGomokuGame.ts`：

```ts
import { useCallback, useState } from 'react'
import { createGame, placeStone, resetGame, undoLastMove } from './core/game'
import type { GameState, Position } from './core/types'
import type { GomokuStoragePort } from './storage/storage'

type Notice = string | null

export function useGomokuGame(storage: GomokuStoragePort) {
  const [initial] = useState(() => {
    const loaded = storage.load()
    if (loaded.kind === 'loaded') return { game: loaded.state, notice: null as Notice }
    if (loaded.kind === 'invalid') return { game: createGame(), notice: '旧对局无法恢复，已开始新棋局。' }
    if (loaded.kind === 'unavailable') return { game: createGame(), notice: '自动保存不可用，本局仍可继续。' }
    return { game: createGame(), notice: null as Notice }
  })
  const [game, setGame] = useState<GameState>(initial.game)
  const [notice, setNotice] = useState<Notice>(initial.notice)

  const persist = useCallback((next: GameState) => {
    if (!storage.save(next).ok) setNotice('自动保存不可用，本局仍可继续。')
  }, [storage])

  const play = useCallback((position: Position) => {
    const result = placeStone(game, position)
    if (!result.ok) return
    setGame(result.state)
    persist(result.state)
  }, [game, persist])

  const undo = useCallback(() => {
    const next = undoLastMove(game)
    if (next === game) return
    setGame(next)
    persist(next)
  }, [game, persist])

  const restart = useCallback(() => {
    const next = resetGame()
    setGame(next)
    if (!storage.clear().ok) setNotice('自动保存不可用，本局仍可继续。')
  }, [storage])

  return { game, notice, play, undo, restart, dismissNotice: () => setNotice(null) }
}
```

- [ ] **Step 4: 验证控制器并提交**

Run: `npm test -- src/games/gomoku/useGomokuGame.test.tsx && npm run typecheck`

Expected: 全部通过。

```bash
git add src/games/gomoku/useGomokuGame.ts src/games/gomoku/useGomokuGame.test.tsx
git commit -m "feat: add gomoku game controller"
git push
```

### Task 8: 实现棋盘、棋子、回合和胜利高亮

**Files:**
- Create: `src/games/gomoku/components/GomokuBoard.tsx`
- Create: `src/games/gomoku/components/TurnIndicator.tsx`
- Create: `src/games/gomoku/components/GomokuBoard.test.tsx`

- [ ] **Step 1: 写棋盘失败测试**

`src/games/gomoku/components/GomokuBoard.test.tsx`：

```tsx
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import { createGame, placeStone } from '../core/game'
import { GomokuBoard } from './GomokuBoard'
import { TurnIndicator } from './TurnIndicator'

describe('GomokuBoard', () => {
  it('renders 225 intersections and reports selected position', async () => {
    const user = userEvent.setup()
    const onPlace = vi.fn()
    render(<GomokuBoard game={createGame()} onPlace={onPlace} />)
    expect(screen.getAllByRole('button')).toHaveLength(225)
    await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
    expect(onPlace).toHaveBeenCalledWith({ row: 7, col: 7 })
  })

  it('renders stones and disables occupied intersections', () => {
    const moved = placeStone(createGame(), { row: 7, col: 7 })
    if (!moved.ok) throw new Error(moved.error)
    render(<GomokuBoard game={moved.state} onPlace={vi.fn()} />)
    expect(screen.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeDisabled()
  })

  it('announces the current turn', () => {
    render(<TurnIndicator game={createGame()} />)
    expect(screen.getByText('黑方回合')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/components/GomokuBoard.test.tsx`

Expected: FAIL，组件尚不存在。

- [ ] **Step 3: 实现棋盘和回合提示**

`src/games/gomoku/components/GomokuBoard.tsx`：

```tsx
import { BOARD_SIZE, type GameState, type Position } from '../core/types'

interface Props { game: GameState; onPlace(position: Position): void }

export function GomokuBoard({ game, onPlace }: Props) {
  const winning = new Set(game.winningLines.flat().map(({ row, col }) => `${row}:${col}`))
  const last = game.history.at(-1)

  return (
    <div className="gomoku-board" aria-label="十五乘十五五子棋棋盘">
      {game.board.map((cell, index) => {
        const row = Math.floor(index / BOARD_SIZE)
        const col = index % BOARD_SIZE
        const key = `${row}:${col}`
        const label = cell === 'black' ? '黑棋' : cell === 'white' ? '白棋' : '空位'
        const isLast = last?.row === row && last.col === col
        return (
          <button
            className="intersection"
            data-col={col}
            data-row={row}
            key={key}
            type="button"
            aria-label={`第 ${row + 1} 行第 ${col + 1} 列，${label}`}
            disabled={cell !== null || game.status !== 'playing'}
            onClick={() => onPlace({ row, col })}
          >
            {cell && (
              <span className={`stone stone--${cell}${winning.has(key) ? ' stone--winning' : ''}`}>
                {isLast && <span className="last-move" aria-hidden="true" />}
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
```

`src/games/gomoku/components/TurnIndicator.tsx`：

```tsx
import type { GameState } from '../core/types'

export function TurnIndicator({ game }: { game: GameState }) {
  const text = game.status === 'won'
    ? `${game.winner === 'black' ? '黑方' : '白方'}获胜`
    : game.status === 'draw'
      ? '本局和棋'
      : `${game.currentPlayer === 'black' ? '黑方' : '白方'}回合`
  return <p className="turn-indicator" aria-live="polite">{text}</p>
}
```

- [ ] **Step 4: 增加获胜高亮测试并验证**

在测试文件中增加辅助函数和两组断言：

```tsx
const playSequence = (sequence: Array<[number, number]>) => {
  let state = createGame()
  for (const [row, col] of sequence) {
    const result = placeStone(state, { row, col })
    if (!result.ok) throw new Error(result.error)
    state = result.state
  }
  return state
}

it('highlights a five-stone winning line', () => {
  const game = playSequence([[7,3],[8,3],[7,4],[8,4],[7,5],[8,5],[7,6],[8,6],[7,7]])
  const { container } = render(<GomokuBoard game={game} onPlace={vi.fn()} />)
  expect(container.querySelectorAll('.stone--winning')).toHaveLength(5)
})

it('highlights every unique stone from simultaneous winning lines', () => {
  const game = playSequence([
    [7,5],[0,0],[7,6],[0,2],[7,8],[0,4],[7,9],[0,6],
    [5,7],[1,1],[6,7],[1,3],[8,7],[1,5],[9,7],[1,7],[7,7],
  ])
  const { container } = render(<GomokuBoard game={game} onPlace={vi.fn()} />)
  expect(game.winningLines).toHaveLength(2)
  expect(container.querySelectorAll('.stone--winning')).toHaveLength(9)
})
```

Run: `npm test -- src/games/gomoku/components && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 5: 提交棋盘组件**

```bash
git add src/games/gomoku/components
git commit -m "feat: render interactive gomoku board"
git push
```

### Task 9: 组装对局页面、控制按钮和确认弹窗

**Files:**
- Create: `src/games/gomoku/components/GameControls.tsx`
- Create: `src/games/gomoku/components/ConfirmDialog.tsx`
- Create: `src/games/gomoku/components/ResultDialog.tsx`
- Create: `src/games/gomoku/components/NoticeBanner.tsx`
- Create: `src/games/gomoku/GomokuPage.test.tsx`
- Modify: `src/games/gomoku/GomokuPage.tsx`

- [ ] **Step 1: 写页面流程失败测试**

`src/games/gomoku/GomokuPage.test.tsx`：

```tsx
import userEvent from '@testing-library/user-event'
import { render, screen } from '@testing-library/react'
import type { GomokuStoragePort } from './storage/storage'
import { GomokuPage } from './GomokuPage'

const storage: GomokuStoragePort = {
  load: () => ({ kind: 'empty' }), save: () => ({ ok: true }), clear: () => ({ ok: true }),
}

describe('GomokuPage', () => {
  it('requires confirmation before restarting a non-empty game', async () => {
    const user = userEvent.setup()
    render(<GomokuPage storage={storage} />)
    await user.click(screen.getByRole('button', { name: '第 8 行第 8 列，空位' }))
    await user.click(screen.getByRole('button', { name: '重新开始' }))
    expect(screen.getByRole('dialog', { name: '重新开始本局？' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '取消' }))
    expect(screen.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeInTheDocument()
  })

  it('can undo after a win from the result dialog', async () => {
    const user = userEvent.setup()
    render(<GomokuPage storage={storage} />)
    const moves = [[8,4],[9,4],[8,5],[9,5],[8,6],[9,6],[8,7],[9,7],[8,8]]
    for (const [row, col] of moves) {
      await user.click(screen.getByRole('button', { name: `第 ${row} 行第 ${col} 列，空位` }))
    }
    expect(screen.getByRole('dialog', { name: '黑方获胜' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '悔棋一步' }))
    expect(screen.getByText('黑方回合')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/games/gomoku/GomokuPage.test.tsx`

Expected: FAIL，页面尚未包含完整对局和控制行为。

- [ ] **Step 3: 实现可访问弹窗和控制组件**

`GameControls.tsx`：

```tsx
interface GameControlsProps {
  canUndo: boolean
  onUndo(): void
  onRestart(): void
}

export function GameControls({ canUndo, onUndo, onRestart }: GameControlsProps) {
  return (
    <div className="game-controls">
      <button type="button" disabled={!canUndo} onClick={onUndo}>悔棋</button>
      <button type="button" onClick={onRestart}>重新开始</button>
    </div>
  )
}
```

`ConfirmDialog.tsx`：

```tsx
import { type ReactNode, useId } from 'react'

interface ConfirmDialogProps {
  title: string
  confirmLabel: string
  children: ReactNode
  onConfirm(): void
  onCancel(): void
}

export function ConfirmDialog({
  title, confirmLabel, children, onConfirm, onCancel,
}: ConfirmDialogProps) {
  const titleId = useId()
  return (
    <div className="dialog-backdrop">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <h2 id={titleId}>{title}</h2>
        <p>{children}</p>
        <div className="dialog-actions">
          <button type="button" autoFocus onClick={onCancel}>取消</button>
          <button type="button" onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </section>
    </div>
  )
}
```

`ResultDialog.tsx`：

```tsx
import type { GameState } from '../core/types'

interface ResultDialogProps {
  game: GameState
  onUndo(): void
  onRestart(): void
}

export function ResultDialog({ game, onUndo, onRestart }: ResultDialogProps) {
  const title = game.status === 'draw'
    ? '本局和棋'
    : `${game.winner === 'black' ? '黑方' : '白方'}获胜`
  return (
    <div className="dialog-backdrop">
      <section className="dialog-card" role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        <div className="dialog-actions">
          <button type="button" onClick={onUndo}>悔棋一步</button>
          <button type="button" onClick={onRestart}>再来一局</button>
          <a href="#/">返回小游戏</a>
        </div>
      </section>
    </div>
  )
}
```

`NoticeBanner.tsx`：

```tsx
export function NoticeBanner({ message, onDismiss }: { message: string; onDismiss(): void }) {
  return (
    <div className="notice-banner" role="status">
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onDismiss}>×</button>
    </div>
  )
}
```

- [ ] **Step 4: 组装 `GomokuPage`**

`GomokuPage.tsx` 的公开属性允许测试注入存储，生产环境默认创建浏览器适配器：

```tsx
import { useMemo, useState } from 'react'
import { createBrowserGomokuStorage, type GomokuStoragePort } from './storage/storage'
import { useGomokuGame } from './useGomokuGame'
import { GomokuBoard } from './components/GomokuBoard'
import { TurnIndicator } from './components/TurnIndicator'
import { GameControls } from './components/GameControls'
import { ConfirmDialog } from './components/ConfirmDialog'
import { ResultDialog } from './components/ResultDialog'
import { NoticeBanner } from './components/NoticeBanner'
import './gomoku.css'

export function GomokuPage({ storage: injected }: { storage?: GomokuStoragePort }) {
  const storage = useMemo(() => injected ?? createBrowserGomokuStorage(), [injected])
  const { game, notice, play, undo, restart, dismissNotice } = useGomokuGame(storage)
  const [confirmRestart, setConfirmRestart] = useState(false)

  const requestRestart = () => {
    if (game.history.length === 0) restart()
    else setConfirmRestart(true)
  }

  return (
    <main className="gomoku-page">
      <header className="game-header">
        <a href="#/" className="back-link">返回小游戏</a>
        <h1>五子棋</h1>
        <TurnIndicator game={game} />
      </header>
      {notice && <NoticeBanner message={notice} onDismiss={dismissNotice} />}
      <GomokuBoard game={game} onPlace={play} />
      <GameControls canUndo={game.history.length > 0} onUndo={undo} onRestart={requestRestart} />
      {confirmRestart && (
        <ConfirmDialog title="重新开始本局？" confirmLabel="确认重新开始"
          onCancel={() => setConfirmRestart(false)}
          onConfirm={() => { restart(); setConfirmRestart(false) }}>
          当前棋局会被清除。
        </ConfirmDialog>
      )}
      {game.status !== 'playing' && (
        <ResultDialog game={game} onUndo={undo} onRestart={restart} />
      )}
    </main>
  )
}
```

- [ ] **Step 5: 验证页面行为并提交**

Run:

```bash
npm test -- src/games/gomoku/GomokuPage.test.tsx src/games/gomoku/components
npm run typecheck
```

Expected: 弹窗、取消、终局悔棋、重新开始和提示测试全部通过。

```bash
git add src/games/gomoku
git commit -m "feat: complete local gomoku game flow"
git push
```

### Task 10: 完成温润木质视觉和移动端响应式布局

**Files:**
- Create: `src/games/gomoku/gomoku.css`
- Modify: `src/app/app.css`
- Create: `playwright.config.ts`
- Create: `e2e/responsive.spec.ts`

- [ ] **Step 1: 配置 Playwright 生产预览**

`playwright.config.ts`：

```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:4173', trace: 'retain-on-failure' },
  webServer: {
    command: 'npm run build && npm run preview -- --host 127.0.0.1',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'mobile', use: { ...devices['iPhone 13'] } },
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 2: 写小屏布局失败测试**

`e2e/responsive.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 320, height: 700 } })

test('gomoku fits a 320px portrait viewport', async ({ page }) => {
  await page.goto('/#/games/gomoku')
  await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()
  const metrics = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
    board: document.querySelector('.gomoku-board')?.getBoundingClientRect().toJSON(),
  }))
  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth)
  expect(metrics.board?.width).toBeLessThanOrEqual(296)
  expect(metrics.board?.width).toBe(metrics.board?.height)
})
```

- [ ] **Step 3: 运行测试并确认失败**

Run: `npx playwright test e2e/responsive.spec.ts --project=chromium`

Expected: FAIL，棋盘尚无正方形尺寸和移动端布局。

- [ ] **Step 4: 实现木质棋盘和响应式样式**

`src/games/gomoku/gomoku.css` 必须包含以下完整布局约束：

```css
.gomoku-page { width: min(100%, 760px); margin: 0 auto; text-align: center; }
.game-header { display: grid; gap: 4px; margin-bottom: 14px; }
.game-header h1 { margin: 0; font-size: clamp(1.8rem, 8vw, 2.7rem); }
.back-link { justify-self: start; color: #70471f; font-weight: 700; }
.turn-indicator { margin: 2px 0 0; font-weight: 800; }

.gomoku-board {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  width: min(100%, 680px);
  aspect-ratio: 1;
  margin: 0 auto;
  padding: clamp(7px, 2.4vw, 16px);
  background: #d6a45f;
  border: clamp(5px, 1.8vw, 12px) solid #b87d37;
  border-radius: 12px;
  box-shadow: 0 18px 40px rgb(75 43 16 / 24%), inset 0 0 24px rgb(255 239 193 / 30%);
}

.intersection {
  position: relative;
  min-width: 0;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}
.intersection::before, .intersection::after {
  content: "";
  position: absolute;
  background: rgb(72 45 21 / 70%);
}
.intersection::before { left: 0; right: 0; top: 50%; height: 1px; }
.intersection::after { top: 0; bottom: 0; left: 50%; width: 1px; }
.intersection[data-col="0"]::before { left: 50%; }
.intersection[data-col="14"]::before { right: 50%; }
.intersection[data-row="0"]::after { top: 50%; }
.intersection[data-row="14"]::after { bottom: 50%; }
.intersection:focus-visible { outline: 3px solid #fff7d6; outline-offset: -3px; z-index: 3; }
.intersection:disabled { cursor: default; opacity: 1; }

.stone {
  position: absolute;
  z-index: 2;
  inset: 8%;
  border-radius: 50%;
  box-shadow: 0 2px 5px rgb(38 22 10 / 45%);
}
.stone--black { background: radial-gradient(circle at 34% 28%, #5d5d5d, #101010 66%); border: 1px solid #050505; }
.stone--white { background: radial-gradient(circle at 34% 28%, #fff, #ded8ca 70%); border: 1px solid #8c8271; }
.stone--winning { box-shadow: 0 0 0 3px #dc322f, 0 2px 5px rgb(38 22 10 / 45%); }
.last-move { position: absolute; width: 24%; aspect-ratio: 1; left: 38%; top: 38%; border-radius: 50%; background: #dc322f; }

.game-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin: 18px auto 0; width: min(100%, 460px); }
.game-controls button, .dialog-actions button { min-height: 46px; border-radius: 12px; border: 1px solid #b9925f; background: #fff8e8; color: #402b18; font-weight: 800; }
.game-controls button:disabled { opacity: .45; }
.dialog-backdrop { position: fixed; inset: 0; z-index: 10; display: grid; place-items: center; padding: 20px; background: rgb(35 22 12 / 55%); }
.dialog-card { width: min(100%, 390px); padding: 24px; border-radius: 18px; background: #fff9ed; box-shadow: 0 24px 70px rgb(0 0 0 / 35%); }
.dialog-actions { display: grid; gap: 10px; margin-top: 18px; }
.notice-banner { display: flex; justify-content: space-between; gap: 12px; margin: 0 auto 12px; padding: 12px; border-radius: 12px; background: #fff4cc; }

@media (max-width: 380px) {
  .app-shell { padding-inline: 12px; }
  .gomoku-board { border-width: 5px; padding: 6px; }
}

@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after { scroll-behavior: auto !important; transition-duration: 0.01ms !important; animation-duration: 0.01ms !important; }
}
```

- [ ] **Step 5: 验证手机和桌面布局并提交**

Run:

```bash
npx playwright test e2e/responsive.spec.ts
npm test
npm run typecheck
```

Expected: 手机和桌面项目均通过，无横向溢出，棋盘宽高相等。

```bash
git add src/app/app.css src/games/gomoku/gomoku.css playwright.config.ts e2e/responsive.spec.ts
git commit -m "feat: style responsive wooden gomoku board"
git push
```

### Task 11: 实现 PWA 图标、离线缓存、安装和更新提示

本任务通过 Service Worker（后台缓存脚本）缓存构建产物，确保首次联网成功后可以断网重新打开应用。

**Files:**
- Create: `public/icon-source.svg`
- Create: `scripts/generate-pwa-icons.mjs`
- Create: `src/pwa/useInstallPrompt.ts`
- Create: `src/pwa/useInstallPrompt.test.tsx`
- Create: `src/pwa/InstallPrompt.tsx`
- Create: `src/pwa/UpdatePrompt.tsx`
- Create: `src/vite-env.d.ts`
- Modify: `vite.config.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/app.css`

- [ ] **Step 1: 写安装事件失败测试**

`src/pwa/useInstallPrompt.test.tsx`：

```tsx
import { act, renderHook } from '@testing-library/react'
import { useInstallPrompt } from './useInstallPrompt'

describe('useInstallPrompt', () => {
  it('captures and invokes beforeinstallprompt', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined)
    const event = Object.assign(new Event('beforeinstallprompt'), {
      prompt,
      userChoice: Promise.resolve({ outcome: 'accepted' as const, platform: '' }),
    })
    const { result } = renderHook(() => useInstallPrompt())
    act(() => window.dispatchEvent(event))
    expect(result.current.canPrompt).toBe(true)
    await act(() => result.current.install())
    expect(prompt).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/pwa/useInstallPrompt.test.tsx`

Expected: FAIL，安装 Hook 尚不存在。

- [ ] **Step 3: 实现安装能力管理**

`src/pwa/useInstallPrompt.ts`：

```ts
import { useEffect, useState } from 'react'

interface InstallEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useInstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null)
  const [installed, setInstalled] = useState(() => window.matchMedia('(display-mode: standalone)').matches)

  useEffect(() => {
    const beforeInstall = (value: Event) => {
      value.preventDefault()
      setEvent(value as InstallEvent)
    }
    const appInstalled = () => { setInstalled(true); setEvent(null) }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', appInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', appInstalled)
    }
  }, [])

  const install = async () => {
    if (!event) return 'unavailable' as const
    await event.prompt()
    const choice = await event.userChoice
    if (choice.outcome === 'accepted') setEvent(null)
    return choice.outcome
  }

  return { canPrompt: event !== null && !installed, installed, install }
}
```

`src/pwa/InstallPrompt.tsx`：

```tsx
import { useState } from 'react'
import { useInstallPrompt } from './useInstallPrompt'

export function InstallPrompt() {
  const { canPrompt, installed, install } = useInstallPrompt()
  const [showGuide, setShowGuide] = useState(false)
  if (installed) return null

  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent)
  return (
    <aside className="install-prompt" aria-label="安装应用">
      {canPrompt ? (
        <button type="button" onClick={() => void install()}>安装到桌面</button>
      ) : (
        <button type="button" onClick={() => setShowGuide(true)}>如何安装</button>
      )}
      {showGuide && (
        <div className="dialog-backdrop">
          <section className="dialog-card" role="dialog" aria-modal="true" aria-label="安装说明">
            <h2>安装到桌面</h2>
            <p>{isIos
              ? '请在 Safari 中打开分享菜单，然后选择“添加到主屏幕”。'
              : '请打开浏览器菜单，然后选择“安装应用”或“添加到主屏幕”。'}</p>
            <button type="button" autoFocus onClick={() => setShowGuide(false)}>知道了</button>
          </section>
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 4: 创建图标源和生成脚本**

`public/icon-source.svg`：

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#6f4b2a"/>
  <rect x="82" y="82" width="348" height="348" rx="34" fill="#d6a45f" stroke="#f2d39b" stroke-width="14"/>
  <g stroke="#68411f" stroke-width="9" opacity=".78">
    <path d="M140 112v288M198 112v288M256 112v288M314 112v288M372 112v288"/>
    <path d="M112 140h288M112 198h288M112 256h288M112 314h288M112 372h288"/>
  </g>
  <circle cx="198" cy="256" r="37" fill="#161616" stroke="#050505" stroke-width="5"/>
  <circle cx="314" cy="256" r="37" fill="#f8f4e9" stroke="#8f826d" stroke-width="5"/>
</svg>
```

`scripts/generate-pwa-icons.mjs`：

```js
import sharp from 'sharp'

const source = 'public/icon-source.svg'
const outputs = [
  ['public/pwa-192x192.png', 192],
  ['public/pwa-512x512.png', 512],
  ['public/maskable-512x512.png', 512],
  ['public/apple-touch-icon.png', 180],
]

await Promise.all(outputs.map(([file, size]) => sharp(source).resize(size, size).png().toFile(file)))
```

Run: `npm run icons`

Expected: 四个 PNG 文件生成，命令退出码为 0。

- [ ] **Step 5: 配置 PWA 和更新提示**

将 `vite.config.ts` 替换为：

```ts
/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  base: process.env.DEPLOY_BASE ?? '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: '无广告小游戏',
        short_name: '小游戏',
        description: '无广告、可离线游玩的小游戏合集',
        theme_color: '#6f4b2a',
        background_color: '#f5ead4',
        display: 'standalone',
        start_url: './',
        scope: './',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: true,
  },
})
```

`src/pwa/UpdatePrompt.tsx`：

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  if (!needRefresh) return null
  return (
    <aside className="update-prompt" role="status">
      <span>新版本已经准备好。</span>
      <button type="button" onClick={() => setNeedRefresh(false)}>稍后</button>
      <button type="button" onClick={() => void updateServiceWorker(true)}>立即更新</button>
    </aside>
  )
}
```

`src/vite-env.d.ts`：

```ts
/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/react" />
```

将 `App.tsx` 调整为：

```tsx
import { GomokuPage } from '../games/gomoku/GomokuPage'
import { GameCatalogPage } from '../pages/GameCatalogPage'
import { InstallPrompt } from '../pwa/InstallPrompt'
import { UpdatePrompt } from '../pwa/UpdatePrompt'
import { useHashRoute } from './useHashRoute'
import './app.css'

export function App() {
  const route = useHashRoute()

  return (
    <div className="app-shell">
      <InstallPrompt />
      {route === '/games/gomoku' ? <GomokuPage /> : <GameCatalogPage />}
      <UpdatePrompt />
    </div>
  )
}
```

在 `src/app/app.css` 追加：

```css
.install-prompt { position: fixed; z-index: 6; top: max(12px, env(safe-area-inset-top)); right: 12px; }
.install-prompt > button, .update-prompt button {
  min-height: 40px;
  border: 1px solid #b9925f;
  border-radius: 999px;
  padding: 8px 14px;
  color: #402b18;
  background: #fff8e8;
  font-weight: 800;
}
.update-prompt {
  position: fixed;
  z-index: 7;
  right: 12px;
  bottom: max(12px, env(safe-area-inset-bottom));
  left: 12px;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: min(620px, calc(100% - 24px));
  margin: 0 auto;
  padding: 12px;
  border: 1px solid #d0ad78;
  border-radius: 14px;
  background: #fff8e8;
  box-shadow: 0 12px 36px rgb(64 43 24 / 20%);
}
```

- [ ] **Step 6: 验证清单和构建产物**

Run:

```bash
npm test -- src/pwa
npm run typecheck
npm run build
test -f dist/manifest.webmanifest
test -f dist/sw.js
node -e "const fs=require('fs'); const m=JSON.parse(fs.readFileSync('dist/manifest.webmanifest')); if(m.display!=='standalone'||m.icons.length!==3) process.exit(1)"
```

Expected: 所有命令退出码为 0，清单包含 3 个图标且显示模式为 `standalone`。

- [ ] **Step 7: 提交 PWA 能力**

```bash
git add public scripts src/pwa src/vite-env.d.ts src/app vite.config.ts package.json package-lock.json
git commit -m "feat: make game collection installable offline"
git push
```

### Task 12: 增加完整对局、刷新恢复和离线端到端测试

**Files:**
- Create: `e2e/gomoku.spec.ts`
- Create: `e2e/offline.spec.ts`
- Modify: `playwright.config.ts`

- [ ] **Step 1: 写完整对局验收测试**

`e2e/gomoku.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test('plays, restores, wins, and undoes a local game', async ({ page }) => {
  await page.goto('/#/')
  await page.getByRole('link', { name: /五子棋/ }).click()

  await page.getByRole('button', { name: '第 8 行第 4 列，空位' }).click()
  await page.getByRole('button', { name: '第 9 行第 4 列，空位' }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: '第 8 行第 4 列，黑棋' })).toBeVisible()
  await expect(page.getByText('黑方回合')).toBeVisible()

  const rest = [[8,5],[9,5],[8,6],[9,6],[8,7],[9,7],[8,8]]
  for (const [row, col] of rest) {
    await page.getByRole('button', { name: `第 ${row} 行第 ${col} 列，空位` }).click()
  }
  await expect(page.getByRole('dialog', { name: '黑方获胜' })).toBeVisible()
  await page.getByRole('button', { name: '悔棋一步' }).click()
  await expect(page.getByText('黑方回合')).toBeVisible()
})

test('cancels and confirms restart safely', async ({ page }) => {
  await page.goto('/#/games/gomoku')
  await page.getByRole('button', { name: '第 8 行第 8 列，空位' }).click()
  await page.getByRole('button', { name: '重新开始' }).click()
  await page.getByRole('button', { name: '取消' }).click()
  await expect(page.getByRole('button', { name: '第 8 行第 8 列，黑棋' })).toBeVisible()
  await page.getByRole('button', { name: '重新开始' }).click()
  await page.getByRole('button', { name: '确认重新开始' }).click()
  await expect(page.getByRole('button', { name: '第 8 行第 8 列，空位' })).toBeVisible()
})
```

- [ ] **Step 2: 写离线重新打开验收测试**

`e2e/offline.spec.ts`：

```ts
import { expect, test } from '@playwright/test'

test('reopens gomoku after the app is cached', async ({ context, page }) => {
  await page.goto('/#/games/gomoku')
  await page.evaluate(() => navigator.serviceWorker.ready)
  await page.reload()
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByRole('heading', { name: '五子棋' })).toBeVisible()
  await expect(page.getByLabel('十五乘十五五子棋棋盘')).toBeVisible()
})
```

- [ ] **Step 3: 运行端到端验收**

Run: `npx playwright test e2e/gomoku.spec.ts e2e/offline.spec.ts --project=chromium`

Expected: 两个 Chromium 用例均通过；确认按钮名称为“确认重新开始”，离线 reload 后标题和棋盘保持可见。若未通过，停止任务并按失败证据修复对应产品模块；禁止放宽断言或加入 `waitForTimeout`。

- [ ] **Step 4: 在手机项目复跑同一流程**

Run: `npx playwright test e2e/gomoku.spec.ts e2e/offline.spec.ts --project=mobile`

Expected: 手机项目全部通过，且不需要为手机端增加独立业务分支。

- [ ] **Step 5: 运行全部自动化验证并提交**

Run:

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

Expected: 单元、组件、类型、构建、手机和桌面 E2E 全部退出码为 0。

```bash
git add e2e playwright.config.ts src
git commit -m "test: cover gomoku browser flows"
git push
```

### Task 13: 增加应用错误边界和不可预期错误恢复

**Files:**
- Create: `src/app/AppErrorBoundary.tsx`
- Create: `src/app/AppErrorBoundary.test.tsx`
- Modify: `src/main.tsx`

- [ ] **Step 1: 写错误边界失败测试**

`src/app/AppErrorBoundary.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react'
import { AppErrorBoundary } from './AppErrorBoundary'

function Broken() { throw new Error('render failed') }

describe('AppErrorBoundary', () => {
  it('offers a reload action for unexpected render errors', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    render(<AppErrorBoundary><Broken /></AppErrorBoundary>)
    expect(screen.getByRole('heading', { name: '页面暂时无法显示' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
    spy.mockRestore()
  })
})
```

- [ ] **Step 2: 运行测试并确认失败**

Run: `npm test -- src/app/AppErrorBoundary.test.tsx`

Expected: FAIL，错误边界尚不存在。

- [ ] **Step 3: 实现并接入错误边界**

`src/app/AppErrorBoundary.tsx`：

```tsx
import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props { children: ReactNode }
interface State { failed: boolean }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) console.error(error, info)
  }

  render() {
    if (!this.state.failed) return this.props.children
    return (
      <main className="error-page">
        <h1>页面暂时无法显示</h1>
        <p>当前页面遇到了不可预期的问题，请重新加载。</p>
        <button type="button" onClick={() => window.location.reload()}>重新加载</button>
      </main>
    )
  }
}
```

将 `src/main.tsx` 替换为：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { AppErrorBoundary } from './app/AppErrorBoundary'

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
```

错误边界仅处理不可预期的渲染错误；规则核心继续通过结果类型表达业务失败，存储层只捕获浏览器 API 抛出的不可控异常。

- [ ] **Step 4: 验证并提交**

Run: `npm test -- src/app/AppErrorBoundary.test.tsx && npm run typecheck`

Expected: 测试和类型检查通过。

```bash
git add src/app/AppErrorBoundary.tsx src/app/AppErrorBoundary.test.tsx src/main.tsx
git commit -m "feat: add application error recovery"
git push
```

### Task 14: 配置 GitHub Pages 部署和项目说明

**Files:**
- Create: `.github/workflows/deploy-pages.yml`
- Create: `README.md`
- Modify: `vite.config.ts`

- [ ] **Step 1: 创建持续部署工作流**

`.github/workflows/deploy-pages.yml`：

```yaml
name: Deploy GitHub Pages

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm test
      - run: npm run typecheck
      - run: npm run build
      - run: npx playwright test --project=chromium
      - run: DEPLOY_BASE=/games/ npm run build
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist

  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - name: Deploy to GitHub Pages
        id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: 确认部署 base 只在 GitHub Actions 使用**

`vite.config.ts` 的顶层配置包含：

```ts
base: process.env.DEPLOY_BASE ?? '/',
```

这样本地开发和 E2E 使用根路径；工作流完成测试后显式使用 `DEPLOY_BASE=/games/` 重建部署产物。hash 路由避免静态托管刷新时产生 404。

- [ ] **Step 3: 编写项目说明**

`README.md`：

````markdown
# Games

一个无广告、无账号、无用户追踪的离线小游戏合集。

在线地址：<https://byte9527.github.io/games/>

## 当前游戏

### 五子棋

- 15×15 棋盘
- 本地双人同屏对战
- 黑棋先手，双方无禁手
- 横、竖或斜线连续五颗或更多棋子获胜
- 支持悔棋、重新开始和未结束棋局自动恢复

## 本地开发

```bash
npm ci
npm run dev
```

## 验证

```bash
npm test
npm run typecheck
npm run build
npm run test:e2e
```

## PWA 与离线使用

首次联网打开后，应用会缓存运行所需的本地资源。之后可以从浏览器或桌面图标断网重新打开。不同浏览器的安装入口不同；页面会在可直接安装时显示安装按钮，否则提供手动安装指引。

## 隐私

项目不包含广告、统计脚本或用户追踪，不会把棋局上传到服务端。未结束棋局只保存在当前浏览器的 `localStorage` 中，浏览器仍可能按自身存储策略清理这些数据。
````

- [ ] **Step 4: 本地模拟 GitHub Actions 构建路径**

Run:

```bash
DEPLOY_BASE=/games/ npm run build
rg -n '/games/' dist/index.html dist/manifest.webmanifest
npm test
npm run typecheck
npm run test:e2e
```

Expected: 构建产物引用 `/games/`，所有验证通过。

- [ ] **Step 5: 提交部署配置**

```bash
git add .github/workflows/deploy-pages.yml README.md vite.config.ts
git commit -m "ci: deploy games to GitHub Pages"
git push
```

## 最终规格核对与发布验证

**Files:**
- Modify only if verification exposes a requirement gap.

- [ ] **Step 1: 对照设计规格逐项检查**

逐项核对 `docs/superpowers/specs/2026-07-31-gomoku-pwa-design.md` 的第 2、3、4、5、10、11、12、13、14 节。确认：

- 仅本地双人、15×15、黑先、无禁手、五颗或更多获胜。
- 有回合、胜负、获胜线、悔棋、确认重开和活动存档恢复。
- 终局及空棋盘不保留活动存档。
- 存档损坏和存储不可用均有明确提示。
- 无账号、服务端、广告、统计、远程字体或运行时远程资源。
- 首次联网后可以断网重开。
- 320px 视口无横向溢出。

- [ ] **Step 2: 运行全量新鲜验证**

Run:

```bash
npm ci
npm test
npm run typecheck
npm run build
npm run test:e2e
git diff --check
git status --short
```

Expected: 所有命令退出码为 0；`git diff --check` 无输出；`git status --short` 无输出。

- [ ] **Step 3: 在真实手机浏览器做一次手工验收**

打开部署地址，完成以下流程：安装到桌面、开始对局、关闭后恢复、完成胜局、终局悔棋、重新开始、断网后从桌面图标重开。记录浏览器和系统版本；若某平台不支持直接安装，确认页面展示准确的手动指引。

- [ ] **Step 4: 快进合并到 `main` 并确认 GitHub Pages**

在原始工作区 `/Users/sky/code/games` 执行：

```bash
git fetch origin
git switch main
git pull --ff-only origin main
git merge --ff-only feat/gomoku-pwa
git push origin main
```

Expected: `main` 快进到已经完整验证的实现提交，不产生额外 merge commit（合并提交）。等待 `Deploy GitHub Pages` 工作流成功，再访问 `https://byte9527.github.io/games/`，确认线上提交 SHA 与本地 `HEAD` 一致且离线测试在部署环境仍能通过。
