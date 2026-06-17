import { useCallback } from 'react'
import { Zap } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'

import { listAutomations, patchAutomation } from '../api/space-api'
import { useSpaceContext } from '../context/SpaceContext'
import { useAsync } from '../hooks/useAsync'
import {
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from './_company-shell'

export function AutomationScreen() {
  const space = useSpaceContext()
  const automations = useAsync(() => listAutomations(space.id), [space.id])

  const toggle = useCallback(
    async (slug: string, enabled: boolean) => {
      await patchAutomation(space.id, slug, { enabled: !enabled })
      automations.reload()
    },
    [space.id, automations],
  )

  const rows = automations.data?.automations ?? []

  return (
    <DAOCompanyShell
      title="Automation"
      description="Playbooks and scheduled outcomes linked to the company graph."
      searchHidden
      headerTrailing={
        <Button
          aria-label="Refresh"
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={automations.loading}
          onClick={() => automations.reload()}
          size="sm"
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={automations.loading} />
          Refresh
        </Button>
      }
    >
      <CompanyScroll>
        {automations.loading && rows.length === 0 ? (
          <CompanyLoading label="Loading automations…" />
        ) : automations.error ? (
          <CompanyError message={automations.error} onRetry={automations.reload} />
        ) : rows.length === 0 ? (
          <CompanyEmpty
            title="No automations yet"
            description="Jarvis playbooks and cron jobs appear here once configured for this Space."
          />
        ) : (
          <ul className="DAO-automation-list">
            {rows.map((row) => (
              <li key={row.slug} className="DAO-automation-row">
                <div className="DAO-automation-row__main">
                  <Zap className="size-4 text-(--ui-text-tertiary)" aria-hidden />
                  <div>
                    <span className="DAO-automation-row__name">{row.name}</span>
                    {row.cron ? (
                      <span className="DAO-automation-row__cron">{row.cron}</span>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="sm"
                  type="button"
                  variant={row.enabled ? 'default' : 'outline'}
                  onClick={() => void toggle(row.slug, row.enabled)}
                >
                  {row.enabled ? 'Enabled' : 'Disabled'}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CompanyScroll>
    </DAOCompanyShell>
  )
}
