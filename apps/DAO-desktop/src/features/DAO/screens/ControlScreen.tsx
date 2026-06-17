import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

import { UtilChipSwitch, UtilChipSwitchItem } from '@/app/util-page-nav'

import {
  DAOCompanyShell,
} from './_company-shell'
import { OrgScreen } from './OrgScreen'
import { SettingsScreen } from './SettingsScreen'

type ControlSection = 'general' | 'organization'

export function ControlScreen() {
  const [searchParams, setSearchParams] = useSearchParams()
  const section: ControlSection =
    searchParams.get('section') === 'organization' ? 'organization' : 'general'

  const setSection = useCallback(
    (next: ControlSection) => {
      const params = new URLSearchParams(searchParams)
      if (next === 'organization') params.set('section', 'organization')
      else params.delete('section')
      setSearchParams(params, { replace: true })
    },
    [searchParams, setSearchParams],
  )

  return (
    <DAOCompanyShell
      title="Control"
      description="Space settings, team access, and organization structure."
      searchHidden
      tabs={
        <UtilChipSwitch aria-label="Control sections">
          <UtilChipSwitchItem active={section === 'general'} onClick={() => setSection('general')}>
            General
          </UtilChipSwitchItem>
          <UtilChipSwitchItem
            active={section === 'organization'}
            onClick={() => setSection('organization')}
          >
            Organization
          </UtilChipSwitchItem>
        </UtilChipSwitch>
      }
    >
      {section === 'organization' ? <OrgScreen embedded /> : <SettingsScreen embedded />}
    </DAOCompanyShell>
  )
}
