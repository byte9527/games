import { loopDurationSeconds, validateMusicScore } from '../../../audio/core/musicScore'
import { gomokuMusicScore } from './gomokuMusicScore'

const expectedNotes = [
  { beat: 0, durationBeats: 16, midi: 50, velocity: 0.16, instrument: 'drone' },
  { beat: 16, durationBeats: 16, midi: 45, velocity: 0.14, instrument: 'drone' },
  { beat: 0, durationBeats: 1.4, midi: 62, velocity: 0.42, instrument: 'pluck' },
  { beat: 3, durationBeats: 1.2, midi: 66, velocity: 0.34, instrument: 'pluck' },
  { beat: 6, durationBeats: 1.4, midi: 69, velocity: 0.38, instrument: 'pluck' },
  { beat: 10, durationBeats: 1.1, midi: 71, velocity: 0.3, instrument: 'pluck' },
  { beat: 13, durationBeats: 1.5, midi: 69, velocity: 0.36, instrument: 'pluck' },
  { beat: 16, durationBeats: 1.4, midi: 66, velocity: 0.4, instrument: 'pluck' },
  { beat: 19, durationBeats: 1.2, midi: 64, velocity: 0.32, instrument: 'pluck' },
  { beat: 22, durationBeats: 1.5, midi: 62, velocity: 0.38, instrument: 'pluck' },
  { beat: 26, durationBeats: 1.2, midi: 57, velocity: 0.28, instrument: 'pluck' },
  { beat: 29, durationBeats: 1.6, midi: 62, velocity: 0.4, instrument: 'pluck' },
  { beat: 8, durationBeats: 5, midi: 74, velocity: 0.16, instrument: 'flute' },
  { beat: 24, durationBeats: 5, midi: 71, velocity: 0.15, instrument: 'flute' },
] as const

describe('gomokuMusicScore', () => {
  it('提供合法的 32 秒低音量循环', () => {
    expect(validateMusicScore(gomokuMusicScore)).toEqual({ ok: true })
    expect(gomokuMusicScore.bpm).toBe(60)
    expect(gomokuMusicScore.beatsPerLoop).toBe(32)
    expect(loopDurationSeconds(gomokuMusicScore)).toBe(32)
    expect(gomokuMusicScore.masterGain).toBeLessThanOrEqual(0.06)
    expect(gomokuMusicScore.fadeSeconds).toBe(0.8)
  })

  it('只使用古筝、笛声和持续音三类音色', () => {
    expect(new Set(gomokuMusicScore.notes.map((note) => note.instrument)))
      .toEqual(new Set(['pluck', 'flute', 'drone']))
  })

  it('所有音高都属于 D 五声音阶', () => {
    const dPentatonicPitchClasses = new Set([2, 4, 6, 9, 11])

    expect(gomokuMusicScore.notes.every((note) => dPentatonicPitchClasses.has(note.midi % 12)))
      .toBe(true)
  })

  it('使用固定且无随机性的音符序列', () => {
    expect(gomokuMusicScore.notes).toEqual(expectedNotes)
  })
})
