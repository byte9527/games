import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
  type SetStateAction,
} from 'react'
import { createPortal } from 'react-dom'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface ModalRegistration {
  readonly dialogRef: RefObject<HTMLElement | null>
  readonly initialFocusRef: RefObject<HTMLElement | null>
  readonly restoreFocusRef?: RefObject<HTMLElement | null>
  readonly setTop: Dispatch<SetStateAction<boolean>>
}

interface BackgroundSnapshot {
  readonly ariaHidden: string | null
  readonly inert: boolean
}

interface ModalSession {
  readonly backgrounds: Map<HTMLElement, BackgroundSnapshot>
  readonly finalFocus: HTMLElement | null
}

interface UnregisterResult {
  readonly wasTop: boolean
  readonly finalFocus: HTMLElement | null
}

const modalStack: ModalRegistration[] = []
let modalSession: ModalSession | null = null

function topModal(): ModalRegistration | undefined {
  return modalStack.at(-1)
}

function focusTopModal(): void {
  topModal()?.initialFocusRef.current?.focus()
}

function containFocusInTopModal(event: FocusEvent): void {
  const top = topModal()
  const dialog = top?.dialogRef.current
  if (top === undefined || dialog === null || dialog === undefined ||
    !(event.target instanceof Node) || dialog.contains(event.target)) {
    return
  }
  top.initialFocusRef.current?.focus()
}

function updateTopState(): void {
  const top = topModal()
  for (const registration of modalStack) registration.setTop(registration === top)
}

function captureBackgroundLayers(session: ModalSession): void {
  for (const child of document.body.children) {
    if (!(child instanceof HTMLElement) || child.hasAttribute('data-modal-layer') ||
      session.backgrounds.has(child)) {
      continue
    }
    session.backgrounds.set(child, {
      ariaHidden: child.getAttribute('aria-hidden'),
      inert: child.hasAttribute('inert'),
    })
    child.setAttribute('aria-hidden', 'true')
    child.setAttribute('inert', '')
  }
}

function startModalSession(registration: ModalRegistration): ModalSession {
  const requestedFinalFocus = registration.restoreFocusRef?.current ?? document.activeElement
  const session: ModalSession = {
    backgrounds: new Map(),
    finalFocus: requestedFinalFocus instanceof HTMLElement ? requestedFinalFocus : null,
  }
  modalSession = session
  document.addEventListener('focusin', containFocusInTopModal)
  return session
}

function finishModalSession(): HTMLElement | null {
  const session = modalSession
  modalSession = null
  document.removeEventListener('focusin', containFocusInTopModal)
  if (session === null) return null

  for (const [background, snapshot] of session.backgrounds) {
    if (snapshot.ariaHidden === null) background.removeAttribute('aria-hidden')
    else background.setAttribute('aria-hidden', snapshot.ariaHidden)
    if (snapshot.inert) background.setAttribute('inert', '')
    else background.removeAttribute('inert')
  }
  return session.finalFocus
}

function registerModal(registration: ModalRegistration): void {
  const session = modalStack.length === 0
    ? startModalSession(registration)
    : modalSession
  if (session === null) throw new Error('Modal stack is missing its active session')
  captureBackgroundLayers(session)
  modalStack.push(registration)
  updateTopState()
}

function unregisterModal(registration: ModalRegistration): UnregisterResult {
  const index = modalStack.indexOf(registration)
  if (index < 0) return { wasTop: false, finalFocus: null }

  const wasTop = index === modalStack.length - 1
  modalStack.splice(index, 1)
  updateTopState()
  return {
    wasTop,
    finalFocus: modalStack.length === 0 ? finishModalSession() : null,
  }
}

function focusableElements(dialog: HTMLElement): HTMLElement[] {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
    .filter((element) => element.getAttribute('aria-hidden') !== 'true')
}

function canRestoreFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false
  if (element instanceof HTMLButtonElement) return !element.disabled
  if (element instanceof HTMLInputElement) return !element.disabled
  if (element instanceof HTMLSelectElement) return !element.disabled
  if (element instanceof HTMLTextAreaElement) return !element.disabled
  if (element instanceof HTMLAnchorElement) return element.hasAttribute('href')
  return element.tabIndex >= 0 || element.isContentEditable
}

export function ModalDialog({
  title,
  initialFocusRef,
  restoreFocusRef,
  onEscape,
  children,
}: {
  readonly title: string
  readonly initialFocusRef: RefObject<HTMLElement | null>
  readonly restoreFocusRef?: RefObject<HTMLElement | null>
  readonly onEscape?: () => void
  readonly children: ReactNode
}) {
  const titleId = useId()
  const dialogRef = useRef<HTMLElement>(null)
  const effectVersionRef = useRef(0)
  const hasCapturedFocusRef = useRef(false)
  const previouslyFocusedRef = useRef<HTMLElement | null>(null)
  const [isTop, setIsTop] = useState(false)
  const registration = useMemo<ModalRegistration>(() => ({
    dialogRef,
    initialFocusRef,
    restoreFocusRef,
    setTop: setIsTop,
  }), [initialFocusRef, restoreFocusRef])

  useLayoutEffect(() => {
    const effectVersion = effectVersionRef.current + 1
    effectVersionRef.current = effectVersion
    if (!hasCapturedFocusRef.current) {
      hasCapturedFocusRef.current = true
      const activeElement = restoreFocusRef === undefined
        ? document.activeElement
        : restoreFocusRef.current
      previouslyFocusedRef.current = activeElement instanceof HTMLElement &&
        dialogRef.current?.contains(activeElement) !== true
        ? activeElement
        : null
    }

    registerModal(registration)

    return () => {
      const { wasTop, finalFocus } = unregisterModal(registration)
      queueMicrotask(() => {
        if (effectVersionRef.current !== effectVersion) return
        if (finalFocus !== null && canRestoreFocus(finalFocus)) {
          finalFocus.focus()
          return
        }
        if (!wasTop) return
        const previouslyFocused = previouslyFocusedRef.current
        if (previouslyFocused !== null && canRestoreFocus(previouslyFocused)) previouslyFocused.focus()
        else focusTopModal()
      })
    }
  }, [registration, restoreFocusRef])

  useLayoutEffect(() => {
    if (isTop) initialFocusRef.current?.focus()
  }, [initialFocusRef, isTop])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
    if (!isTop) return
    if (event.key === 'Escape' && onEscape !== undefined) {
      event.preventDefault()
      onEscape()
      return
    }

    if (event.key !== 'Tab') return
    const dialog = dialogRef.current
    if (dialog === null) return

    const elements = focusableElements(dialog)
    const firstElement = elements[0]
    const lastElement = elements.at(-1)
    if (firstElement === undefined || lastElement === undefined) {
      event.preventDefault()
      return
    }

    const activeElement = document.activeElement
    const shouldWrapBackward = event.shiftKey && activeElement === firstElement
    const shouldWrapForward = !event.shiftKey && activeElement === lastElement
    const focusIsOutside = !(activeElement instanceof Node) || !dialog.contains(activeElement)

    if (!shouldWrapBackward && !shouldWrapForward && !focusIsOutside) return

    event.preventDefault()
    if (event.shiftKey) lastElement.focus()
    else firstElement.focus()
  }

  return createPortal(
    <div
      aria-hidden={isTop ? undefined : true}
      className="dialog-backdrop"
      data-modal-layer=""
      inert={isTop ? undefined : true}
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal={isTop}
        className="dialog-card"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>,
    document.body,
  )
}
