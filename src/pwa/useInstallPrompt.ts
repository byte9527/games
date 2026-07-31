import { useCallback, useEffect, useRef, useState } from 'react'

export type InstallResult = 'accepted' | 'dismissed' | 'unavailable'

interface InstallChoice {
  readonly outcome: 'accepted' | 'dismissed'
}

interface InstallPromptEvent extends Event {
  readonly prompt: () => unknown
  readonly userChoice: PromiseLike<unknown>
}

export interface InstallPromptState {
  readonly installed: boolean
  readonly canPrompt: boolean
  readonly install: () => Promise<InstallResult>
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null
}

function hasThen(value: unknown): value is PromiseLike<unknown> {
  return isObject(value) && 'then' in value && typeof value.then === 'function'
}

function isInstallPromptEvent(event: Event): event is InstallPromptEvent {
  return 'prompt' in event &&
    typeof event.prompt === 'function' &&
    'userChoice' in event &&
    hasThen(event.userChoice)
}

function isInstallChoice(value: unknown): value is InstallChoice {
  if (!isObject(value) || !('outcome' in value)) return false
  return value.outcome === 'accepted' || value.outcome === 'dismissed'
}

function isStandalone(): boolean {
  const displayModeStandalone = window.matchMedia('(display-mode: standalone)').matches
  const iosStandalone = 'standalone' in navigator && navigator.standalone === true
  return displayModeStandalone || iosStandalone
}

export function useInstallPrompt(): InstallPromptState {
  const [installed, setInstalled] = useState(isStandalone)
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null)
  const promptEventRef = useRef<InstallPromptEvent | null>(null)
  const installingRef = useRef(false)

  const clearPromptEvent = useCallback((): void => {
    promptEventRef.current = null
    setPromptEvent(null)
  }, [])

  useEffect(() => {
    const handleBeforeInstallPrompt = (event: Event): void => {
      if (!isInstallPromptEvent(event)) return
      event.preventDefault()
      promptEventRef.current = event
      setPromptEvent(event)
    }
    const handleInstalled = (): void => {
      setInstalled(true)
      clearPromptEvent()
    }

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
    window.addEventListener('appinstalled', handleInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt)
      window.removeEventListener('appinstalled', handleInstalled)
    }
  }, [clearPromptEvent])

  const install = useCallback(async (): Promise<InstallResult> => {
    const event = promptEventRef.current
    if (installed || event === null || installingRef.current) return 'unavailable'

    installingRef.current = true
    try {
      await event.prompt()
      const choice = await event.userChoice
      return isInstallChoice(choice) ? choice.outcome : 'unavailable'
    } catch {
      return 'unavailable'
    } finally {
      installingRef.current = false
      clearPromptEvent()
    }
  }, [clearPromptEvent, installed])

  return {
    installed,
    canPrompt: !installed && promptEvent !== null,
    install,
  }
}
