import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { NEW_CHAT_ROUTE } from '@/app/routes'
import { requestComposerFocus, requestComposerInsert } from '@/app/chat/composer/focus'

import { approveFocus, ignoreFocus } from '../api/space-api'
import type { FocusCard } from '../api/types'
import { spaceRoute } from '../routes'
import { AskDaoBar } from '../components/home/AskDaoBar'
import { ChangedFeed } from '../components/home/ChangedFeed'
import { ObjectDetailSheet } from '../components/objects/ObjectDetailSheet'
import { CompanyDnaStrip } from '../components/home/CompanyDnaStrip'
import { CompanyPulseSection } from '../components/home/CompanyPulseSection'
import { CompanyStorySection } from '../components/home/CompanyStory'
import { FocusNowSection } from '../components/home/FocusNowSection'
import { LearnedCards } from '../components/home/LearnedCards'
import { MomentumSection } from '../components/home/MomentumSection'
import { OperatingStateBlock } from '../components/home/OperatingStateBlock'
import { RecommendsCards } from '../components/home/RecommendsCards'
import { WinningSignals } from '../components/home/WinningSignals'
import { useSpaceContext } from '../context/SpaceContext'
import { useHomeBundle } from '../hooks/useHomeBundle'
import { useLeadName } from '../lib/space-lead'
import { resolveSpaceGreeting } from '../lib/space-greeting'
import { useVoiceSession } from '../hooks/useVoiceSession'
import { useWakeWord } from '../hooks/useWakeWord'
import {
  CompanyError,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'

import '../styles/DAO-home.css'

export function HomeScreen() {
  const space = useSpaceContext()
  const navigate = useNavigate()
  const home = useHomeBundle(space.id)
  const leadName = useLeadName()
  const voice = useVoiceSession({ spaceId: space.id, leadName })
  const [focusBusy, setFocusBusy] = useState(false)
  const [dismissedFocusId, setDismissedFocusId] = useState<string | null>(null)
  const [detailObjectId, setDetailObjectId] = useState<string | null>(null)

  const wake = useWakeWord(() => {
    if (!voice.active) voice.toggle()
  }, voice.active)
  const wakeHint = wake.status === 'listening' && wake.keyword ? `Say “${wake.keyword}”` : null

  const greeting = useMemo(
    () =>
      resolveSpaceGreeting({
        spaceId: space.id,
        leadName,
        briefingGreeting: home.data?.pulse?.greeting,
        briefingSubline: home.data?.pulse?.greeting_subline,
      }),
    [home.data?.pulse?.greeting, home.data?.pulse?.greeting_subline, leadName, space.id],
  )

  useEffect(() => {
    if (!greeting.headline) return
    voice.greet(greeting.headline)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [greeting.headline])

  const focus =
    home.data?.focus_now && home.data.focus_now.id !== dismissedFocusId
      ? home.data.focus_now
      : null

  const alsoAttention =
    home.data?.also_attention.filter((card) => card.id !== dismissedFocusId) ?? []

  function openChatWithPrefill(text: string) {
    requestComposerInsert(text)
    requestComposerFocus('main')
    navigate(NEW_CHAT_ROUTE)
  }

  async function handleApprove(card: FocusCard) {
    if (card.kind !== 'hitl') return
    setFocusBusy(true)
    setDismissedFocusId(card.id)
    try {
      await approveFocus(space.id, card.id)
      home.reload()
    } catch {
      setDismissedFocusId(null)
    } finally {
      setFocusBusy(false)
    }
  }

  async function handleIgnore(card: FocusCard) {
    if (card.kind !== 'hitl') return
    setFocusBusy(true)
    setDismissedFocusId(card.id)
    try {
      await ignoreFocus(space.id, card.id)
      home.reload()
    } catch {
      setDismissedFocusId(null)
    } finally {
      setFocusBusy(false)
    }
  }

  function handleDiscuss(card: FocusCard) {
    openChatWithPrefill(card.context)
  }

  function handleOpenInbox(card: FocusCard) {
    navigate(`${spaceRoute(space.slug, 'inbox')}?id=${encodeURIComponent(card.id)}`)
  }

  function handleOpenObject(objectId: string) {
    setDetailObjectId(objectId)
  }

  return (
    <DAOCompanyShell title={space.name}>
      <CompanyScroll className="DAO-home-scroll">
        {home.loading ? (
          <p className="DAO-home-loading">Loading company state…</p>
        ) : home.error ? (
          <CompanyError message={home.error} onRetry={home.reload} />
        ) : home.data ? (
          <div className="DAO-home-canvas">
            <CompanyDnaStrip dna={home.data.dna} />

            <CompanyPulseSection
              greeting={greeting}
              leadName={leadName}
              onOpenChat={() => navigate(NEW_CHAT_ROUTE)}
              operatingMode={home.data.operating_mode}
              orbTone={home.data.operating_state.tone}
              session={voice}
              wakeHint={wakeHint}
            />

            <OperatingStateBlock state={home.data.operating_state} />

            <FocusNowSection
              alsoAttention={alsoAttention}
              busy={focusBusy}
              focus={focus}
              onApprove={(card) => void handleApprove(card)}
              onDiscuss={handleDiscuss}
              onIgnore={(card) => void handleIgnore(card)}
              onOpenInbox={handleOpenInbox}
              onOpenObject={handleOpenObject}
              spaceId={space.id}
            />

            <WinningSignals lines={home.data.winning_signals} />

            <MomentumSection
              heatmap={home.data.momentum.heatmap}
              rings={home.data.momentum.rings}
              score={home.data.momentum.score}
              scoreDeltaWeek={home.data.momentum.score_delta_week}
              timeMachine={home.data.momentum.time_machine}
            />

            <ChangedFeed items={home.data.changed} onOpenObject={setDetailObjectId} />
            <LearnedCards items={home.data.learned} />
            <RecommendsCards items={home.data.recommends} />
            <CompanyStorySection story={home.data.story} />

            <AskDaoBar onSubmit={openChatWithPrefill} />
          </div>
        ) : null}
      </CompanyScroll>
      <ObjectDetailSheet
        spaceId={space.id}
        objectId={detailObjectId}
        onOpenChange={(open) => !open && setDetailObjectId(null)}
      />
    </DAOCompanyShell>
  )
}
