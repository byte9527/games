# Sudoku Mobile Compact Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让无通知、无弹窗的数独正常棋局在 320×740 及以上手机竖屏中无需页面滚动，并保持棋盘尺寸、全部操作入口和 44×44px 独立触控目标。

**Architecture:** 保持现有 React 组件、DOM 顺序和状态流不变，只在 `<760px` 的数独 CSS 中压缩垂直间距并把 11 个数字区按钮重排为六列两行。使用真实 Playwright 几何测量验证页面高度、键盘行数和按钮尺寸，桌面双栏继续使用现有规则。

**Tech Stack:** React 19、TypeScript、CSS Grid、Playwright、Vitest、Vite PWA

---

### Task 1: 用真实浏览器锁定手机首屏和双行键盘要求

**Files:**
- Modify: `e2e/responsive.spec.ts:406-490`
- Test: `e2e/responsive.spec.ts`

- [ ] **Step 1: 扩展数独响应式测试的几何数据**

在现有“数独在 ... 视口无溢出且棋盘与控制区可操作”循环的 `page.evaluate()` 中，增加页面高度和数字键盘按钮几何数据：

```ts
const numberPadButtons = Array.from(
  document.querySelectorAll<HTMLElement>('.number-pad button'),
  (button) => {
    const bounds = button.getBoundingClientRect()
    return {
      top: bounds.top,
      width: bounds.width,
      height: bounds.height,
    }
  },
)

return {
  documentWidth: document.documentElement.scrollWidth,
  documentHeight: document.documentElement.scrollHeight,
  bodyWidth: document.body.scrollWidth,
  bodyHeight: document.body.scrollHeight,
  viewportWidth: window.innerWidth,
  viewportHeight: window.innerHeight,
  // 保留现有 board、numberPad、cellWidth、controls 字段
  numberPadButtons,
}
```

- [ ] **Step 2: 增加 320×740 和 375×812 的首屏断言**

在现有通用断言之后增加：

```ts
if (viewport.width === 320 || viewport.width === 375) {
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.bodyHeight).toBeLessThanOrEqual(metrics.viewportHeight)
  expect(metrics.numberPadButtons).toHaveLength(11)

  const rowTops = Array.from(new Set(
    metrics.numberPadButtons.map(({ top }) => Math.round(top)),
  ))
  expect(rowTops).toHaveLength(2)

  const firstRowTop = Math.round(metrics.numberPadButtons[0]?.top ?? -1)
  const secondRowTop = Math.round(metrics.numberPadButtons[6]?.top ?? -1)
  expect(metrics.numberPadButtons.slice(0, 6).every(
    ({ top }) => Math.round(top) === firstRowTop,
  )).toBe(true)
  expect(metrics.numberPadButtons.slice(6).every(
    ({ top }) => Math.round(top) === secondRowTop,
  )).toBe(true)
  expect(secondRowTop).toBeGreaterThan(firstRowTop)

  const digitWidth = metrics.numberPadButtons[0]?.width ?? 0
  const noteModeWidth = metrics.numberPadButtons[9]?.width ?? 0
  expect(noteModeWidth).toBeGreaterThanOrEqual(digitWidth * 2)
}
```

- [ ] **Step 3: 运行测试并确认正确红灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  /opt/homebrew/bin/npm run test:e2e -- \
  --project=desktop-chromium \
  e2e/responsive.spec.ts \
  --grep '数独在 (320×740|375×812) 视口'
```

Expected: 两个测试至少因页面 `scrollHeight` 大于视口高度、数字键盘存在四个视觉行或候选按钮未跨两列而 FAIL；不能因选择器、导航或测试环境错误失败。

### Task 2: 实现移动端紧凑布局

**Files:**
- Modify: `src/games/sudoku/sudoku.css:246-325`
- Test: `e2e/responsive.spec.ts`

- [ ] **Step 1: 添加移动端专用紧凑规则**

在基础控制区规则之后、`@media (min-width: 760px)` 之前加入：

```css
@media (max-width: 759px) {
  .sudoku-page .game-header {
    gap: 4px;
    margin-bottom: 6px;
  }

  .sudoku-page .game-title-row,
  .sudoku-page .sudoku-meta {
    gap: 4px 8px;
  }

  .sudoku-page .sudoku-meta span,
  .sudoku-page .conflict-status {
    min-height: 28px;
    padding: 4px 9px;
  }

  .sudoku-page .conflict-status {
    margin-bottom: 6px;
  }

  .sudoku-page .sudoku-layout {
    gap: 8px;
  }

  .sudoku-page .sudoku-panel {
    gap: 6px;
  }

  .sudoku-page .number-pad {
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 4px;
  }

  .sudoku-page .number-pad button:nth-child(10) {
    grid-column: span 2;
  }

  .sudoku-page .number-pad button,
  .sudoku-page .sudoku-controls button,
  .sudoku-page .difficulty-selector button {
    padding: 6px 4px;
  }

  .sudoku-page .sudoku-controls,
  .sudoku-page .difficulty-selector {
    gap: 4px;
  }
}
```

该规则不得改变棋盘宽度、棋盘格字号、按钮最小高度、DOM 顺序或可访问属性。

- [ ] **Step 2: 运行首屏定向测试并确认绿灯**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  /opt/homebrew/bin/npm run test:e2e -- \
  --project=desktop-chromium \
  e2e/responsive.spec.ts \
  --grep '数独在 (320×740|375×812) 视口'
```

Expected: 2 passed；页面纵向和横向均无滚动，数字键盘为两行，候选模式跨两列，全部独立按钮宽高至少 44px。

- [ ] **Step 3: 验证桌面布局未继承移动端键盘**

在现有 768px 和 1440px 测试中继续断言布局通过，并运行：

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  /opt/homebrew/bin/npm run test:e2e -- \
  --project=desktop-chromium \
  e2e/responsive.spec.ts \
  --grep '数独在 (768px|1440px) 视口'
```

Expected: 2 passed；棋盘与控制面板保持双栏，数字键盘继续使用桌面三列规则。

### Task 3: 回归验证、提交并推送

**Files:**
- Modify: `src/games/sudoku/sudoku.css`
- Modify: `e2e/responsive.spec.ts`

- [ ] **Step 1: 运行完整数独响应式和交互 E2E**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin \
  /opt/homebrew/bin/npm run test:e2e -- \
  --project=desktop-chromium \
  --project=mobile-chromium \
  e2e/sudoku.spec.ts e2e/responsive.spec.ts
```

Expected: 0 failed；只允许现有且有明确项目能力原因的 skip。

- [ ] **Step 2: 运行单元测试、类型检查和构建**

Run:

```bash
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm test
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run typecheck
env PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin /opt/homebrew/bin/npm run build
git diff --check
```

Expected: 单元测试 0 failed；类型检查和构建退出码 0；PWA 继续生成 Service Worker；`git diff --check` 无输出。

- [ ] **Step 3: 精确提交并推送**

```bash
git add src/games/sudoku/sudoku.css e2e/responsive.spec.ts
git diff --cached --check
git commit -m "fix: compact sudoku mobile layout"
git push origin main
git status --short --branch
```

Expected: 提交和 push 成功，工作树干净，`HEAD == origin/main`。
