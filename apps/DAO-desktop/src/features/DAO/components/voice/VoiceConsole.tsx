import { MessageSquare, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'

import type { DAOVoiceSession } from '../../hooks/useVoiceSession'
import type { SpaceGreeting } from '../../lib/space-greeting'
import { CompanyPoweredBy } from '../../screens/_company-shell'
import { JarvisOrb, type OrbState } from './JarvisOrb'

export function VoiceConsole({
  session,
  greeting,
  leadName,
  onOpenChat,
  wakeHint,
}: {
  session: DAOVoiceSession
  greeting: SpaceGreeting
  leadName: string
  onOpenChat: () => void
  /** e.g. `Say "Jarvis"` when the wake-word listener is armed and idle. */
  wakeHint?: string | null
}) {
  const { state, transcript, reply, caption: spokenLine, status, error, micLevel, audioElement, active } = session

  // The orb only knows visual states; collapse "transcribing" into "thinking".
  const orbState: OrbState = state === 'transcribing' ? 'thinking' : state

  const eyebrow =
    state === 'listening'
      ? 'Listening'
      : state === 'transcribing'
        ? 'Got it…'
        : state === 'thinking'
          ? `${leadName} is working`
          : state === 'speaking'
            ? `${leadName} is speaking`
            : greeting.kind === 'chat'
              ? 'From your chat today'
              : greeting.dateLine

  // Caption reveals one spoken line at a time while speaking (CC/subtitle),
  // the live transcript while listening, and status/greeting otherwise.
  const captionText =
    state === 'listening'
      ? transcript || 'Speak now…'
      : state === 'speaking'
        ? spokenLine || reply || status || ''
        : status
          ? status
          : reply
            ? reply
            : greeting.subline
              ? greeting.subline
              : `Tap the orb to talk to ${leadName} — it can run tasks for you.`

  const captionVariant = state === 'listening' ? 'transcript' : state === 'speaking' ? 'caption' : 'default'

  return (
    <div className="DAO-jarvis-console">
      <JarvisOrb
        audioEl={audioElement}
        leadName={leadName}
        micLevel={micLevel}
        onClick={session.toggle}
        state={orbState}
      />

      <p className="DAO-space-home-eyebrow">{eyebrow}</p>
      <h2 className="DAO-space-home-headline">{greeting.headline}</h2>
      <CompanyPoweredBy className="DAO-space-home-powered" />

      <p aria-live="polite" className="DAO-jarvis-caption" data-variant={captionVariant} key={captionText}>
        {captionText}
      </p>

      {error ? <p className="DAO-jarvis-error">{error}</p> : null}

      {!active && wakeHint ? <p className="DAO-jarvis-wakehint">{wakeHint}</p> : null}

      <div className="DAO-jarvis-controls">
        {active ? (
          <Button onClick={session.stop} size="sm" type="button" variant="ghost">
            <Square size="0.875rem" />
            Stop
          </Button>
        ) : null}

        <Button onClick={onOpenChat} size="sm" type="button" variant="ghost">
          <MessageSquare size="0.875rem" />
          Open chat
        </Button>
      </div>
    </div>
  )
}
