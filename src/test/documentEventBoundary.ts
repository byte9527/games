type DocumentListenerCall = readonly [
  type: string,
  listener: EventListenerOrEventListenerObject,
  options?: boolean | AddEventListenerOptions,
]

export interface DocumentEventBoundary {
  countActiveCaptureListeners(type: string): number
  dispatchTrustedCapture(type: string, target: EventTarget): void
  restore(): void
}

function usesCapture(options: boolean | AddEventListenerOptions | undefined): boolean {
  return options === true || (typeof options === 'object' && options.capture === true)
}

function invokeListener(
  listener: EventListenerOrEventListenerObject,
  event: Event,
): void {
  if (typeof listener === 'function') {
    listener.call(document, event)
  } else {
    listener.handleEvent(event)
  }
}

function createTrustedPlatformEvent(type: string, target: EventTarget): Event {
  const event = Object.create(Event.prototype) as Event
  Object.defineProperties(event, {
    isTrusted: { value: true },
    target: { value: target },
    type: { value: type },
  })
  return event
}

export function observeDocumentEventBoundary(): DocumentEventBoundary {
  const addEventListener = vi.spyOn(document, 'addEventListener')
  const removeEventListener = vi.spyOn(document, 'removeEventListener')

  const activeCaptureListeners = (type: string): readonly EventListenerOrEventListenerObject[] => {
    const balances = new Map<EventListenerOrEventListenerObject, number>()

    for (const [callType, listener, options] of addEventListener.mock.calls as DocumentListenerCall[]) {
      if (callType === type && usesCapture(options)) {
        balances.set(listener, (balances.get(listener) ?? 0) + 1)
      }
    }
    for (const [callType, listener, options] of removeEventListener.mock.calls as DocumentListenerCall[]) {
      if (callType === type && usesCapture(options)) {
        balances.set(listener, (balances.get(listener) ?? 0) - 1)
      }
    }

    return [...balances.entries()]
      .filter(([, balance]) => balance > 0)
      .map(([listener]) => listener)
  }

  return {
    countActiveCaptureListeners(type) {
      return activeCaptureListeners(type).length
    },

    dispatchTrustedCapture(type, target) {
      const activeListeners = activeCaptureListeners(type)
      if (activeListeners.length === 0) {
        throw new Error(`document 上没有活动的 ${type} capture listener`)
      }

      const event = createTrustedPlatformEvent(type, target)
      for (const listener of activeListeners) invokeListener(listener, event)
    },

    restore() {
      addEventListener.mockRestore()
      removeEventListener.mockRestore()
    },
  }
}
