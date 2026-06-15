import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { Switch } from '@/components/ui/switch'
import { getSkills, getToolsets, toggleSkill, toggleToolset } from '@/hermes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import type { SkillInfo, ToolsetInfo } from '@/types/hermes'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PAGE_INSET_X } from '../layout-constants'
import { PageSearchShell } from '../page-search-shell'
import { UtilChipSwitch, UtilChipSwitchItem, UtilFilterSelect, utilFilterAllOption } from '../util-page-nav'
import { asText, includesQuery, prettyName, toolNames, toolsetDisplayLabel } from '../settings/helpers'
import { ToolsetConfigPanel } from '../settings/toolset-config-panel'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

const SKILLS_MODES = ['skills', 'toolsets'] as const
type SkillsMode = (typeof SKILLS_MODES)[number]

function categoryFor(skill: SkillInfo): string {
  return asText(skill.category) || 'general'
}

function filteredSkills(skills: SkillInfo[], query: string, category: string | null): SkillInfo[] {
  const q = query.trim().toLowerCase()

  return skills
    .filter(skill => {
      if (category && categoryFor(skill) !== category) {
        return false
      }

      if (!q) {
        return true
      }

      return includesQuery(skill.name, q) || includesQuery(skill.description, q) || includesQuery(skill.category, q)
    })
    .sort((a, b) => asText(a.name).localeCompare(asText(b.name)))
}

function filteredToolsets(toolsets: ToolsetInfo[], query: string): ToolsetInfo[] {
  const q = query.trim().toLowerCase()

  return toolsets
    .filter(toolset => {
      if (!q) {
        return true
      }

      const label = toolsetDisplayLabel(toolset)

      return (
        includesQuery(toolset.name, q) ||
        includesQuery(label, q) ||
        includesQuery(toolset.label, q) ||
        includesQuery(toolset.description, q) ||
        toolNames(toolset).some(name => includesQuery(name, q))
      )
    })
    .sort((a, b) => toolsetDisplayLabel(a).localeCompare(toolsetDisplayLabel(b)))
}

interface SkillsViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function SkillsView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: SkillsViewProps) {
  const { t } = useI18n()
  const [mode, setMode] = useRouteEnumParam('tab', SKILLS_MODES, 'skills')

  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState<SkillInfo[] | null>(null)
  const [toolsets, setToolsets] = useState<ToolsetInfo[] | null>(null)
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [savingSkill, setSavingSkill] = useState<string | null>(null)
  const [savingToolset, setSavingToolset] = useState<string | null>(null)
  const [expandedToolset, setExpandedToolset] = useState<string | null>(null)

  const refreshCapabilities = useCallback(async () => {
    setRefreshing(true)

    try {
      const [nextSkills, nextToolsets] = await Promise.all([getSkills(), getToolsets()])
      setSkills(nextSkills)
      setToolsets(nextToolsets)
    } catch (err) {
      notifyError(err, t.skills.skillsLoadFailed)
    } finally {
      setRefreshing(false)
    }
  }, [t])

  const refreshToolsets = useCallback(() => {
    getToolsets()
      .then(setToolsets)
      .catch(err => notifyError(err, t.skills.toolsetsRefreshFailed))
  }, [t])

  useRefreshHotkey(refreshCapabilities)

  useEffect(() => {
    void refreshCapabilities()
  }, [refreshCapabilities])

  const categories = useMemo(() => {
    if (!skills) {
      return []
    }

    const counts = new Map<string, number>()

    for (const skill of skills) {
      const key = categoryFor(skill)
      counts.set(key, (counts.get(key) || 0) + 1)
    }

    return Array.from(counts.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => ({ key, count }))
  }, [skills])

  const visibleSkills = useMemo(
    () => (skills ? filteredSkills(skills, query, mode === 'skills' ? activeCategory : null) : []),
    [activeCategory, mode, query, skills]
  )

  const visibleToolsets = useMemo(() => (toolsets ? filteredToolsets(toolsets, query) : []), [query, toolsets])

  const skillGroups = useMemo(() => {
    const groups = new Map<string, SkillInfo[]>()

    for (const skill of visibleSkills) {
      const key = categoryFor(skill)
      groups.set(key, [...(groups.get(key) || []), skill])
    }

    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [visibleSkills])

  const totalSkills = skills?.length || 0

  async function handleToggleSkill(skill: SkillInfo, enabled: boolean) {
    setSavingSkill(skill.name)

    try {
      await toggleSkill(skill.name, enabled)
      setSkills(current => current?.map(row => (row.name === skill.name ? { ...row, enabled } : row)) ?? current)
      notify({
        kind: 'success',
        title: enabled ? t.skills.skillEnabled : t.skills.skillDisabled,
        message: t.skills.appliesToNewSessions(skill.name)
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(skill.name))
    } finally {
      setSavingSkill(null)
    }
  }

  async function handleToggleToolset(toolset: ToolsetInfo, enabled: boolean) {
    setSavingToolset(toolset.name)

    try {
      await toggleToolset(toolset.name, enabled)
      setToolsets(
        current =>
          current?.map(row => (row.name === toolset.name ? { ...row, enabled, available: enabled } : row)) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? t.skills.toolsetEnabled : t.skills.toolsetDisabled,
        message: t.skills.appliesToNewSessions(toolsetDisplayLabel(toolset))
      })
    } catch (err) {
      notifyError(err, t.skills.failedToUpdate(toolsetDisplayLabel(toolset)))
    } finally {
      setSavingToolset(null)
    }
  }

  const categoryOptions = useMemo(
    () => [
      utilFilterAllOption(t.skills.all, totalSkills),
      ...categories.map(category => ({
        value: category.key,
        label: prettyName(category.key),
        count: category.count
      }))
    ],
    [categories, t.skills.all, totalSkills]
  )

  return (
    <PageSearchShell
      {...props}
      description={t.skills.pageDesc}
      title={t.skills.pageTitle}
      filters={
        mode === 'skills' && categories.length > 1 ? (
          <UtilFilterSelect
            aria-label={t.skills.filterCategories}
            onValueChange={setActiveCategory}
            options={categoryOptions}
            placeholder={t.skills.filterCategories}
            value={activeCategory}
          />
        ) : undefined
      }
      onSearchChange={setQuery}
      searchHidden={
        mode === 'skills'
          ? skills !== null && skills.length === 0
          : toolsets !== null && toolsets.length === 0
      }
      searchPlaceholder={mode === 'skills' ? t.skills.searchSkills : t.skills.searchToolsets}
      searchTrailingAction={
        <Button
          aria-label={refreshing ? t.skills.refreshing : t.skills.refresh}
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={refreshing}
          onClick={() => void refreshCapabilities()}
          size="icon-xs"
          title={refreshing ? t.skills.refreshing : t.skills.refresh}
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
        </Button>
      }
      searchValue={query}
      tabs={
        <UtilChipSwitch aria-label={t.skills.navSections}>
          <UtilChipSwitchItem active={mode === 'skills'} count={totalSkills} onClick={() => setMode('skills')}>
            {t.skills.tabSkills}
          </UtilChipSwitchItem>
          <UtilChipSwitchItem
            active={mode === 'toolsets'}
            count={toolsets?.length ?? 0}
            onClick={() => setMode('toolsets')}
          >
            {t.skills.tabToolsets}
          </UtilChipSwitchItem>
        </UtilChipSwitch>
      }
    >
      {!skills || !toolsets ? (
        <PageLoader label={t.skills.loading} />
      ) : mode === 'skills' ? (
        <div className={cn('DAO-util-page-scroll h-full overflow-y-auto', PAGE_INSET_X)}>
          {visibleSkills.length === 0 ? (
            <UtilEmptyState description={t.skills.noSkillsDesc} title={t.skills.noSkillsTitle} />
          ) : (
            <div className="DAO-util-page-content">
              {skillGroups.map(([category, list]) => (
                <div className="DAO-util-section-block" key={category}>
                  {activeCategory === null && (
                    <p className="DAO-util-section-label">{prettyName(category)}</p>
                  )}
                  <div className="DAO-util-card-grid">
                    {list.map(skill => (
                      <div className="DAO-util-capability-card" key={skill.name}>
                        <div className="DAO-util-capability-card-head">
                          <div className="DAO-util-capability-card-title truncate">{skill.name}</div>
                          <Switch
                            checked={skill.enabled}
                            disabled={savingSkill === skill.name}
                            onCheckedChange={checked => void handleToggleSkill(skill, checked)}
                            size="xs"
                          />
                        </div>
                        <p className="DAO-util-capability-card-desc">
                          {asText(skill.description) || t.skills.noDescription}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className={cn('DAO-util-page-scroll h-full overflow-y-auto', PAGE_INSET_X)}>
          {visibleToolsets.length === 0 ? (
            <UtilEmptyState description={t.skills.noToolsetsDesc} title={t.skills.noToolsetsTitle} />
          ) : (
            <div className="DAO-util-page-content">
              <div className="DAO-util-card-stack">
                {visibleToolsets.map(toolset => {
                  const tools = toolNames(toolset)
                  const label = toolsetDisplayLabel(toolset)
                  const expanded = expandedToolset === toolset.name

                  return (
                    <div className="DAO-util-capability-card DAO-util-capability-card--row" key={toolset.name}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="DAO-util-capability-card-title truncate">{label}</div>
                          <p className="DAO-util-capability-card-desc">
                            {asText(toolset.description) || t.skills.noDescription}
                          </p>
                        </div>
                        <div className="DAO-util-row-actions">
                          <button
                            aria-expanded={expanded}
                            className={cn(
                              'DAO-util-text-action',
                              toolset.configured && 'DAO-util-text-action--ok'
                            )}
                            onClick={() =>
                              setExpandedToolset(current => (current === toolset.name ? null : toolset.name))
                            }
                            type="button"
                          >
                            {toolset.configured ? t.skills.configured : t.skills.needsKeys}
                          </button>
                          <Switch
                            aria-label={t.skills.toggleToolset(label)}
                            checked={toolset.enabled}
                            disabled={savingToolset === toolset.name}
                            onCheckedChange={checked => void handleToggleToolset(toolset, checked)}
                            size="xs"
                          />
                        </div>
                      </div>
                      {expanded && tools.length > 0 && (
                        <div className="DAO-util-tag-row">
                          {tools.map(name => (
                            <span className="DAO-util-tag" key={name}>
                              {name}
                            </span>
                          ))}
                        </div>
                      )}
                      {expanded && <ToolsetConfigPanel onConfiguredChange={refreshToolsets} toolset={toolset.name} />}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </PageSearchShell>
  )
}

function UtilEmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="DAO-util-empty">
      <div>
        <div className="DAO-util-empty-title">{title}</div>
        <div className="DAO-util-empty-desc">{description}</div>
      </div>
    </div>
  )
}
