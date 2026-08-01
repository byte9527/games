export type MusicInstrument = 'pluck' | 'flute' | 'drone'

export interface MusicNote {
  readonly beat: number
  readonly durationBeats: number
  readonly midi: number
  readonly velocity: number
  readonly instrument: MusicInstrument
}

export interface MusicScore {
  readonly id: string
  readonly bpm: number
  readonly beatsPerLoop: number
  readonly masterGain: number
  readonly fadeSeconds: number
  readonly notes: readonly MusicNote[]
}

export type MusicScoreValidation = { ok: true } | { ok: false; message: string }

export function validateMusicScore(score: MusicScore): MusicScoreValidation {
  if (score.id.length === 0) return { ok: false, message: '曲目标识不能为空' }
  if (!Number.isFinite(score.bpm) || score.bpm <= 0) {
    return { ok: false, message: '速度必须大于 0' }
  }
  if (!Number.isFinite(score.beatsPerLoop) || score.beatsPerLoop <= 0) {
    return { ok: false, message: '循环拍数必须大于 0' }
  }
  if (!Number.isFinite(score.masterGain) || score.masterGain < 0 || score.masterGain > 1) {
    return { ok: false, message: '总音量必须位于 0 到 1 之间' }
  }
  if (!Number.isFinite(score.fadeSeconds) || score.fadeSeconds < 0) {
    return { ok: false, message: '淡入淡出时间不能为负数' }
  }

  for (const note of score.notes) {
    if (!Number.isFinite(note.beat) || note.beat < 0 || note.beat >= score.beatsPerLoop) {
      return { ok: false, message: '音符必须位于循环范围内' }
    }
    if (!Number.isFinite(note.durationBeats) || note.durationBeats <= 0) {
      return { ok: false, message: '音符时值必须大于 0' }
    }
    if (note.beat + note.durationBeats > score.beatsPerLoop) {
      return { ok: false, message: '音符不能越过循环末尾' }
    }
    if (!Number.isFinite(note.velocity) || note.velocity < 0 || note.velocity > 1) {
      return { ok: false, message: '音符力度必须位于 0 到 1 之间' }
    }
    if (!Number.isFinite(note.midi) || !Number.isInteger(note.midi) || note.midi < 0 || note.midi > 127) {
      return { ok: false, message: 'MIDI 音高必须位于 0 到 127 之间' }
    }
  }

  return { ok: true }
}

export function loopDurationSeconds(score: MusicScore): number {
  return (score.beatsPerLoop * 60) / score.bpm
}

export function midiToFrequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12)
}
