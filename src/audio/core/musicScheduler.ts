import { midiToFrequency, type MusicInstrument, type MusicScore } from './musicScore'

export interface ScheduledMusicNote {
  readonly startTime: number
  readonly durationSeconds: number
  readonly frequency: number
  readonly velocity: number
  readonly instrument: MusicInstrument
}

export function buildLoopSchedule(
  score: MusicScore,
  loopStartTime: number,
): readonly ScheduledMusicNote[] {
  const secondsPerBeat = 60 / score.bpm

  return score.notes
    .map((note) => ({
      startTime: loopStartTime + note.beat * secondsPerBeat,
      durationSeconds: note.durationBeats * secondsPerBeat,
      frequency: midiToFrequency(note.midi),
      velocity: note.velocity,
      instrument: note.instrument,
    }))
    .sort((left, right) => left.startTime - right.startTime)
}
