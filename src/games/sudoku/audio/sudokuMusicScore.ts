import type { MusicScore } from '../../../audio/core/musicScore'

export const sudokuMusicScore: MusicScore = {
  id: 'sudoku-calm-focus',
  bpm: 60,
  beatsPerLoop: 36,
  masterGain: 0.05,
  fadeSeconds: 0.8,
  notes: [
    { beat: 0, durationBeats: 18, midi: 48, velocity: 0.12, instrument: 'drone' },
    { beat: 18, durationBeats: 18, midi: 43, velocity: 0.11, instrument: 'drone' },
    { beat: 0, durationBeats: 1.4, midi: 60, velocity: 0.28, instrument: 'pluck' },
    { beat: 8, durationBeats: 1.2, midi: 64, velocity: 0.24, instrument: 'pluck' },
    { beat: 16, durationBeats: 1.4, midi: 67, velocity: 0.26, instrument: 'pluck' },
    { beat: 24, durationBeats: 1.2, midi: 64, velocity: 0.22, instrument: 'pluck' },
    { beat: 32, durationBeats: 1.4, midi: 60, velocity: 0.25, instrument: 'pluck' },
    { beat: 11, durationBeats: 4, midi: 72, velocity: 0.11, instrument: 'flute' },
    { beat: 27, durationBeats: 4, midi: 67, velocity: 0.1, instrument: 'flute' },
  ],
}
