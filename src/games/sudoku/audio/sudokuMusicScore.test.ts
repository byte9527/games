import { loopDurationSeconds, validateMusicScore } from '../../../audio/core/musicScore'
import { gomokuMusicScore } from '../../gomoku/audio/gomokuMusicScore'
import { sudokuMusicScore } from './sudokuMusicScore'

const expectedNotes = [
  { beat: 0, durationBeats: 18, midi: 48, velocity: 0.12, instrument: 'drone' },
  { beat: 18, durationBeats: 18, midi: 43, velocity: 0.11, instrument: 'drone' },
  { beat: 0, durationBeats: 1.4, midi: 60, velocity: 0.28, instrument: 'pluck' },
  { beat: 8, durationBeats: 1.2, midi: 64, velocity: 0.24, instrument: 'pluck' },
  { beat: 16, durationBeats: 1.4, midi: 67, velocity: 0.26, instrument: 'pluck' },
  { beat: 24, durationBeats: 1.2, midi: 64, velocity: 0.22, instrument: 'pluck' },
  { beat: 32, durationBeats: 1.4, midi: 60, velocity: 0.25, instrument: 'pluck' },
  { beat: 11, durationBeats: 4, midi: 72, velocity: 0.11, instrument: 'flute' },
  { beat: 27, durationBeats: 4, midi: 67, velocity: 0.1, instrument: 'flute' },
] as const

describe('sudokuMusicScore', () => {
  it('提供合法的 36 秒低音量循环', () => {
    expect(validateMusicScore(sudokuMusicScore)).toEqual({ ok: true })
    expect(sudokuMusicScore.id).toBe('sudoku-calm-focus')
    expect(sudokuMusicScore.bpm).toBe(60)
    expect(sudokuMusicScore.beatsPerLoop).toBe(36)
    expect(sudokuMusicScore.fadeSeconds).toBe(0.8)
    expect(sudokuMusicScore.masterGain).toBe(0.05)
    expect(loopDurationSeconds(sudokuMusicScore)).toBeGreaterThanOrEqual(32)
    expect(loopDurationSeconds(sudokuMusicScore)).toBeLessThanOrEqual(40)
  })

  it('只使用现有拨弦、笛声和持续铺底音色', () => {
    expect(new Set(sudokuMusicScore.notes.map((note) => note.instrument)))
      .toEqual(new Set(['pluck', 'flute', 'drone']))
  })

  it('使用固定音符并比五子棋保留更多留白', () => {
    expect(sudokuMusicScore.notes).toEqual(expectedNotes)
    expect(sudokuMusicScore.notes).toHaveLength(9)
    expect(sudokuMusicScore.notes.length).toBeLessThan(gomokuMusicScore.notes.length)
  })
})
