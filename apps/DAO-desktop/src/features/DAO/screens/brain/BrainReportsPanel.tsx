import { useMemo, useState } from 'react'
import { FileText, FolderOutput } from 'lucide-react'
import { Link } from 'react-router-dom'

import { UtilChipSwitch, UtilChipSwitchItem } from '@/app/util-page-nav'
import { cn } from '@/lib/utils'

import { getSpaceReports } from '../../api/space-api'
import { useLeadName } from '../../lib/space-lead'
import { useSpaceContext } from '../../context/SpaceContext'
import { useAsync } from '../../hooks/useAsync'
import { spaceRoute } from '../../routes'
import { CompanyEmpty, CompanyError } from '../_company-shell'
import { BriefingCardSkeleton } from '../BriefingCard'
import { BriefingHistoryEntry } from '../BriefingHistoryEntry'
import { WritebackRow } from '../WritebackRow'
import { BrainPanelGuide } from './BrainPanelGuide'

type ReportsTab = 'overview' | 'briefings' | 'writebacks'

export function BrainReportsPanel() {
  const space = useSpaceContext()
  const [tab, setTab] = useState<ReportsTab>('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const reports = useAsync(() => getSpaceReports(space.id), [space.id])
  const briefings = reports.data?.briefings ?? []
  const writebacks = reports.data?.writebacks ?? []
  const pulse = reports.data?.pulse
  const leadName = useLeadName()

  const filteredBriefings = useMemo(() => {
    if (!searchQuery.trim()) return briefings
    const q = searchQuery.toLowerCase()
    return briefings.filter((item) => item.markdown.toLowerCase().includes(q))
  }, [briefings, searchQuery])

  const showPulse = tab === 'overview' && pulse
  const showBriefings = tab === 'overview' || tab === 'briefings'
  const showWritebacks = tab === 'overview' || tab === 'writebacks'

  if (reports.loading && !reports.data) {
    return (
      <div className="DAO-reports-loading">
        <BriefingCardSkeleton />
      </div>
    )
  }

  if (reports.error) {
    return <CompanyError message={reports.error} onRetry={reports.reload} />
  }

  return (
    <div className="DAO-brain-panel-stack">
      <BrainPanelGuide area="reports" />
      <div className="DAO-reports-stack">
      <UtilChipSwitch aria-label="Reports views">
        <UtilChipSwitchItem active={tab === 'overview'} onClick={() => setTab('overview')}>
          Overview
        </UtilChipSwitchItem>
        <UtilChipSwitchItem active={tab === 'briefings'} count={briefings.length} onClick={() => setTab('briefings')}>
          Briefings
        </UtilChipSwitchItem>
        <UtilChipSwitchItem active={tab === 'writebacks'} count={writebacks.length} onClick={() => setTab('writebacks')}>
          Agent outputs
        </UtilChipSwitchItem>
      </UtilChipSwitch>

      {tab !== 'writebacks' ? (
        <label className="block">
          <span className="sr-only">Search briefings</span>
          <input
            className="w-full rounded-md border border-border/60 bg-background/40 px-3 py-2 text-sm outline-none focus:border-primary/40"
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search briefings…"
            type="search"
            value={searchQuery}
          />
        </label>
      ) : null}

      {showPulse ? (
        <section aria-label="Space pulse" className="DAO-reports-pulse">
          <p className="DAO-util-section-label">Pulse · last 24h</p>
          <div className="DAO-company-stat-strip">
            {pulse.pending_hitl > 0 ? (
              <Link className="DAO-company-stat DAO-company-stat--link DAO-company-stat--warn" to={spaceRoute(space.slug, 'inbox')}>
                <span className="DAO-company-stat-value">{pulse.pending_hitl}</span>
                <span className="DAO-company-stat-label">awaiting approval</span>
              </Link>
            ) : (
              <div className="DAO-company-stat">
                <span className="DAO-company-stat-value">{pulse.pending_hitl}</span>
                <span className="DAO-company-stat-label">awaiting approval</span>
              </div>
            )}
            <div className="DAO-company-stat">
              <span className="DAO-company-stat-value">{pulse.handoffs_24h}</span>
              <span className="DAO-company-stat-label">handoffs</span>
            </div>
            <div className={cn('DAO-company-stat', pulse.drive_artifacts_24h > 0 && 'DAO-company-stat--active')}>
              <span className="DAO-company-stat-value">{pulse.drive_artifacts_24h}</span>
              <span className="DAO-company-stat-label">drive artifacts</span>
            </div>
            <div className="DAO-company-stat">
              <span className="DAO-company-stat-value">{pulse.brain_entities}</span>
              <span className="DAO-company-stat-label">saved facts</span>
            </div>
          </div>
        </section>
      ) : null}

      {showBriefings ? (
        <section className="DAO-company-card">
          <div className="DAO-company-card-head">
            <FileText className="size-4" strokeWidth={1.6} />
            <div>
              <h2 className="DAO-company-card-title">Briefings</h2>
              <p className="DAO-company-card-sub">
                {briefings.length === 0
                  ? 'Morning summaries from your AI Lead'
                  : `${briefings.length} on record`}
              </p>
            </div>
          </div>
          {filteredBriefings.length === 0 ? (
            <CompanyEmpty
              description={`${leadName} stores morning briefings here after cron or manual refresh from Home.`}
              leadName={leadName}
              title={briefings.length === 0 ? 'No briefings yet' : 'No matching briefings'}
            />
          ) : tab === 'overview' && filteredBriefings[0] ? (
            <div className="DAO-reports-briefing-overview">
              <BriefingHistoryEntry item={filteredBriefings[0]} latest leadName={leadName} />
              {filteredBriefings.length > 1 ? (
                <div className="DAO-reports-briefing-archive-group">
                  <p className="DAO-util-section-label">Earlier briefings</p>
                  <ul className="DAO-reports-list">
                    {filteredBriefings.slice(1).map((item) => (
                      <li key={item.generated_at}>
                        <BriefingHistoryEntry item={item} leadName={leadName} />
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ) : (
            <ul className="DAO-reports-list">
              {filteredBriefings.map((item, index) => (
                <li key={item.generated_at}>
                  <BriefingHistoryEntry item={item} latest={index === 0} leadName={leadName} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {showWritebacks ? (
        <section className="DAO-company-card">
          <div className="DAO-company-card-head">
            <FolderOutput className="size-4" strokeWidth={1.6} />
            <div>
              <h2 className="DAO-company-card-title">Agent outputs</h2>
              <p className="DAO-company-card-sub">
                {writebacks.length === 0
                  ? 'Files agents saved after completing tasks'
                  : `${writebacks.length} recent files`}
              </p>
            </div>
          </div>
          {writebacks.length === 0 ? (
            <CompanyEmpty
              description="When agents finish tool work, they save files to Drive (often under /writeback/)."
              title="No agent outputs yet"
            />
          ) : (
            <ul className="DAO-reports-writeback-list">
              {writebacks.map((item) => (
                <WritebackRow item={item} key={item.object_id} spaceSlug={space.slug} />
              ))}
            </ul>
          )}
        </section>
      ) : null}
      </div>
    </div>
  )
}
