import { useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW()
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)

  if (!needRefresh) return null

  function handleUpdate(): void {
    if (updating) return
    setUpdating(true)
    setUpdateError(null)

    const updatePromise = updateServiceWorker(true)
    void updatePromise.then(
      () => setUpdating(false),
      () => {
        setUpdating(false)
        setUpdateError('更新失败，请稍后重试。')
      },
    )
  }

  return (
    <div className="update-prompt">
      <span aria-live="polite" role="status">新版本已经准备好。</span>
      <div className="update-prompt__actions">
        <button
          disabled={updating}
          onClick={() => setNeedRefresh(false)}
          type="button"
        >
          稍后
        </button>
        <button disabled={updating} onClick={handleUpdate} type="button">
          {updating ? '更新中…' : '立即更新'}
        </button>
      </div>
      {updateError === null ? null : (
        <p className="update-prompt__error" role="alert">{updateError}</p>
      )}
    </div>
  )
}
