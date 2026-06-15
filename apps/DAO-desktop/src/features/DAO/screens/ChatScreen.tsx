import { ExternalLink, MessageSquare } from 'lucide-react'
import { Link } from 'react-router-dom'

import { ReusedBadge } from '../components/ReusedBadge'
import { useSpaceContext } from '../context/SpaceContext'
import { useLeadName } from '../lib/space-lead'
import { useDelegationHints, useRecentReused, useSpaceEvents } from '../hooks/useSpaceEvents'
import { NEW_CHAT_ROUTE, SETTINGS_ROUTE } from '@/app/routes'
import { spaceRoute } from '../routes'

import { PlaceholderBadge, ScreenShell } from './ScreenShell'

export function ChatScreen() {
  const space = useSpaceContext()
  const leadName = useLeadName()
  const { events, live } = useSpaceEvents(space.id, 20)
  const delegations = useDelegationHints(events)
  const reused = useRecentReused(events)

  return (
    <ScreenShell label="AI Lead Chat" title={`Talk to ${leadName}`} maxWidth="720px">
      <div className="DAO-card p-6">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex size-10 items-center justify-center rounded-full bg-[var(--primary)]/15 text-[var(--primary)]">
            <MessageSquare className="size-5" />
          </span>
          <div>
            <p className="text-sm font-semibold">DAO chat is the execution surface</p>
            <p className="text-xs text-[var(--text-secondary)]">
              Streaming tool traces and gateway controls. <span className="DAO-powered-by">Powered by Hermes</span>
            </p>
          </div>
        </div>

        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
          Use the native DAO agent session UI for streaming, model picker, and gateway controls.
          Space context (<span className="font-mono text-[var(--text-primary)]">{space.slug}</span>) travels with
          your JWT and sidecar `HERMES_HOME` override.
        </p>

        {(delegations.length > 0 || reused.length > 0) && (
          <div className="DAO-chat-hints mt-5 space-y-3">
            {delegations.length > 0 ? (
              <div className="DAO-chat-hint">
                <p className="DAO-chat-hint-label">Dept delegation</p>
                <ul className="DAO-chat-hint-list">
                  {delegations.map((hint) => (
                    <li key={hint.id} className="DAO-chat-delegation">
                      <span className="DAO-chat-delegation-arrow">{hint.text}</span>
                      <span className="DAO-chat-delegation-detail">{hint.detail}</span>
                    </li>
                  ))}
                </ul>
                <p className="DAO-chat-hint-foot">
                  {live ? 'Streaming from Command Center events.' : 'Reconnecting to floor events…'}
                </p>
              </div>
            ) : null}

            {reused.length > 0 ? (
              <div className="DAO-chat-hint">
                <p className="DAO-chat-hint-label">Preflight reuse</p>
                <ul className="DAO-chat-hint-list">
                  {reused.map((event) => (
                    <li key={event.id} className="DAO-chat-reused-row">
                      <ReusedBadge />
                      <span className="DAO-chat-reused-text">{event.text}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="DAO-pill inline-flex items-center gap-2 bg-[var(--primary)] px-4 py-2 text-sm font-medium text-black transition hover:opacity-90"
            to={NEW_CHAT_ROUTE}
          >
            <MessageSquare className="size-4" />
            Open DAO Chat
          </Link>
          <Link
            className="DAO-pill inline-flex items-center gap-2 border border-[var(--void-border-strong)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--primary)]/40"
            to={spaceRoute(space.slug, 'command')}
          >
            View Command Center
          </Link>
          <Link
            className="DAO-pill inline-flex items-center gap-2 border border-[var(--void-border-strong)] px-4 py-2 text-sm text-[var(--text-primary)] transition hover:border-[var(--primary)]/40"
            to={SETTINGS_ROUTE}
          >
            <ExternalLink className="size-4" />
            Models & providers
          </Link>
        </div>

        <p className="mt-6 font-mono text-[11px] text-[var(--text-muted)]">
          Gateway sessions surface delegation as <span className="text-[var(--signal-green)]">→ Dept Lead</span>{' '}
          hints when workers are spawned.
        </p>
        <div className="mt-3">
          <PlaceholderBadge>GET /api/v1/spaces/{'{id}'}/ws/ticket</PlaceholderBadge>
        </div>
      </div>
    </ScreenShell>
  )
}
