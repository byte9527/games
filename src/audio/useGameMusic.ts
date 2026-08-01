import { useEffect } from 'react'
import type { MusicScore } from './core/musicScore'
import { useAudioController } from './AudioProvider'

export function useGameMusic(score: MusicScore, active: boolean): void {
  const { setGameMusic } = useAudioController()

  useEffect(() => setGameMusic(score, active), [active, score, setGameMusic])
}
