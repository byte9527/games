import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { UpdatePrompt } from './UpdatePrompt'

const swMocks = vi.hoisted(() => ({
  needRefresh: false,
  setNeedRefresh: vi.fn(),
  updateServiceWorker: vi.fn(),
}))

vi.mock('virtual:pwa-register/react', () => ({
  useRegisterSW: () => ({
    needRefresh: [swMocks.needRefresh, swMocks.setNeedRefresh],
    updateServiceWorker: swMocks.updateServiceWorker,
  }),
}))

describe('UpdatePrompt', () => {
  beforeEach(() => {
    swMocks.needRefresh = false
    swMocks.setNeedRefresh.mockReset()
    swMocks.updateServiceWorker.mockReset()
    swMocks.updateServiceWorker.mockResolvedValue(undefined)
  })

  it('没有待更新版本时不显示', () => {
    render(<UpdatePrompt />)

    expect(screen.queryByText('新版本已经准备好。')).not.toBeInTheDocument()
  })

  it('显示精确消息以及稍后和立即更新操作', () => {
    swMocks.needRefresh = true

    render(<UpdatePrompt />)

    expect(screen.getByText('新版本已经准备好。')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '稍后' })).toBeEnabled()
    expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled()
  })

  it('仅消息 span 是实时区域，按钮位于相邻操作区', () => {
    swMocks.needRefresh = true

    render(<UpdatePrompt />)

    const message = screen.getByText('新版本已经准备好。')
    const updateButton = screen.getByRole('button', { name: '立即更新' })
    expect(message.tagName).toBe('SPAN')
    expect(message).toHaveAttribute('role', 'status')
    expect(message).toHaveAttribute('aria-live', 'polite')
    expect(message).not.toContainElement(updateButton)
    expect(message.parentElement).toContainElement(updateButton)
  })

  it('稍后清除 needRefresh 状态', async () => {
    const user = userEvent.setup()
    swMocks.needRefresh = true
    render(<UpdatePrompt />)

    await user.click(screen.getByRole('button', { name: '稍后' }))

    expect(swMocks.setNeedRefresh).toHaveBeenCalledWith(false)
  })

  it('立即更新调用激活更新，执行期间禁用两个操作', async () => {
    const user = userEvent.setup()
    let resolveUpdate: (() => void) | undefined
    swMocks.needRefresh = true
    swMocks.updateServiceWorker.mockReturnValue(new Promise<void>((resolve) => {
      resolveUpdate = resolve
    }))
    render(<UpdatePrompt />)

    await user.click(screen.getByRole('button', { name: '立即更新' }))

    expect(swMocks.updateServiceWorker).toHaveBeenCalledWith(true)
    expect(screen.getByRole('button', { name: '稍后' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '更新中…' })).toBeDisabled()

    resolveUpdate?.()
    await waitFor(() => expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled())
  })

  it('异步更新失败显示非阻塞错误并允许再次重试', async () => {
    const user = userEvent.setup()
    swMocks.needRefresh = true
    swMocks.updateServiceWorker
      .mockRejectedValueOnce(new Error('service worker activation failed'))
      .mockResolvedValueOnce(undefined)
    render(<UpdatePrompt />)

    await user.click(screen.getByRole('button', { name: '立即更新' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('更新失败，请稍后重试。')
    expect(screen.getByRole('button', { name: '立即更新' })).toBeEnabled()
    await user.click(screen.getByRole('button', { name: '立即更新' }))
    expect(swMocks.updateServiceWorker).toHaveBeenCalledTimes(2)
    expect(swMocks.updateServiceWorker).toHaveBeenNthCalledWith(2, true)
  })

  it('updateServiceWorker 同步抛出的编程错误不会被转成平台失败提示', () => {
    const programmingError = new Error('unexpected synchronous failure')
    const reportedErrors: unknown[] = []
    const handleWindowError = (event: ErrorEvent): void => {
      event.preventDefault()
      reportedErrors.push(event.error)
    }
    swMocks.needRefresh = true
    swMocks.updateServiceWorker.mockImplementation(() => {
      throw programmingError
    })
    render(<UpdatePrompt />)

    window.addEventListener('error', handleWindowError)
    try {
      fireEvent.click(screen.getByRole('button', { name: '立即更新' }))
    } finally {
      window.removeEventListener('error', handleWindowError)
    }

    expect(reportedErrors).toEqual([programmingError])
    expect(screen.queryByText('更新失败，请稍后重试。')).not.toBeInTheDocument()
  })
})
