import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createDefaultMusicEngine } from './browser/createBrowserMusicEngine'
import type { MusicEngineFactory, MusicEnginePort } from './core/MusicEnginePort'
import { type MusicScore, validateMusicScore } from './core/musicScore'
import {
  createBrowserMusicPreferenceStorage,
  type MusicPreferenceLoadResult,
  type MusicPreferenceStoragePort,
} from './storage/musicPreferenceStorage'

export interface AudioController {
  readonly enabled: boolean
  readonly availability: 'locked' | 'ready' | 'unavailable'
  readonly notice: string | null
  toggle(): void
  dismissNotice(): void
  setGameMusic(score: MusicScore, active: boolean): () => void
}

interface AudioProviderProps {
  readonly children: ReactNode
  readonly engineFactory?: MusicEngineFactory
  readonly storage?: MusicPreferenceStoragePort
}

interface MusicScene {
  readonly score: MusicScore
  readonly active: boolean
  readonly token: symbol
}

interface InitialPreference {
  readonly enabled: boolean
  readonly notice: string | null
}

const AudioContext = createContext<AudioController | null>(null)

function resolveInitialPreference(result: MusicPreferenceLoadResult): InitialPreference {
  switch (result.kind) {
    case 'loaded':
      return { enabled: result.enabled, notice: null }
    case 'invalid':
      return { enabled: true, notice: '音乐设置已失效，本次使用默认开启。' }
    case 'unavailable':
      return { enabled: true, notice: '无法读取音乐设置，本次使用默认开启。' }
  }
}

function reportUnexpectedError(error: unknown): void {
  queueMicrotask(() => {
    throw error
  })
}

export function AudioProvider({ children, engineFactory, storage }: AudioProviderProps) {
  const storageRef = useRef<MusicPreferenceStoragePort | null>(null)
  if (storageRef.current === null) {
    storageRef.current = storage ?? createBrowserMusicPreferenceStorage()
  }
  const storageAdapter = storageRef.current

  const [initialPreference] = useState(() => resolveInitialPreference(storageAdapter.load()))
  const [enabled, setEnabled] = useState(initialPreference.enabled)
  const [availability, setAvailability] = useState<AudioController['availability']>('locked')
  const [notice, setNotice] = useState<string | null>(initialPreference.notice)
  const [scene, setScene] = useState<MusicScene | null>(null)
  const [pageVisible, setPageVisible] = useState(() => document.visibilityState !== 'hidden')

  const enabledRef = useRef(enabled)
  const availabilityRef = useRef<AudioController['availability']>(availability)
  const sceneRef = useRef<MusicScene | null>(null)
  const engineRef = useRef<MusicEnginePort | null>(null)
  const unlockPromiseRef = useRef<Promise<void> | null>(null)
  const engineFactoryRef = useRef<MusicEngineFactory>(engineFactory ?? createDefaultMusicEngine)
  const disposedRef = useRef(false)
  engineFactoryRef.current = engineFactory ?? createDefaultMusicEngine

  const updateAvailability = useCallback((nextAvailability: AudioController['availability']) => {
    availabilityRef.current = nextAvailability
    setAvailability(nextAvailability)
  }, [])

  const ensureUnlocked = useCallback((): Promise<void> => {
    if (availabilityRef.current !== 'locked') return Promise.resolve()

    const pendingUnlock = unlockPromiseRef.current
    if (pendingUnlock !== null) return pendingUnlock

    let engine = engineRef.current
    if (engine === null) {
      engine = engineFactoryRef.current()
      if (engine === null) {
        if (!disposedRef.current) {
          updateAvailability('unavailable')
          setNotice('当前浏览器无法播放音乐。')
        }
        return Promise.resolve()
      }
      engineRef.current = engine
    }

    const unlock = engine.unlock().then((result) => {
      if (disposedRef.current) return

      if (result.ok) {
        updateAvailability('ready')
      } else if (result.kind === 'unavailable') {
        updateAvailability('unavailable')
        setNotice('当前浏览器无法播放音乐。')
      }
    })
    const trackedUnlock = unlock.finally(() => {
      if (unlockPromiseRef.current === trackedUnlock) unlockPromiseRef.current = null
    })
    unlockPromiseRef.current = trackedUnlock
    return trackedUnlock
  }, [updateAvailability])

  const toggle = useCallback(() => {
    const nextEnabled = !enabledRef.current
    enabledRef.current = nextEnabled
    setEnabled(nextEnabled)

    if (!storageAdapter.save(nextEnabled).ok) {
      setNotice('无法保存音乐设置，刷新后可能恢复默认值。')
    }

    if (nextEnabled) {
      void ensureUnlocked().catch(reportUnexpectedError)
    }
  }, [ensureUnlocked, storageAdapter])

  const dismissNotice = useCallback(() => {
    setNotice(null)
  }, [])

  const setGameMusic = useCallback((scoreToRegister: MusicScore, active: boolean) => {
    const validation = validateMusicScore(scoreToRegister)
    if (!validation.ok) {
      engineRef.current?.stop()
      sceneRef.current = null
      setScene(null)
      setNotice(`曲目配置无效：${validation.message}`)
      return () => undefined
    }

    const token = Symbol(scoreToRegister.id)
    const nextScene = { score: scoreToRegister, active, token }
    sceneRef.current = nextScene
    setScene(nextScene)

    return () => {
      if (sceneRef.current?.token !== token) return
      sceneRef.current = null
      setScene((currentScene) => (currentScene?.token === token ? null : currentScene))
    }
  }, [])

  useEffect(() => {
    disposedRef.current = false

    return () => {
      disposedRef.current = true
      unlockPromiseRef.current = null
      const engine = engineRef.current
      engineRef.current = null
      if (engine !== null) {
        engine.stop()
        void engine.dispose().catch(reportUnexpectedError)
      }
    }
  }, [])

  useEffect(() => {
    if (!enabled || availability !== 'locked') return

    const requestUnlock = () => {
      void ensureUnlocked().catch(reportUnexpectedError)
    }
    document.addEventListener('pointerdown', requestUnlock, true)
    document.addEventListener('keydown', requestUnlock, true)

    return () => {
      document.removeEventListener('pointerdown', requestUnlock, true)
      document.removeEventListener('keydown', requestUnlock, true)
    }
  }, [availability, enabled, ensureUnlocked])

  useEffect(() => {
    const handleVisibilityChange = () => {
      setPageVisible(document.visibilityState !== 'hidden')
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  useEffect(() => {
    const engine = engineRef.current
    if (availability !== 'ready' || engine === null) return

    if (!enabled || !pageVisible) {
      engine.pause(scene?.score.fadeSeconds ?? 0)
    } else if (scene === null) {
      engine.stop()
    } else if (scene.active) {
      engine.play(scene.score)
    } else {
      engine.pause(scene.score.fadeSeconds)
    }
  }, [availability, enabled, pageVisible, scene])

  const controller = useMemo<AudioController>(
    () => ({ enabled, availability, notice, toggle, dismissNotice, setGameMusic }),
    [availability, dismissNotice, enabled, notice, setGameMusic, toggle],
  )

  return <AudioContext.Provider value={controller}>{children}</AudioContext.Provider>
}

export function useAudioController(): AudioController {
  const controller = useContext(AudioContext)
  if (controller === null) throw new Error('useAudioController 必须在 AudioProvider 内使用')
  return controller
}
