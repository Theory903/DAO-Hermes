import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

import type { FocusCard } from '../../api/types'
import { ObjectPrimitives } from '../objects/ObjectPrimitives'
import { ToolTracePanel } from '../ToolTracePanel'

type FocusInvestigateSheetProps = {
  card: FocusCard | null
  spaceId: string
  onClose: () => void
  onDiscuss: () => void
}

export function FocusInvestigateSheet({
  card,
  spaceId,
  onClose,
  onDiscuss,
}: FocusInvestigateSheetProps) {
  return (
    <Sheet onOpenChange={(open) => !open && onClose()} open={Boolean(card)}>
      <SheetContent className="DAO-home-investigate-sheet" showCloseButton side="right">
        {card ? (
          <>
            <SheetHeader>
              <SheetTitle>{card.title}</SheetTitle>
              <SheetDescription>{card.context}</SheetDescription>
            </SheetHeader>

            <section className="DAO-home-investigate-sheet__why">
              <h3 className="DAO-util-section-label">Why This Matters</h3>
              <p>{card.why_this_matters}</p>
            </section>

            {card.drive_refs?.length ? (
              <section className="DAO-home-investigate-sheet__refs">
                <h3 className="DAO-util-section-label">References</h3>
                <ul>
                  {card.drive_refs.map((ref) => (
                    <li key={ref}>{ref}</li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section className="DAO-home-investigate-sheet__trace">
              <h3 className="DAO-util-section-label">Evidence</h3>
              <ToolTracePanel trace={card.tool_trace} />
            </section>

            {card.kind === 'hitl' ? (
              <section className="DAO-home-investigate-sheet__graph">
                <h3 className="DAO-util-section-label">Company graph</h3>
                <ObjectPrimitives
                  missingLabel="Timeline appears once this approval is indexed in the graph."
                  showMerge={false}
                  sourceId={card.id}
                  sourceTable="hitl_requests"
                  spaceId={spaceId}
                />
              </section>
            ) : null}

            <SheetFooter>
              <Button onClick={onDiscuss} size="sm" type="button">
                Discuss with DAO
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
