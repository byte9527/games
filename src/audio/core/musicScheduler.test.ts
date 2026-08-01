import type { MusicScore } from './musicScore'
import { buildLoopSchedule } from './musicScheduler'

const score: MusicScore = {
  id: 'out-of-order-score',
  bpm: 60,
  beatsPerLoop: 5,
  masterGain: 0.5,
  fadeSeconds: 0.25,
  notes: [
    { beat: 3, durationBeats: 2, midi: 66, velocity: 0.4, instrument: 'flute' },
    { beat: 0, durationBeats: 1, midi: 62, velocity: 0.5, instrument: 'pluck' },
  ],
}

describe('music scheduler', () => {
  it('builds a time-sorted loop schedule without mutating source notes', () => {
    const originalNotes = structuredClone(score.notes)

    const schedule = buildLoopSchedule(score, 10)

    expect(schedule).toHaveLength(2)
    expect(schedule.map((note) => note.startTime)).toEqual([10, 13])
    expect(schedule[0]).toMatchObject({
      startTime: 10,
      durationSeconds: 1,
      velocity: 0.5,
      instrument: 'pluck',
    })
    expect(schedule[0]?.frequency).toBeCloseTo(293.6648, 4)
    expect(schedule[1]).toMatchObject({
      startTime: 13,
      durationSeconds: 2,
      velocity: 0.4,
      instrument: 'flute',
    })
    expect(schedule[1]?.frequency).toBeCloseTo(369.9944, 4)
    expect(score.notes).toEqual(originalNotes)
  })
})
