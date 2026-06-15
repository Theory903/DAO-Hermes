import { ArrowLeftRight, Radio } from 'lucide-react'

import { ReusedBadge } from '../../components/ReusedBadge'
import type { CommandSnapshot } from '../../api/types'
import { useSpaceContext } from '../../context/SpaceContext'
import { useSpaceEvents } from '../../hooks/useSpaceEvents'
import { CompanyEmpty, CompanyError } from '../_company-shell'

function handoffLabel(row: Record<string, unknown>): string {
  return (
    (row.summary as string) ||
    (row.subject as string) ||
    (row.action as string) ||
    `${row.from_dept ?? '?'} → ${row.to_dept ?? '?'}`
  )
}

export function OrgActivityPanel({ snapshot }: { snapshot: CommandSnapshot | null | undefined }) {
  const space = useSpaceContext()
  const { events, error: sseError } = useSpaceEvents(space.id)
  const handoffs = snapshot?.recent_handoffs ?? []

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section>
        <h2 className="DAO-util-section-label mb-2 flex items-center gap-1.5">
          <ArrowLeftRight className="size-3.5" strokeWidth={1.8} />
          Recent handoffs
        </h2>
        {handoffs.length === 0 ? (
          <CompanyEmpty
            description="Cross-department work routed by AI Leads appears here."
            title="No handoffs yet"
          />
        ) : (
          <ul className="DAO-company-feed">
            {handoffs.slice(0, 12).map((row, i) => (
              <li className="DAO-company-feed-item" key={`handoff-${i}`}>
                <span className="DAO-company-feed-type">handoff</span>
                <span className="DAO-company-feed-text">{handoffLabel(row)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="DAO-util-section-label mb-2 flex items-center gap-1.5">
          <Radio className="size-3.5" strokeWidth={1.8} />
          Live event feed
        </h2>
        {sseError ? <CompanyError message={sseError} /> : null}
        {events.length === 0 ? (
          <CompanyEmpty
            description="Handoffs, writebacks, and REUSED badges stream here in real time."
            title="Waiting for floor events"
          />
        ) : (
          <ul className="DAO-company-feed">
            {events.map((ev) => (
              <li className="DAO-company-feed-item" key={ev.id}>
                <span className="DAO-company-feed-type">{ev.type}</span>
                <span className="DAO-company-feed-text">{ev.text}</span>
                {ev.reused ? <ReusedBadge /> : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
