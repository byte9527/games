import { Fragment, useId } from 'react'
import { useAudioController } from './AudioProvider'

export function MusicToggle() {
  const { availability, enabled, toggle } = useAudioController()
  const unavailableDescriptionId = useId()
  const unavailable = availability === 'unavailable'

  const stateText = unavailable ? '不可用' : enabled ? '开' : '关'

  return (
    <Fragment>
      <button
        type="button"
        className="music-toggle"
        aria-pressed={enabled}
        aria-describedby={unavailable ? unavailableDescriptionId : undefined}
        data-audio-toggle="true"
        disabled={unavailable}
        onClick={(event) => toggle(event.nativeEvent.isTrusted)}
      >
        <span>音乐</span>
        <span aria-hidden="true">{stateText}</span>
      </button>
      {unavailable ? (
        <span id={unavailableDescriptionId} className="visually-hidden">
          当前浏览器无法播放音乐。
        </span>
      ) : null}
    </Fragment>
  )
}
