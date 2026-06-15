import { Link } from 'react-router-dom'
import { ArrowRightLeft, ArrowUpRight } from 'lucide-react'

import type { HandoffVisual } from '../lib/command-floor'
import { cn } from '@/lib/utils'

function formatHandoffTime(ts: number): string {
  if (!ts) return ''
  const diff = Date.now() - ts
  if (diff < 60_000) return 'Just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  return new Date(ts).toLocaleDateString()
}

type SpaceHomeActivityProps = {
  handoffs: HandoffVisual[]
  commandHref: string
  className?: string
}

export function SpaceHomeActivity({ handoffs, commandHref, className }: SpaceHomeActivityProps) {
  return (
    <section className={cn('DAO-space-home-activity', className)}>
      <div className="DAO-space-home-activity-head DAO-space-home-activity-head--brief">
        <p className="DAO-util-section-label">Handoffs</p>
        <Link className="DAO-space-home-activity-link" to={commandHref}>
          Command
          <ArrowUpRight size={12} strokeWidth={1.6} />
        </Link>
      </div>

      <ul className="DAO-space-home-activity-list">
        {handoffs.length === 0 ? (
          <li className="DAO-space-home-activity-empty">
            <p>No handoffs yet.</p>
            <span>When departments pass work, it shows up here and on the floor.</span>
          </li>
        ) : (
          handoffs.slice(0, 5).map((row) => (
            <li key={row.id} className="DAO-space-home-activity-item">
              <div className="DAO-space-home-handoff-route">
                <span>{row.fromDept}</span>
                <ArrowRightLeft size={12} aria-hidden="true" />
                <span>{row.toDept}</span>
                {row.ts ? <time>{formatHandoffTime(row.ts)}</time> : null}
              </div>
              <p className="DAO-space-home-handoff-subject">{row.subject}</p>
            </li>
          ))
        )}
      </ul>
    </section>
  )
}
