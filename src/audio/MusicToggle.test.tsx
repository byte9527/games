import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AudioProvider } from './AudioProvider'
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
      </AudioProvider>,
    ),
    engineFactory,
  }
}

describe('MusicToggle', () => {
  it('默认开启时点击关闭音乐并保存偏好', () => {
    const storage = createStorage()
    const engine = createEngine()
    renderMusicToggle({ engine, storage })

    const button = screen.getByRole('button', { name: '关闭音乐' })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('音乐开')

    fireEvent.click(button)

    expect(screen.getByRole('button', { name: '开启音乐' })).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByRole('button', { name: '开启音乐' })).toHaveTextContent('音乐关')
    expect(storage.save).toHaveBeenCalledWith(false)
  })

  it('初始关闭时可用键盘开启音乐并解锁引擎', async () => {
    const user = userEvent.setup()
    const storage = createStorage(false)
    const engine = createEngine()
    renderMusicToggle({ engine, storage })

    await user.tab()
    const button = screen.getByRole('button', { name: '开启音乐' })
    expect(button).toHaveFocus()

    await user.keyboard('{Enter}')

    expect(storage.save).toHaveBeenCalledWith(true)
    await waitFor(() => expect(engine.unlock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '关闭音乐' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: '关闭音乐' })).toHaveTextContent('音乐开')
  })

  it('引擎不可用后显示禁用的无障碍说明', async () => {
    const engine = createEngine({ ok: false, kind: 'unavailable' })
    renderMusicToggle({ engine, storage: createStorage() })

    fireEvent.pointerDown(document)

    await waitFor(() => {
      const button = screen.getByRole('button', { name: '音乐不可用' })
      expect(button).toBeDisabled()
      expect(button).toHaveAccessibleDescription('当前浏览器无法播放音乐。')
    })
  })

  it('多个开关在不可用时各自关联唯一说明', async () => {
    const engine = createEngine({ ok: false, kind: 'unavailable' })
    const engineFactory = vi.fn<MusicEngineFactory>().mockReturnValue(engine)

    render(
      <AudioProvider engineFactory={engineFactory} storage={createStorage()}>
        <MusicToggle />
        <MusicToggle />
      </AudioProvider>,
    )

    fireEvent.pointerDown(document)

    await waitFor(() => expect(screen.getAllByRole('button', { name: '音乐不可用' })).toHaveLength(2))
    const [firstButton, secondButton] = screen.getAllByRole('button', { name: '音乐不可用' })
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
    renderMusicToggle({ engine, storage: createStorage() })

    fireEvent.pointerDown(document)

    await waitFor(() => expect(engine.unlock).toHaveBeenCalledTimes(1))
    const button = screen.getByRole('button', { name: '关闭音乐' })
    expect(button).toBeEnabled()
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveTextContent('音乐开')
  })
})
