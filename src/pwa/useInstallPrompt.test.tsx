import { act, renderHook } from '@testing-library/react'
import { StrictMode, type ReactNode } from 'react'

import { useInstallPrompt } from './useInstallPrompt'

type ChoiceOutcome = 'accepted' | 'dismissed'

class InstallPromptEventStub extends Event {
  readonly prompt: ReturnType<typeof vi.fn>
  readonly userChoice: Promise<{ outcome: ChoiceOutcome }>

  constructor({
    outcome = 'accepted',
    prompt = vi.fn().mockResolvedValue(undefined),
    userChoice,
  }: {
    readonly outcome?: ChoiceOutcome
    readonly prompt?: ReturnType<typeof vi.fn>
    readonly userChoice?: Promise<{ outcome: ChoiceOutcome }>
  } = {}) {
    super('beforeinstallprompt', { cancelable: true })
    this.prompt = prompt
    this.userChoice = userChoice ?? Promise.resolve({ outcome })
  }
}

function dispatchInstallPrompt(event = new InstallPromptEventStub()): InstallPromptEventStub {
  act(() => window.dispatchEvent(event))
  return event
}

function setStandaloneMedia(matches: boolean): void {
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

describe('useInstallPrompt', () => {
  beforeEach(() => {
    setStandaloneMedia(false)
    Reflect.deleteProperty(navigator, 'standalone')
  })

  afterEach(() => {
    Reflect.deleteProperty(navigator, 'standalone')
    vi.restoreAllMocks()
  })

  it('捕获有效安装事件、阻止浏览器默认提示并开放安装能力', () => {
    const { result } = renderHook(() => useInstallPrompt())

    const event = dispatchInstallPrompt()

    expect(event.defaultPrevented).toBe(true)
    expect(result.current.canPrompt).toBe(true)
    expect(result.current.installed).toBe(false)
  })

  it('忽略缺少安装能力的同名事件且不阻止默认行为', () => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = new Event('beforeinstallprompt', { cancelable: true })

    act(() => window.dispatchEvent(event))

    expect(event.defaultPrevented).toBe(false)
    expect(result.current.canPrompt).toBe(false)
  })

  it.each([
    ['accepted', 'accepted'],
    ['dismissed', 'dismissed'],
  ] as const)('返回 %s 并清除不可复用的一次性事件', async (outcome, expected) => {
    const { result } = renderHook(() => useInstallPrompt())
    const event = dispatchInstallPrompt(new InstallPromptEventStub({ outcome }))

    let installResult: Awaited<ReturnType<typeof result.current.install>> | undefined
    await act(async () => {
      installResult = await result.current.install()
    })

    expect(installResult).toBe(expected)
    expect(event.prompt).toHaveBeenCalledTimes(1)
    expect(result.current.canPrompt).toBe(false)
  })

  it('没有事件时返回 unavailable', async () => {
    const { result } = renderHook(() => useInstallPrompt())

    await expect(result.current.install()).resolves.toBe('unavailable')
  })

  it('安装执行期间拒绝并发重复 prompt', async () => {
    let resolvePrompt: (() => void) | undefined
    const promptPromise = new Promise<void>((resolve) => {
      resolvePrompt = resolve
    })
    const event = new InstallPromptEventStub({
      prompt: vi.fn().mockReturnValue(promptPromise),
    })
    const { result } = renderHook(() => useInstallPrompt())
    dispatchInstallPrompt(event)

    let firstInstall: Promise<ChoiceOutcome | 'unavailable'> | undefined
    act(() => {
      firstInstall = result.current.install()
    })
    await expect(result.current.install()).resolves.toBe('unavailable')

    await act(async () => {
      resolvePrompt?.()
      await firstInstall
    })
    expect(event.prompt).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['prompt 拒绝', () => new InstallPromptEventStub({
      prompt: vi.fn().mockRejectedValue(new Error('prompt unavailable')),
    })],
    ['userChoice 拒绝', () => new InstallPromptEventStub({
      userChoice: Promise.reject(new Error('choice unavailable')),
    })],
  ])('%s 时返回 unavailable、清除事件且不产生未处理拒绝', async (_name, createEvent) => {
    const { result } = renderHook(() => useInstallPrompt())
    dispatchInstallPrompt(createEvent())

    let installResult: Awaited<ReturnType<typeof result.current.install>> | undefined
    await act(async () => {
      installResult = await result.current.install()
    })
    expect(installResult).toBe('unavailable')
    expect(result.current.canPrompt).toBe(false)
  })

  it('appinstalled 后标记已安装并清除待处理事件', () => {
    const { result } = renderHook(() => useInstallPrompt())
    dispatchInstallPrompt()

    act(() => window.dispatchEvent(new Event('appinstalled')))

    expect(result.current.installed).toBe(true)
    expect(result.current.canPrompt).toBe(false)
  })

  it.each([
    ['standalone display mode', () => setStandaloneMedia(true)],
    ['iOS navigator.standalone', () => {
      Object.defineProperty(navigator, 'standalone', { configurable: true, value: true })
    }],
  ])('%s 下初始状态为已安装', (_name, prepare) => {
    prepare()

    const { result } = renderHook(() => useInstallPrompt())

    expect(result.current.installed).toBe(true)
    expect(result.current.canPrompt).toBe(false)
  })

  it('已处于 standalone 时即使收到事件也返回 unavailable 且不调用 prompt', async () => {
    setStandaloneMedia(true)
    const { result } = renderHook(() => useInstallPrompt())
    const event = dispatchInstallPrompt()

    let installResult: Awaited<ReturnType<typeof result.current.install>> | undefined
    await act(async () => {
      installResult = await result.current.install()
    })

    expect(installResult).toBe('unavailable')
    expect(event.prompt).not.toHaveBeenCalled()
    expect(result.current.installed).toBe(true)
  })

  it('StrictMode 下每个已注册监听器都在卸载时由同一引用完整清理', () => {
    const addEventListener = vi.spyOn(window, 'addEventListener')
    const removeEventListener = vi.spyOn(window, 'removeEventListener')
    const wrapper = ({ children }: { readonly children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    )

    const { unmount } = renderHook(() => useInstallPrompt(), { wrapper })
    unmount()

    for (const eventType of ['beforeinstallprompt', 'appinstalled']) {
      const added = addEventListener.mock.calls
        .filter(([type]) => type === eventType)
        .map(([, listener]) => listener)
      const removed = removeEventListener.mock.calls
        .filter(([type]) => type === eventType)
        .map(([, listener]) => listener)
      expect(added.length).toBeGreaterThan(0)
      expect(removed).toEqual(added)
    }
  })
})
