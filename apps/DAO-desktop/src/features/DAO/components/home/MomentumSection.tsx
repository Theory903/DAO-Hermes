import { useState } from 'react'

import { Button } from '@/components/ui/button'

import type { HeatmapDay, MomentumRings } from '../../api/types'
import { HomeSection } from './HomeSection'
import { TimeMachineSheet } from './TimeMachineSheet'

const RING_LABELS: Array<{ key: keyof MomentumRings; label: string }> = [
  { key: 'growth', label: 'Growth' },
  { key: 'execution', label: 'Execution' },
  { key: 'learning', label: 'Learning' },
  { key: 'autonomy', label: 'Autonomy' },
]

type MomentumSectionProps = {
  score: number
  scoreDeltaWeek: number | null
  rings: MomentumRings
  heatmap: HeatmapDay[]
  timeMachine: { points: Array<{ week_start: string; score: number; rings: MomentumRings; factors: string[] }> }
}

export function MomentumSection({
  score,
  scoreDeltaWeek,
  rings,
  heatmap,
  timeMachine,
}: MomentumSectionProps) {
  const [timeOpen, setTimeOpen] = useState(false)

  return (
    <>
      <HomeSection
        action={
          <Button onClick={() => setTimeOpen(true)} size="sm" type="button" variant="ghost">
            Time Machine
          </Button>
        }
        label="Momentum"
        title={`${score}`}
      >
        <div className="DAO-home-momentum">
          <div className="DAO-home-momentum__score">
            <span className="DAO-home-momentum__value">{score}</span>
            {scoreDeltaWeek != null ? (
              <span
                className="DAO-home-momentum__delta"
                data-direction={scoreDeltaWeek >= 0 ? 'up' : 'down'}
              >
                {scoreDeltaWeek >= 0 ? '+' : ''}
                {scoreDeltaWeek} this week
              </span>
            ) : null}
          </div>

          <div className="DAO-home-rings">
            {RING_LABELS.map(({ key, label }) => (
              <div className="DAO-home-ring" key={key}>
                <svg aria-hidden className="DAO-home-ring__svg" viewBox="0 0 36 36">
                  <circle className="DAO-home-ring__track" cx="18" cy="18" r="15.9" />
                  <circle
                    className="DAO-home-ring__fill"
                    cx="18"
                    cy="18"
                    data-ring={key}
                    r="15.9"
                    strokeDasharray={`${Math.round(rings[key] * 100)} 100`}
                  />
                </svg>
                <span className="DAO-home-ring__label">{label}</span>
              </div>
            ))}
          </div>

          <div
            className="DAO-home-heatmap"
            aria-label="Activity heatmap"
            role="img"
          >
            {heatmap.map((day) => (
              <span
                className="DAO-home-heatmap__cell"
                data-level={day.level}
                key={day.date}
                title={`${day.date}: ${day.count} events`}
              />
            ))}
          </div>
        </div>
      </HomeSection>

      <TimeMachineSheet onOpenChange={setTimeOpen} open={timeOpen} points={timeMachine.points} />
    </>
  )
}
