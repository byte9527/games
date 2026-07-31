export function NoticeBanner({
  message,
  onDismiss,
}: {
  readonly message: string | null
  readonly onDismiss: () => void
}) {
  if (message === null) return null

  return (
    <div className="notice-banner" role="status">
      <span>{message}</span>
      <button type="button" aria-label="关闭提示" onClick={onDismiss}>
        关闭
      </button>
    </div>
  )
}
