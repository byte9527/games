import {
  loopDurationSeconds,
  midiToFrequency,
  type MusicScore,
  validateMusicScore,
} from './musicScore'

function createScore(overrides: Partial<MusicScore> = {}): MusicScore {
  return {
    id: 'test-score',
    bpm: 120,
    beatsPerLoop: 8,
    masterGain: 0.5,
    fadeSeconds: 0.25,
    notes: [
      {
        beat: 0,
        durationBeats: 1,
        midi: 60,
        velocity: 0.5,
        instrument: 'pluck',
      },
    ],
    ...overrides,
  }
}

describe('music score', () => {
  it('accepts a complete valid score', () => {
    expect(validateMusicScore(createScore())).toEqual({ ok: true })
  })

  it('calculates loop duration in seconds', () => {
    expect(loopDurationSeconds(createScore({ bpm: 60, beatsPerLoop: 8 }))).toBe(8)
  })

  it('converts MIDI note 69 to 440Hz', () => {
    expect(midiToFrequency(69)).toBe(440)
  })

  it.each([
    ['empty id', createScore({ id: '' }), '曲目标识不能为空'],
    ['non-positive bpm', createScore({ bpm: 0 }), '速度必须大于 0'],
    ['non-positive beats per loop', createScore({ beatsPerLoop: 0 }), '循环拍数必须大于 0'],
    ['out-of-range master gain', createScore({ masterGain: 1.1 }), '总音量必须位于 0 到 1 之间'],
    ['negative fade seconds', createScore({ fadeSeconds: -1 }), '淡入淡出时间不能为负数'],
    [
      'note beat outside loop',
      createScore({ notes: [{ beat: 8, durationBeats: 1, midi: 60, velocity: 0.5, instrument: 'pluck' }] }),
      '音符必须位于循环范围内',
    ],
    [
      'non-positive duration',
      createScore({ notes: [{ beat: 0, durationBeats: 0, midi: 60, velocity: 0.5, instrument: 'pluck' }] }),
      '音符时值必须大于 0',
    ],
    [
      'note beyond loop end',
      createScore({ notes: [{ beat: 7, durationBeats: 2, midi: 60, velocity: 0.5, instrument: 'pluck' }] }),
      '音符不能越过循环末尾',
    ],
    [
      'out-of-range velocity',
      createScore({ notes: [{ beat: 0, durationBeats: 1, midi: 60, velocity: 1.1, instrument: 'pluck' }] }),
      '音符力度必须位于 0 到 1 之间',
    ],
    [
      'non-integer MIDI pitch',
      createScore({ notes: [{ beat: 0, durationBeats: 1, midi: 60.5, velocity: 0.5, instrument: 'pluck' }] }),
      'MIDI 音高必须位于 0 到 127 之间',
    ],
    [
      'out-of-range MIDI pitch',
      createScore({ notes: [{ beat: 0, durationBeats: 1, midi: 128, velocity: 0.5, instrument: 'pluck' }] }),
      'MIDI 音高必须位于 0 到 127 之间',
    ],
  ])('rejects $0', (_name, score, message) => {
    expect(validateMusicScore(score)).toEqual({ ok: false, message })
  })
})
