import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { AppErrorBoundary } from './AppErrorBoundary'

const reloadMocks = vi.hoisted(() => ({
  reloadPage: vi.fn(),
}))

vi.mock('./reloadPage', () => ({
  reloadPage: reloadMocks.reloadPage,
}))

function ThrowingChild({ error }: { error: Error }): ReactNode {
  throw error
}

beforeEach(() => {
  reloadMocks.reloadPage.mockReset()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('AppErrorBoundary', () => {
  it('正常渲染子组件', () => {
    render(
      <AppErrorBoundary>
        <p>页面内容</p>
      </AppErrorBoundary>,
    )

    expect(screen.getByText('页面内容')).toBeInTheDocument()
  })

  it('子组件渲染抛错时显示恢复界面', () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <ThrowingChild error={new Error('render failed')} />
      </AppErrorBoundary>,
    )

    expect(screen.getByRole('heading', { name: '页面暂时无法显示' })).toBeInTheDocument()
    expect(screen.getByText('当前页面遇到了不可预期的问题，请重新加载。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '重新加载' })).toBeInTheDocument()
  })

  it('点击重新加载时调用默认页面重载适配层', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <ThrowingChild error={new Error('render failed')} />
      </AppErrorBoundary>,
    )

    await user.click(screen.getByRole('button', { name: '重新加载' }))

    expect(reloadMocks.reloadPage).toHaveBeenCalledOnce()
  })

  it('不在边界内重复记录 React 已捕获的错误', () => {
    const error = new Error('render failed')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    render(
      <AppErrorBoundary>
        <ThrowingChild error={error} />
      </AppErrorBoundary>,
    )

    expect(consoleError).toHaveBeenCalledOnce()
  })
})
