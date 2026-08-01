import type { MusicScore } from '../../../audio/core/musicScore'

export const gomokuMusicScore: MusicScore = {
  id: 'gomoku-calm-chinese-v1',
  bpm: 60,
  beatsPerLoop: 32,
  masterGain: 0.055,
  fadeSeconds: 0.8,
  notes: [
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
  ],
}
