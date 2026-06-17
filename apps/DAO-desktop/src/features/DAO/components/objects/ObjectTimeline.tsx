import type { ObjectEvent } from '../../api/types'
import { formatRelative } from '../../screens/brain/format'

function labelForEvent(event: ObjectEvent): string {
  const map: Record<string, string> = {
    object_created: 'Created',
    object_updated: 'Updated',
    object_merged: 'Merged',
    object_linked: 'Linked',
    decision_approved: 'Approved',
    decision_rejected: 'Rejected',
    decision_reconsidered: 'Reconsidered',
    handoff_completed: 'Handoff completed',
    briefing_generated: 'Briefing generated',
  }
  return map[event.event_type] ?? event.event_type.replaceAll('_', ' ')
}

type ObjectTimelineProps = {
  events: ObjectEvent[]
  emptyLabel?: string
}

export function ObjectTimeline({ events, emptyLabel = 'No timeline events yet.' }: ObjectTimelineProps) {
  if (events.length === 0) {
    return <p className="DAO-object-empty">{emptyLabel}</p>
  }

  return (
    <ol className="DAO-object-timeline">
      {events.map((event) => (
        <li key={event.id} className="DAO-object-timeline-item">
          <div className="DAO-object-timeline-marker" aria-hidden="true" />
          <div className="DAO-object-timeline-body">
            <div className="DAO-object-timeline-head">
              <span className="DAO-object-timeline-type">{labelForEvent(event)}</span>
              {event.created_at ? (
                <time className="DAO-object-timeline-time" dateTime={event.created_at}>
                  {formatRelative(event.created_at)}
                </time>
              ) : null}
            </div>
            {event.actor ? <p className="DAO-object-timeline-actor">{event.actor}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  )
}
