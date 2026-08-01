import {
  createBrowserMusicPreferenceStorage,
  createMusicPreferenceStorage,
} from './musicPreferenceStorage'

const storageKey = 'games.audio.music.v1'

class MemoryStorage implements Storage {
  private value: string | null = null

  getError: unknown = null
  setError: unknown = null

  readonly getItem = vi.fn((key: string): string | null => {
    if (this.getError !== null) throw this.getError
    return key === storageKey ? this.value : null
  })

  readonly setItem = vi.fn((key: string, value: string): void => {
    if (this.setError !== null) throw this.setError
    if (key === storageKey) this.value = value
  })

  clear(): void {
    this.value = null
  }

  key(index: number): string | null {
    return index === 0 && this.value !== null ? storageKey : null
  }

  get length(): number {
    return this.value === null ? 0 : 1
  }

  removeItem(key: string): void {
    if (key === storageKey) this.value = null
  }

  seed(value: string): void {
    this.value = value
  }
}

function withThrowingLocalStorageGetter(action: () => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(window, 'localStorage')
  if (descriptor !== undefined && !descriptor.configurable) {
    throw new Error('NEEDS_CONTEXT: window.localStorage 自有属性不可配置，无法安全模拟 getter 抛错')
  }

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    get(): Storage {
      throw new Error('localStorage 不可访问')
    },
  })

  try {
    action()
  } finally {
    if (descriptor !== undefined) {
      Object.defineProperty(window, 'localStorage', descriptor)
    } else if (!Reflect.deleteProperty(window, 'localStorage')) {
      throw new Error('无法恢复 window.localStorage')
    }
  }
}

describe('music preference storage', () => {
  it('无记录时默认加载为启用', () => {
    const storage = new MemoryStorage()

    expect(createMusicPreferenceStorage(storage).load()).toEqual({ kind: 'loaded', enabled: true })
    expect(storage.getItem).toHaveBeenCalledWith(storageKey)
  })

  it.each([true, false])('加载合法的 version=1 enabled=%s 记录', (enabled) => {
    const storage = new MemoryStorage()
    storage.seed(JSON.stringify({ version: 1, enabled }))

    expect(createMusicPreferenceStorage(storage).load()).toEqual({ kind: 'loaded', enabled })
  })

  it('保存时以固定键写入 version=1 JSON', () => {
    const storage = new MemoryStorage()

    expect(createMusicPreferenceStorage(storage).save(false)).toEqual({ ok: true })
    expect(storage.setItem).toHaveBeenCalledWith(
      storageKey,
      JSON.stringify({ version: 1, enabled: false }),
    )
  })

  it.each([
    { name: '空对象', serialized: JSON.stringify({}) },
    { name: '错误 version', serialized: JSON.stringify({ version: 2, enabled: true }) },
    { name: 'enabled 不是布尔值', serialized: JSON.stringify({ version: 1, enabled: 'true' }) },
    { name: '数组', serialized: JSON.stringify([{ version: 1, enabled: true }]) },
    { name: 'null', serialized: 'null' },
    { name: '损坏 JSON', serialized: '{' },
  ])('拒绝 $name，且 JSON.parse 失败仍归类为 invalid', ({ serialized }) => {
    const storage = new MemoryStorage()
    storage.seed(serialized)

    expect(createMusicPreferenceStorage(storage).load()).toEqual({ kind: 'invalid' })
  })

  it('getItem 抛错时返回 unavailable', () => {
    const storage = new MemoryStorage()
    storage.getError = new Error('读取失败')

    expect(createMusicPreferenceStorage(storage).load()).toEqual({ kind: 'unavailable' })
  })

  it('setItem 抛错时保存失败但不抛出', () => {
    const storage = new MemoryStorage()
    storage.setError = new Error('写入失败')

    expect(createMusicPreferenceStorage(storage).save(true)).toEqual({ ok: false })
  })

  it('localStorage getter 抛错时创建稳定的不可用浏览器端口，并恢复 window 状态', () => {
    withThrowingLocalStorageGetter(() => {
      const storage = createBrowserMusicPreferenceStorage()

      expect(storage.load()).toEqual({ kind: 'unavailable' })
      expect(storage.save(true)).toEqual({ ok: false })
      expect(storage.load()).toEqual({ kind: 'unavailable' })
      expect(storage.save(false)).toEqual({ ok: false })
    })
  })
})
