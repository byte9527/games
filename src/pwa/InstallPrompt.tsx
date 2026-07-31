import { useRef, useState } from 'react'

import { ModalDialog } from '../app/ModalDialog'
import { useInstallPrompt } from './useInstallPrompt'

const IOS_INSTALL_GUIDE = '请在 Safari 中打开分享菜单，然后选择“添加到主屏幕”。'
const OTHER_INSTALL_GUIDE = '请打开浏览器菜单，然后选择“安装应用”或“添加到主屏幕”。'

function isIosDevice(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

export function InstallPrompt() {
  const { installed, canPrompt, install } = useInstallPrompt()
  const [installing, setInstalling] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const guideButtonRef = useRef<HTMLButtonElement>(null)

  if (installed) return null

  async function handleInstall(): Promise<void> {
    if (installing) return
    setInstalling(true)
    const result = await install()
    setInstalling(false)
    if (result === 'dismissed' || result === 'unavailable') setShowGuide(false)
  }

  return (
    <div className="install-prompt">
      {canPrompt ? (
        <button disabled={installing} onClick={handleInstall} type="button">
          {installing ? '安装中…' : '安装到桌面'}
        </button>
      ) : (
        <button onClick={() => setShowGuide(true)} type="button">
          如何安装
        </button>
      )}
      {showGuide ? (
        <ModalDialog
          initialFocusRef={guideButtonRef}
          onEscape={() => setShowGuide(false)}
          title="安装说明"
        >
          <p>{isIosDevice() ? IOS_INSTALL_GUIDE : OTHER_INSTALL_GUIDE}</p>
          <div className="dialog-actions">
            <button
              onClick={() => setShowGuide(false)}
              ref={guideButtonRef}
              type="button"
            >
              知道了
            </button>
          </div>
        </ModalDialog>
      ) : null}
    </div>
  )
}
