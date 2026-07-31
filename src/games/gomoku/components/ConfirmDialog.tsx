import {
  useId,
  useLayoutEffect,
  useRef,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

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

    initialFocusRef.current?.focus()

    return () => {
      queueMicrotask(() => {
        if (effectVersionRef.current !== effectVersion) return
        const previouslyFocused = previouslyFocusedRef.current
        if (previouslyFocused !== null && canRestoreFocus(previouslyFocused)) {
          previouslyFocused.focus()
        }
      })
    }
  }, [initialFocusRef, restoreFocusRef])

  function handleKeyDown(event: KeyboardEvent<HTMLElement>): void {
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

  return (
    <div
      className="dialog-backdrop"
      role="presentation"
    >
      <section
        aria-labelledby={titleId}
        aria-modal="true"
        className="dialog-card"
        onKeyDown={handleKeyDown}
        ref={dialogRef}
        role="dialog"
      >
        <h2 id={titleId}>{title}</h2>
        {children}
      </section>
    </div>
  )
}

export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
}: {
  readonly open: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => void
}) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null)

  if (!open) return null

  return (
    <ModalDialog
      initialFocusRef={cancelButtonRef}
      onEscape={onCancel}
      title="重新开始本局？"
    >
      <p>当前棋局会被清除。</p>
      <div className="dialog-actions">
        <button type="button" onClick={onCancel} ref={cancelButtonRef}>
          取消
        </button>
        <button type="button" onClick={onConfirm}>
          确认重新开始
        </button>
      </div>
    </ModalDialog>
  )
}
