import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { NEW_CHAT_ROUTE } from '@/app/routes'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'

import { getBriefingLatest, getSpaceReports, triggerBriefing } from '../api/space-api'
import { PulsePills, type PulsePill } from '../components/voice/PulsePills'
import { VoiceConsole } from '../components/voice/VoiceConsole'
import { useSpaceContext } from '../context/SpaceContext'
import { useAsync } from '../hooks/useAsync'
import { useSpaceGreeting } from '../hooks/useSpaceGreeting'
import { useVoiceSession } from '../hooks/useVoiceSession'
import { useWakeWord } from '../hooks/useWakeWord'
import { useLeadName } from '../lib/space-lead'
import { spaceRoute } from '../routes'
import {
  CompanyEmpty,
  CompanyError,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'
import { BriefingCard, BriefingCardSkeleton } from './BriefingCard'

export function HomeScreen() {
  const space = useSpaceContext()
  const navigate = useNavigate()
  const [triggering, setTriggering] = useState(false)

  const briefing = useAsync(() => getBriefingLatest(space.id), [space.id])
  const reports = useAsync(() => getSpaceReports(space.id).catch(() => null), [space.id])
  const leadName = useLeadName()
  const greeting = useSpaceGreeting(space.id, leadName, briefing.data)
  const voice = useVoiceSession({ spaceId: space.id, leadName })

  // Hands-free wake word ("Jarvis"): when heard while idle, open a voice turn.
  // Paused while the session already owns the mic so it can't self-trigger.
  const wake = useWakeWord(() => {
    if (!voice.active) voice.toggle()
  }, voice.active)
  const wakeHint = wake.status === 'listening' && wake.keyword ? `Say “${wake.keyword}”` : null

  // Greet once with the headline only — never read sublines or the briefing body.
  useEffect(() => {
    if (!greeting.headline) return
    voice.greet(greeting.headline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting.headline])

  const pulse = reports.data?.pulse
  const pills: PulsePill[] = pulse
    ? [
        {
          value: pulse.pending_hitl,
          label: 'approvals',
          alert: pulse.pending_hitl > 0,
          onClick: () => navigate(spaceRoute(space.slug, 'inbox')),
        },
        {
          value: pulse.handoffs_24h,
          label: 'handoffs',
          onClick: () => navigate(spaceRoute(space.slug, 'command')),
        },
        {
          value: pulse.drive_artifacts_24h,
          label: 'drive · 24h',
          onClick: () => navigate(spaceRoute(space.slug, 'drive')),
        },
        {
          value: pulse.brain_entities,
          label: 'brain',
          onClick: () => navigate(spaceRoute(space.slug, 'brain')),
        },
      ]
    : []

  const mission = (space.ai_lead_config?.mission as string | undefined)?.trim()

  async function refreshBriefing() {
    setTriggering(true)
    try {
      await triggerBriefing(space.id)
      briefing.reload()
    } finally {
      setTriggering(false)
    }
  }

  return (
    <DAOCompanyShell title={space.name}>
      <CompanyScroll className="DAO-space-home-scroll">
        <section className="flex flex-col items-center gap-4">
          <VoiceConsole
            greeting={greeting}
            leadName={leadName}
            onOpenChat={() => navigate(NEW_CHAT_ROUTE)}
            session={voice}
            wakeHint={wakeHint}
          />

          {pills.length > 0 ? <PulsePills pills={pills} /> : null}

          {mission ? (
            <p className="max-w-md text-center text-sm text-(--text-secondary,#a3a3a3)">
              Mission: <span className="text-(--text-primary,#fff)">{mission}</span>
            </p>
          ) : null}
        </section>

        <section className="DAO-space-home-briefing">
          <div className="DAO-space-home-briefing-head">
            <div>
              <h2 className="DAO-util-section-label">Today</h2>
              <p className="DAO-space-home-section-title">Today&apos;s briefing</p>
            </div>
            <Button disabled={triggering} onClick={() => void refreshBriefing()} size="sm" type="button" variant="ghost">
              <Codicon name="refresh" size="0.875rem" spinning={triggering} />
              {triggering ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          {briefing.loading ? (
            <BriefingCardSkeleton />
          ) : briefing.error ? (
            <CompanyError message={briefing.error} onRetry={briefing.reload} />
          ) : briefing.data?.markdown ? (
            <BriefingCard
              generatedAt={briefing.data.generated_at}
              leadName={leadName}
              markdown={briefing.data.markdown}
            />
          ) : (
            <CompanyEmpty
              description={`${leadName} compiles one each morning.`}
              leadName={leadName}
              title="No briefing yet"
            />
          )}
        </section>
      </CompanyScroll>
    </DAOCompanyShell>
  )
}
