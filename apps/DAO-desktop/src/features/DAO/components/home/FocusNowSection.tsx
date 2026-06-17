import { useState } from 'react'

import { Button } from '@/components/ui/button'

import type { FocusCard } from '../../api/types'
import { HomeSection } from './HomeSection'
import { FocusInvestigateSheet } from './FocusInvestigateSheet'

type FocusNowSectionProps = {
  focus: FocusCard | null
  alsoAttention: FocusCard[]
  spaceId: string
  busy?: boolean
  onApprove: (card: FocusCard) => void
  onIgnore: (card: FocusCard) => void
  onDiscuss: (card: FocusCard) => void
  onOpenInbox?: (card: FocusCard) => void
  onOpenObject?: (objectId: string) => void
}

function resolveObjectId(card: FocusCard): string | null {
  if (card.object_id) return card.object_id
  if (card.kind === 'decision') return card.id
  return null
}

export function FocusNowSection({
  focus,
  alsoAttention,
  spaceId,
  busy,
  onApprove,
  onIgnore,
  onDiscuss,
  onOpenInbox,
  onOpenObject,
}: FocusNowSectionProps) {
  const [investigate, setInvestigate] = useState<FocusCard | null>(null)

  if (!focus) {
    return (
      <HomeSection label="Focus Now" title="All clear">
        <p className="DAO-home-empty">No decisions waiting — pick an outcome in Ask DAO below.</p>
      </HomeSection>
    )
  }

  const isHitl = focus.kind === 'hitl'
  const focusObjectId = resolveObjectId(focus)

  return (
    <>
      <HomeSection label="Focus Now" title={focus.title}>
        <article className="DAO-home-focus" aria-live="polite">
          {focus.recommendation ? (
            <p className="DAO-home-focus__recommendation">{focus.recommendation}</p>
          ) : (
            <p className="DAO-home-focus__context">{focus.context}</p>
          )}
          <div className="DAO-home-focus__why">
            <p className="DAO-home-focus__why-label">Why This Matters</p>
            <p className="DAO-home-focus__why-body">{focus.why_this_matters}</p>
          </div>
          <div className="DAO-home-focus__actions">
            {isHitl ? (
              <>
                <Button disabled={busy} onClick={() => onApprove(focus)} size="sm" type="button">
                  Approve
                </Button>
                <Button
                  disabled={busy}
                  onClick={() => setInvestigate(focus)}
                  size="sm"
                  type="button"
                  variant="secondary"
                >
                  Investigate
                </Button>
                {onOpenInbox ? (
                  <Button onClick={() => onOpenInbox(focus)} size="sm" type="button" variant="outline">
                    Open Inbox
                  </Button>
                ) : null}
                <Button
                  disabled={busy}
                  onClick={() => onIgnore(focus)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  Not now
                </Button>
              </>
            ) : (
              <>
                <Button onClick={() => onDiscuss(focus)} size="sm" type="button">
                  Discuss with DAO
                </Button>
                {focusObjectId && onOpenObject ? (
                  <Button
                    onClick={() => onOpenObject(focusObjectId)}
                    size="sm"
                    type="button"
                    variant="secondary"
                  >
                    View object
                  </Button>
                ) : null}
              </>
            )}
          </div>
          {alsoAttention.length > 0 ? (
            <ul className="DAO-home-focus__also">
              {alsoAttention.map((card) => {
                const objectId = resolveObjectId(card)
                const canOpenInbox = card.kind === 'hitl' && onOpenInbox
                const canOpenObject = objectId && onOpenObject
                if (!canOpenInbox && !canOpenObject) {
                  return <li key={card.id}>{card.title}</li>
                }
                return (
                  <li key={card.id}>
                    <button
                      className="DAO-home-focus__also-btn"
                      onClick={() => {
                        if (card.kind === 'hitl' && onOpenInbox) onOpenInbox(card)
                        else if (objectId && onOpenObject) onOpenObject(objectId)
                      }}
                      type="button"
                    >
                      {card.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          ) : null}
        </article>
      </HomeSection>

      <FocusInvestigateSheet
        card={investigate}
        spaceId={spaceId}
        onClose={() => setInvestigate(null)}
        onDiscuss={() => {
          if (investigate) onDiscuss(investigate)
          setInvestigate(null)
        }}
      />
    </>
  )
}
