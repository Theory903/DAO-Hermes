import type { ReactNode } from 'react'

import type { OperatingMode } from '../../api/types'
import type { DAOVoiceSession } from '../../hooks/useVoiceSession'
import type { SpaceGreeting } from '../../lib/space-greeting'
import { VoiceConsole } from '../voice/VoiceConsole'
import { OperatingModeBadge } from './OperatingModeBadge'

type CompanyPulseSectionProps = {
  session: DAOVoiceSession
  greeting: SpaceGreeting
  leadName: string
  operatingMode: OperatingMode
  onOpenChat: () => void
  wakeHint?: string | null
  orbTone?: 'positive' | 'neutral' | 'warning'
}

export function CompanyPulseSection({
  session,
  greeting,
  leadName,
  operatingMode,
  onOpenChat,
  wakeHint,
  orbTone = 'neutral',
}: CompanyPulseSectionProps) {
  return (
    <div className="DAO-home-pulse" data-orb-tone={orbTone}>
      <VoiceConsole
        greeting={greeting}
        leadName={leadName}
        onOpenChat={onOpenChat}
        session={session}
        wakeHint={wakeHint}
      />
      <OperatingModeBadge mode={operatingMode} />
    </div>
  )
}
