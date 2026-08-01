import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioProvider, useAudioController } from './AudioProvider'
import { MusicToggle } from './MusicToggle'
import type { MusicEngineFactory, MusicEnginePort, MusicUnlockResult } from './core/MusicEnginePort'
import type { MusicPreferenceStoragePort } from './storage/musicPreferenceStorage'

function createEngine(unlockResult: MusicUnlockResult = { ok: true }): MusicEnginePort {
  return {
    unlock: vi.fn().mockResolvedValue(unlockResult),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    dispose: vi.fn(() => Promise.resolve()),
  }
}

function createStorage(enabled = true): MusicPreferenceStoragePort {
  return {
    load: vi.fn().mockReturnValue({ kind: 'loaded', enabled }),
    save: vi.fn().mockReturnValue({ ok: true }),
  }
}

function VerifiedActivationHarness() {
  const controller = useAudioController()
  return (
    <button type="button" onClick={() => controller.toggle(true)}>
      已验证可信激活
    </button>
  )
}

function renderMusicToggle({
  engine,
  storage,
}: {
  readonly engine: MusicEnginePort
  readonly storage: MusicPreferenceStoragePort
}) {
  const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)
  return {
    ...render(
      <AudioProvider engineFactory={engineFactory} storage={storage}>
        <MusicToggle />
        <VerifiedActivationHarness />
      </AudioProvider>,
    ),
    engineFactory,
  }
}

describe('MusicToggle', () => {
  it('程序化 element.click() 从关闭切为开启时不创建或解锁引擎', async () => {
    const storage = createStorage(false)
    const engine = createEngine()
    const { engineFactory } = renderMusicToggle({ engine, storage })

    await act(async () => {
      screen.getByRole('button', { name: '音乐' }).click()
      await Promise.resolve()
    })

    expect(storage.save).toHaveBeenCalledWith(true)
    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '音乐' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('默认开启时点击关闭音乐并保存偏好且不创建引擎', async () => {
    const user = userEvent.setup()
    const storage = createStorage()
    const engine = createEngine()
    const { engineFactory } = renderMusicToggle({ engine, storage })

    const button = screen.getByRole('button', { name: '音乐' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('音乐开')

    await user.click(button)

    expect(screen.getByRole('button', { name: '音乐' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '音乐' })).toHaveTextContent('音乐关')
    expect(storage.save).toHaveBeenCalledWith(false)
    expect(engineFactory).not.toHaveBeenCalled()
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(engine.play).not.toHaveBeenCalled()
  })

  it('单元测试合成的 Enter 可切换偏好但不会解锁引擎', async () => {
    const user = userEvent.setup()
    const storage = createStorage(false)
    const engine = createEngine()
    renderMusicToggle({ engine, storage })

    await user.tab()
    const button = screen.getByRole('button', { name: '音乐' })
    expect(button).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(storage.save).toHaveBeenCalledWith(true)
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '音乐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '音乐' })).toHaveTextContent('音乐开')
  })

  it('单元测试合成的 Space 可切换偏好但不会解锁引擎', async () => {
    const user = userEvent.setup()
    const storage = createStorage(false)
    const engine = createEngine()
    renderMusicToggle({ engine, storage })

    await user.tab()
    await user.keyboard(' ')

    expect(storage.save).toHaveBeenCalledWith(true)
    expect(engine.unlock).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: '音乐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '音乐' })).toHaveTextContent('音乐开')
  })

  it('引擎不可用后显示禁用的无障碍说明', async () => {
    const engine = createEngine({ ok: false, kind: 'unavailable' })
    renderMusicToggle({ engine, storage: createStorage(false) })

    fireEvent.click(screen.getByRole('button', { name: '已验证可信激活' }))

    await waitFor(() => {
      const button = screen.getByRole('button', { name: '音乐' })
      expect(button).toBeDisabled()
      expect(button).toHaveAttribute('aria-pressed', 'true')
      expect(button).toHaveTextContent('音乐不可用')
      expect(button).toHaveAccessibleDescription('当前浏览器无法播放音乐。')
    })
  })

  it('多个开关在不可用时各自关联唯一说明', async () => {
    const engine = createEngine({ ok: false, kind: 'unavailable' })
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage(false)}>
        <MusicToggle />
        <MusicToggle />
        <VerifiedActivationHarness />
      </AudioProvider>,
    )

    fireEvent.click(screen.getByRole('button', { name: '已验证可信激活' }))

    await waitFor(() => {
      const buttons = screen.getAllByRole('button', { name: '音乐' })
      expect(buttons).toHaveLength(2)
      expect(buttons.every((button) => button.textContent === '音乐不可用')).toBe(true)
    })
    const [firstButton, secondButton] = screen.getAllByRole('button', { name: '音乐' })
    if (firstButton === undefined || secondButton === undefined) {
      throw new Error('预期存在两个音乐开关')
    }
    const firstDescriptionId = firstButton.getAttribute('aria-describedby')
    const secondDescriptionId = secondButton.getAttribute('aria-describedby')
    if (firstDescriptionId === null || secondDescriptionId === null) {
      throw new Error('预期每个音乐开关都关联不可用说明')
    }

    expect(firstDescriptionId).not.toBe(secondDescriptionId)
    expect(firstButton).toHaveAccessibleDescription('当前浏览器无法播放音乐。')
    expect(secondButton).toHaveAccessibleDescription('当前浏览器无法播放音乐。')
    expect(document.getElementById(firstDescriptionId)).toHaveTextContent('当前浏览器无法播放音乐。')
    expect(document.getElementById(secondDescriptionId)).toHaveTextContent('当前浏览器无法播放音乐。')
  })

  it('解锁被阻止时仍保持可操作的开启状态', async () => {
    const engine = createEngine({ ok: false, kind: 'blocked' })
    renderMusicToggle({ engine, storage: createStorage(false) })

    fireEvent.click(screen.getByRole('button', { name: '已验证可信激活' }))

    await waitFor(() => expect(engine.unlock).toHaveBeenCalledTimes(1))
    const button = screen.getByRole('button', { name: '音乐' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('音乐开')
  })
})
