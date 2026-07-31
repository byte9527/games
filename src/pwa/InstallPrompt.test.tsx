import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { InstallPrompt } from './InstallPrompt'

class InstallPromptEventStub extends Event {
  readonly prompt: ReturnType<typeof vi.fn>
  readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>

  constructor({
    outcome = 'accepted',
    prompt = vi.fn().mockResolvedValue(undefined),
  }: {
    readonly outcome?: 'accepted' | 'dismissed'
    readonly prompt?: ReturnType<typeof vi.fn>
  } = {}) {
    super('beforeinstallprompt', { cancelable: true })
    this.prompt = prompt
    this.userChoice = Promise.resolve({ outcome })
  }
}

function setStandalone(matches: boolean): void {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' && matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

function dispatchInstallPrompt(event = new InstallPromptEventStub()): InstallPromptEventStub {
  act(() => window.dispatchEvent(event))
  return event
}

describe('InstallPrompt', () => {
  beforeEach(() => {
    setStandalone(false)
    Reflect.deleteProperty(navigator, 'standalone')
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'standalone')
    vi.restoreAllMocks()
  })

  it('已安装时不显示入口', () => {
    setStandalone(true)

    render(<InstallPrompt />)

    expect(screen.queryByRole('button', { name: /安装|如何安装/ })).not.toBeInTheDocument()
  })

  it('捕获原生提示后显示安装按钮，执行期间禁用并避免重复调用', async () => {
    const user = userEvent.setup()
    let resolvePrompt: (() => void) | undefined
    const prompt = vi.fn().mockReturnValue(new Promise<void>((resolve) => {
      resolvePrompt = resolve
    }))
    render(<InstallPrompt />)
    const event = dispatchInstallPrompt(new InstallPromptEventStub({
      outcome: 'dismissed',
      prompt,
    }))
    const installButton = screen.getByRole('button', { name: '安装到桌面' })

    await user.click(installButton)

    expect(screen.getByRole('button', { name: '安装中…' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '安装中…' }))
    expect(event.prompt).toHaveBeenCalledTimes(1)

    act(() => resolvePrompt?.())
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '如何安装' })).toBeEnabled()
    })
  })

  it('用户拒绝原生安装后回到手动安装入口', async () => {
    const user = userEvent.setup()
    render(<InstallPrompt />)
    dispatchInstallPrompt(new InstallPromptEventStub({ outcome: 'dismissed' }))

    await user.click(screen.getByRole('button', { name: '安装到桌面' }))

    expect(await screen.findByRole('button', { name: '如何安装' })).toBeEnabled()
  })

  it('iOS 显示精确 Safari 安装说明', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)')
    render(<InstallPrompt />)
    const trigger = screen.getByRole('button', { name: '如何安装' })

    await user.click(trigger)

    const dialog = screen.getByRole('dialog', { name: '安装说明' })
    expect(dialog).toHaveTextContent('请在 Safari 中打开分享菜单，然后选择“添加到主屏幕”。')
    expect(screen.getByRole('button', { name: '知道了' })).toHaveFocus()
  })

  it('其他平台显示精确浏览器菜单安装说明', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (X11; Linux x86_64)')
    render(<InstallPrompt />)

    await user.click(screen.getByRole('button', { name: '如何安装' }))

    expect(screen.getByRole('dialog', { name: '安装说明' }))
      .toHaveTextContent('请打开浏览器菜单，然后选择“安装应用”或“添加到主屏幕”。')
  })

  it('安装说明通过 Escape 关闭并恢复入口焦点', async () => {
    const user = userEvent.setup()
    render(<InstallPrompt />)
    const trigger = screen.getByRole('button', { name: '如何安装' })

    await user.click(trigger)
    await user.keyboard('{Escape}')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveFocus()
  })
})
