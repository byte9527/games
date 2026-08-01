import { Fragment, useId } from 'react'
import { useAudioController } from './AudioProvider'

export function MusicToggle() {
  const { availability, enabled, toggle } = useAudioController()
  const unavailableDescriptionId = useId()
  const unavailable = availability === 'unavailable'

  const label = unavailable ? '音乐不可用' : enabled ? '关闭音乐' : '开启音乐'
  const text = unavailable ? '音乐不可用' : enabled ? '音乐开' : '音乐关'

  return (
    <Fragment>
      <button
        type="button"
        className="music-toggle"
        aria-label={label}
        aria-pressed={enabled}
        aria-describedby={unavailable ? unavailableDescriptionId : undefined}
        disabled={unavailable}
        onClick={toggle}
      >
        {text}
      </button>
      {unavailable ? (
        <span id={unavailableDescriptionId} className="visually-hidden">
          当前浏览器无法播放音乐。
        </span>
      ) : null}
    </Fragment>
  )
}
