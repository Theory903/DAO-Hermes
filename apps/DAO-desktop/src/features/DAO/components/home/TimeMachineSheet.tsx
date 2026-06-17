import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type { MomentumRings } from '../../api/types'

type TimeMachinePoint = {
  week_start: string
  score: number
  rings: MomentumRings
  factors: string[]
}

type TimeMachineSheetProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  points: TimeMachinePoint[]
}

export function TimeMachineSheet({ open, onOpenChange, points }: TimeMachineSheetProps) {
  return (
    <Sheet onOpenChange={onOpenChange} open={open}>
      <SheetContent className="DAO-home-time-sheet" showCloseButton side="right">
        <SheetHeader>
          <SheetTitle>Time Machine</SheetTitle>
          <SheetDescription>Weekly momentum snapshots for this Space.</SheetDescription>
        </SheetHeader>
        <ol className="DAO-home-time-list">
          {points.map((point) => (
            <li className="DAO-home-time-list__item" key={point.week_start}>
              <div className="DAO-home-time-list__head">
                <span>Week of {point.week_start}</span>
                <strong>{point.score}</strong>
              </div>
              <div className="DAO-home-time-list__rings">
                {Object.entries(point.rings).map(([key, value]) => (
                  <span key={key}>
                    {key}: {Math.round(value * 100)}%
                  </span>
                ))}
              </div>
            </li>
          ))}
        </ol>
      </SheetContent>
    </Sheet>
  )
}
