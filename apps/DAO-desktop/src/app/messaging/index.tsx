import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { PageLoader } from '@/components/page-loader'
import { StatusDot, type StatusTone } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  getMessagingPlatforms,
  type MessagingEnvVarInfo,
  type MessagingPlatformInfo,
  updateMessagingPlatform
} from '@/hermes'
import { type Translations, useI18n } from '@/i18n'
import { AlertTriangle, ExternalLink, Save, Trash2 } from '@/lib/icons'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { PageSearchShell } from '../page-search-shell'
import { UtilChipSwitch, UtilChipSwitchItem, UtilSideNavItem } from '../util-page-nav'
import { CREDENTIAL_CONTROL_CLASS } from '../settings/credential-key-ui'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { PlatformAvatar } from './platform-icon'

interface MessagingViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

type EditMap = Record<string, Record<string, string>>

const stateLabel = (state: null | string | undefined, m: Translations['messaging']) =>
  state ? m.states[state] || state.replace(/_/g, ' ') : m.unknown

function stateTone({ enabled, state }: MessagingPlatformInfo): StatusTone {
  if (!enabled) {
    return 'muted'
  }

  if (state === 'connected') {
    return 'good'
  }

  if (state === 'fatal' || state === 'startup_failed') {
    return 'bad'
  }

  return 'warn'
}

function pillClass(tone: StatusTone): string {
  if (tone === 'good') {
    return 'DAO-messaging-pill DAO-messaging-pill--good'
  }

  if (tone === 'bad') {
    return 'DAO-messaging-pill DAO-messaging-pill--bad'
  }

  if (tone === 'warn') {
    return 'DAO-messaging-pill DAO-messaging-pill--warn'
  }

  return 'DAO-messaging-pill DAO-messaging-pill--muted'
}

const trimEdits = (edits: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(edits)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v)
  )

const FIELD_COPY: Record<string, { advanced?: boolean }> = {
  TELEGRAM_PROXY: { advanced: true },
  DISCORD_REPLY_TO_MODE: { advanced: true },
  DISCORD_ALLOW_ALL_USERS: { advanced: true },
  DISCORD_HOME_CHANNEL: { advanced: true },
  DISCORD_HOME_CHANNEL_NAME: { advanced: true },
  BLUEBUBBLES_ALLOW_ALL_USERS: { advanced: true },
  MATTERMOST_ALLOW_ALL_USERS: { advanced: true },
  MATTERMOST_HOME_CHANNEL: { advanced: true },
  QQ_ALLOW_ALL_USERS: { advanced: true },
  QQBOT_HOME_CHANNEL: { advanced: true },
  QQBOT_HOME_CHANNEL_NAME: { advanced: true },
  WHATSAPP_ENABLED: { advanced: true },
  WHATSAPP_MODE: { advanced: true }
}

function fieldCopy(field: MessagingEnvVarInfo, m: Translations['messaging']) {
  const copy = FIELD_COPY[field.key] || {}
  const localized = m.fieldCopy[field.key] || {}

  return {
    label: localized.label || field.prompt || field.key,
    help: localized.help || field.description,
    placeholder: localized.placeholder || field.prompt,
    advanced: Boolean(copy.advanced || field.advanced)
  }
}

type PlatformFilter = 'all' | 'enabled' | 'needs_setup'

function needsSetup(platform: MessagingPlatformInfo): boolean {
  return !platform.configured || platform.state === 'not_configured'
}

export function MessagingView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: MessagingViewProps) {
  const { t } = useI18n()
  const m = t.messaging
  const [platforms, setPlatforms] = useState<MessagingPlatformInfo[] | null>(null)
  const [edits, setEdits] = useState<EditMap>({})
  const [query, setQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const platformIds = useMemo(() => platforms?.map(p => p.id) ?? [], [platforms])
  const [selectedId, setSelectedId] = useRouteEnumParam('platform', platformIds, platformIds[0] ?? '')

  const refreshPlatforms = useCallback(async (silent = false) => {
    if (!silent) {
      setRefreshing(true)
    }

    try {
      const result = await getMessagingPlatforms()
      setPlatforms(result.platforms)
    } catch (err) {
      if (!silent) {
        notifyError(err, m.loadFailed)
      }
    } finally {
      if (!silent) {
        setRefreshing(false)
      }
    }
  }, [m])

  useRefreshHotkey(() => void refreshPlatforms())

  useEffect(() => {
    void refreshPlatforms()
  }, [refreshPlatforms])

  useEffect(() => {
    let cancelled = false

    function tick() {
      if (cancelled || document.hidden) {
        return
      }

      void refreshPlatforms(true)
    }

    const id = window.setInterval(tick, 6000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [refreshPlatforms])

  const selected = useMemo(() => {
    if (!platforms) {
      return null
    }

    return platforms.find(platform => platform.id === selectedId) || platforms[0] || null
  }, [platforms, selectedId])

  const platformCounts = useMemo(() => {
    if (!platforms) {
      return { all: 0, enabled: 0, needs_setup: 0 }
    }

    return {
      all: platforms.length,
      enabled: platforms.filter(platform => platform.enabled).length,
      needs_setup: platforms.filter(needsSetup).length
    }
  }, [platforms])

  const visiblePlatforms = useMemo(() => {
    if (!platforms) {
      return []
    }

    let list = platforms

    if (platformFilter === 'enabled') {
      list = list.filter(platform => platform.enabled)
    } else if (platformFilter === 'needs_setup') {
      list = list.filter(needsSetup)
    }

    const q = query.trim().toLowerCase()

    if (!q) {
      return list
    }

    return list.filter(platform =>
      [platform.id, platform.name, platform.description, platform.state]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    )
  }, [platforms, platformFilter, query])

  useEffect(() => {
    if (visiblePlatforms.length === 0) {
      return
    }

    if (!visiblePlatforms.some(platform => platform.id === selectedId)) {
      setSelectedId(visiblePlatforms[0].id)
    }
  }, [selectedId, setSelectedId, visiblePlatforms])

  async function handleToggle(platform: MessagingPlatformInfo, enabled: boolean) {
    setSaving(`enabled:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { enabled })
      setPlatforms(
        current =>
          current?.map(row =>
            row.id === platform.id
              ? {
                  ...row,
                  enabled,
                  state: enabled ? (row.configured ? 'pending_restart' : 'not_configured') : 'disabled'
                }
              : row
          ) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? m.platformEnabled(platform.name) : m.platformDisabled(platform.name),
        message: m.restartToApply
      })
    } catch (err) {
      notifyError(err, m.failedUpdate(platform.name))
    } finally {
      setSaving(null)
    }
  }

  async function handleSave(platform: MessagingPlatformInfo) {
    const env = trimEdits(edits[platform.id] || {})

    if (Object.keys(env).length === 0) {
      return
    }

    setSaving(`env:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { env })
      setEdits(current => ({ ...current, [platform.id]: {} }))
      await refreshPlatforms()
      notify({
        kind: 'success',
        title: m.setupSaved(platform.name),
        message: m.restartToReconnect
      })
    } catch (err) {
      notifyError(err, m.failedSave(platform.name))
    } finally {
      setSaving(null)
    }
  }

  async function handleClear(platform: MessagingPlatformInfo, key: string) {
    setSaving(`clear:${key}`)

    try {
      await updateMessagingPlatform(platform.id, { clear_env: [key] })
      setEdits(current => ({
        ...current,
        [platform.id]: {
          ...(current[platform.id] || {}),
          [key]: ''
        }
      }))
      await refreshPlatforms()
      notify({ kind: 'success', title: m.keyCleared(key), message: m.setupUpdated(platform.name) })
    } catch (err) {
      notifyError(err, m.failedClear(key))
    } finally {
      setSaving(null)
    }
  }

  return (
    <PageSearchShell
      {...props}
      description={m.pageDesc}
      title={m.pageTitle}
      filters={
        (platforms?.length ?? 0) > 0 ? (
          <UtilChipSwitch aria-label={m.filterPlatforms}>
            <UtilChipSwitchItem
              active={platformFilter === 'all'}
              count={platformCounts.all}
              onClick={() => setPlatformFilter('all')}
            >
              {m.filterAll}
            </UtilChipSwitchItem>
            <UtilChipSwitchItem
              active={platformFilter === 'enabled'}
              count={platformCounts.enabled}
              onClick={() => setPlatformFilter('enabled')}
            >
              {m.filterEnabled}
            </UtilChipSwitchItem>
            <UtilChipSwitchItem
              active={platformFilter === 'needs_setup'}
              count={platformCounts.needs_setup}
              onClick={() => setPlatformFilter('needs_setup')}
            >
              {m.filterNeedsSetup}
            </UtilChipSwitchItem>
          </UtilChipSwitch>
        ) : undefined
      }
      onSearchChange={setQuery}
      searchHidden={platforms !== null && platforms.length === 0}
      searchPlaceholder={m.search}
      searchTrailingAction={
        <Button
          aria-label={refreshing ? t.skills.refreshing : t.skills.refresh}
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          disabled={refreshing}
          onClick={() => void refreshPlatforms()}
          size="icon-xs"
          title={refreshing ? t.skills.refreshing : t.skills.refresh}
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={refreshing} />
        </Button>
      }
      searchValue={query}
    >
      {!platforms ? (
        <PageLoader label={m.loading} />
      ) : visiblePlatforms.length === 0 ? (
        <MessagingEmptyState description={m.noMatchDesc} title={m.noMatchTitle} />
      ) : (
        <div className="DAO-messaging-layout">
          <aside aria-label={m.platformsLabel} className="DAO-messaging-sidebar">
            <div className="DAO-messaging-sidebar-head">
              <div className="DAO-messaging-sidebar-head-copy">
                <p className="DAO-messaging-sidebar-label">{m.platformsLabel}</p>
                <p className="DAO-messaging-sidebar-sub">{m.poweredByHermes}</p>
              </div>
              <span className="DAO-messaging-sidebar-count">{visiblePlatforms.length}</span>
            </div>
            <div className="DAO-messaging-sidebar-scroll DAO-messaging-sidebar-scrollbar">
              <ul className="DAO-messaging-sidebar-list">
                {visiblePlatforms.map(platform => (
                  <li className="DAO-messaging-sidebar-item" key={platform.id}>
                    <PlatformRow
                      active={selected?.id === platform.id}
                      onSelect={() => setSelectedId(platform.id)}
                      platform={platform}
                    />
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          <main className="DAO-messaging-panel">
            {selected ? (
              <PlatformDetail
                edits={edits[selected.id] || {}}
                onClear={key => void handleClear(selected, key)}
                onEdit={(key, value) =>
                  setEdits(current => ({
                    ...current,
                    [selected.id]: {
                      ...(current[selected.id] || {}),
                      [key]: value
                    }
                  }))
                }
                onSave={() => void handleSave(selected)}
                onToggle={enabled => void handleToggle(selected, enabled)}
                platform={selected}
                saving={saving}
              />
            ) : null}
          </main>
        </div>
      )}
    </PageSearchShell>
  )
}

function MessagingEmptyState({ description, title }: { description: string; title: string }) {
  return (
    <div className="DAO-util-empty h-full">
      <div>
        <div className="DAO-util-empty-title">{title}</div>
        <div className="DAO-util-empty-desc">{description}</div>
      </div>
    </div>
  )
}

function PlatformRow({
  active,
  onSelect,
  platform
}: {
  active: boolean
  onSelect: () => void
  platform: MessagingPlatformInfo
}) {
  const { t } = useI18n()
  const m = t.messaging
  const tone = stateTone(platform)
  const hint = !platform.enabled
    ? m.disabled
    : needsSetup(platform)
      ? m.needsSetup
      : stateLabel(platform.state, m)

  return (
    <UtilSideNavItem
      active={active}
      avatar={<PlatformAvatar className="size-7 rounded-lg" platformId={platform.id} platformName={platform.name} />}
      hint={hint}
      onClick={onSelect}
      trailing={<StatusDot tone={tone} />}
    >
      {platform.name}
    </UtilSideNavItem>
  )
}

function PlatformDetail({
  edits,
  onClear,
  onEdit,
  onSave,
  onToggle,
  platform,
  saving
}: {
  edits: Record<string, string>
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  onSave: () => void
  onToggle: (enabled: boolean) => void
  platform: MessagingPlatformInfo
  saving: string | null
}) {
  const { t } = useI18n()
  const m = t.messaging
  const [showAdvanced, setShowAdvanced] = useState(false)

  const hasEdits = Object.keys(trimEdits(edits)).length > 0
  const requiredFields = platform.env_vars.filter(field => field.required)
  const optionalFields = platform.env_vars.filter(field => !field.required && !fieldCopy(field, m).advanced)
  const advancedFields = platform.env_vars.filter(field => !field.required && fieldCopy(field, m).advanced)
  const hiddenCount = advancedFields.length
  const isSavingEnv = saving === `env:${platform.id}`

  return (
    <>
      <div className="DAO-messaging-panel-scroll DAO-util-scrollbar">
        <div className="DAO-messaging-detail">
          <header className="DAO-messaging-hero-card">
            <PlatformAvatar
              className="size-11 rounded-xl text-base"
              platformId={platform.id}
              platformName={platform.name}
            />
            <div className="DAO-messaging-hero-copy">
              <div className="DAO-messaging-hero-top">
                <h2 className="DAO-messaging-detail-title">{platform.name}</h2>
                <Switch
                  aria-label={platform.enabled ? m.disableAria(platform.name) : m.enableAria(platform.name)}
                  checked={platform.enabled}
                  disabled={saving === `enabled:${platform.id}`}
                  onCheckedChange={onToggle}
                  size="xs"
                />
              </div>
              <p className="DAO-messaging-detail-desc">{platform.description}</p>
              <MessagingStatusPills platform={platform} />
              <PlatformHint platform={platform} />
            </div>
          </header>

          {platform.error_message ? (
            <div className="DAO-messaging-alert" role="alert">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{platform.error_message}</span>
            </div>
          ) : null}

          <section className="DAO-messaging-section">
            <h3 className="DAO-messaging-section-title">{m.getCredentials}</h3>
            <div className="DAO-messaging-setup-card">
              <p className="DAO-messaging-setup-card-lead">{introCopy(platform, m)}</p>
              <div className="DAO-messaging-setup-card-action">
                <Button asChild size="sm" variant="textStrong">
                  <a href={platform.docs_url} rel="noreferrer" target="_blank">
                    {m.openSetupGuide}
                    <ExternalLink className="size-3.5" />
                  </a>
                </Button>
              </div>
            </div>
          </section>

          <section className="DAO-messaging-section">
            <h3 className="DAO-messaging-section-title">{m.required}</h3>
            {requiredFields.length > 0 ? (
              <div className="DAO-messaging-field-stack">
                {requiredFields.map(field => (
                  <MessagingField
                    edits={edits}
                    field={field}
                    key={field.key}
                    onClear={onClear}
                    onEdit={onEdit}
                    saving={saving}
                  />
                ))}
              </div>
            ) : (
              <p className="DAO-messaging-section-empty">{m.noTokenNeeded}</p>
            )}
          </section>

          {optionalFields.length > 0 ? (
            <section className="DAO-messaging-section">
              <h3 className="DAO-messaging-section-title">{m.recommended}</h3>
              <div className="DAO-messaging-field-stack">
                {optionalFields.map(field => (
                  <MessagingField
                    edits={edits}
                    field={field}
                    key={field.key}
                    onClear={onClear}
                    onEdit={onEdit}
                    saving={saving}
                  />
                ))}
              </div>
            </section>
          ) : null}

          {hiddenCount > 0 ? (
            <section className="DAO-messaging-section">
              <button
                className="DAO-messaging-advanced-toggle"
                onClick={() => setShowAdvanced(value => !value)}
                type="button"
              >
                <span>{m.advanced(hiddenCount)}</span>
                <DisclosureCaret open={showAdvanced} size="0.875rem" />
              </button>
              {showAdvanced ? (
                <div className="DAO-messaging-field-stack mt-3">
                  {advancedFields.map(field => (
                    <MessagingField
                      edits={edits}
                      field={field}
                      key={field.key}
                      onClear={onClear}
                      onEdit={onEdit}
                      saving={saving}
                    />
                  ))}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      </div>

      {hasEdits ? (
        <footer className="DAO-messaging-save-dock">
          <div className="DAO-messaging-save-dock-inner">
            <span className="DAO-messaging-save-hint">{m.unsavedChanges}</span>
            <Button disabled={isSavingEnv} onClick={onSave} size="sm">
              <Save />
              {isSavingEnv ? m.saving : m.saveChanges}
            </Button>
          </div>
        </footer>
      ) : null}
    </>
  )
}

const PLATFORM_INTRO: Record<string, string> = {
  telegram:
    'In Telegram, talk to @BotFather, run /newbot, and copy the token it gives you. Then grab your numeric user ID from @userinfobot.',
  discord:
    'Open the Discord Developer Portal, create an application, add a Bot, then copy its token. Invite the bot to your server with the right scopes.',
  slack:
    'Create a Slack app, enable Socket Mode, install it to your workspace, then copy the bot token and app-level token.',
  mattermost:
    'On your Mattermost server, create a bot account or personal access token, then paste the server URL and token here.',
  matrix: 'Sign in to your homeserver with the bot account, then copy the access token, user ID, and homeserver URL.',
  signal:
    'Run a signal-cli REST bridge somewhere reachable, then point the DAO agent at the URL and the registered phone number.',
  whatsapp:
    'Start the WhatsApp bridge included with the agent runtime, scan the QR code on first run, then enable the platform.',
  bluebubbles:
    'Run BlueBubbles Server on a Mac with iMessage, expose its API, then point the DAO agent at the URL with the server password.',
  homeassistant:
    'In Home Assistant, open your profile and create a long-lived access token. Paste it here along with your HA URL.',
  email:
    'Use a dedicated mailbox. For Gmail/Workspace, create an app password and use imap.gmail.com / smtp.gmail.com.',
  sms: 'Get your Twilio Account SID and Auth Token from the Twilio console, plus a phone number that can send SMS.',
  dingtalk: 'Create a DingTalk app in the developer console, then copy the Client ID (App key) and Client Secret here.',
  feishu:
    'Create a Feishu / Lark app, configure the bot capability, and copy the App ID, App secret, and event encryption keys.',
  wecom:
    'Add a group robot in WeCom and copy its webhook key as WECOM_BOT_ID. Send-only — use the WeCom (app) option for two-way.',
  wecom_callback:
    'Set up a WeCom self-built app, expose its callback URL, and provide the corp ID, secret, agent ID, and AES key.',
  weixin:
    'Sign in to the WeChat Official Account platform, copy the AppID and Token, and point the message callback URL at your DAO agent.',
  qqbot: 'Register an app on the QQ Open Platform (q.qq.com) and copy the App ID and Client Secret.',
  api_server:
    'Expose the DAO agent as an OpenAI-compatible API. Set an auth key, then point Open WebUI / LobeChat / etc. at the host:port.',
  webhook:
    'Run an HTTP server that other tools (GitHub, GitLab, custom apps) can POST to. Use the secret to verify signatures.'
}

const introCopy = (platform: MessagingPlatformInfo, m: Translations['messaging']) =>
  m.platformIntro[platform.id] || PLATFORM_INTRO[platform.id] || platform.description

function MessagingField({
  edits,
  field,
  onClear,
  onEdit,
  saving
}: {
  edits: Record<string, string>
  field: MessagingEnvVarInfo
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  saving: string | null
}) {
  const { t } = useI18n()
  const m = t.messaging
  const copy = fieldCopy(field, m)
  const fieldId = `messaging-field-${field.key}`

  return (
    <div className="DAO-messaging-field DAO-messaging-field-card">
      <div className="DAO-messaging-field-head">
        <label className="DAO-messaging-field-label" htmlFor={fieldId}>
          {copy.label}
        </label>
        {field.is_set ? <span className="DAO-messaging-field-badge">{m.saved}</span> : null}
      </div>
      {copy.help ? <p className="DAO-messaging-field-help">{copy.help}</p> : null}
      <div className="DAO-messaging-field-control">
        <Input
          className={cn(CREDENTIAL_CONTROL_CLASS, 'DAO-messaging-field-input')}
          id={fieldId}
          onChange={event => onEdit(field.key, event.target.value)}
          placeholder={field.is_set ? field.redacted_value || m.replaceValue : copy.placeholder}
          type={field.is_password ? 'password' : 'text'}
          value={edits[field.key] || ''}
        />
        {field.url ? (
          <Button asChild className="size-8 shrink-0" title={m.openDocs} variant="ghost">
            <a href={field.url} rel="noreferrer" target="_blank">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        ) : null}
        {field.is_set ? (
          <Button
            className="size-8 shrink-0"
            disabled={saving === `clear:${field.key}`}
            onClick={() => onClear(field.key)}
            title={m.clearField(field.key)}
            variant="ghost"
          >
            <Trash2 className="size-3.5" />
          </Button>
        ) : null}
      </div>
    </div>
  )
}

function PlatformHint({ platform }: { platform: MessagingPlatformInfo }) {
  const { t } = useI18n()

  if (!platform.enabled || platform.state === 'connected') {
    return null
  }

  const hint =
    platform.state === 'pending_restart'
      ? t.messaging.hintPendingRestart
      : platform.gateway_running
        ? null
        : t.messaging.hintGatewayStopped

  return hint ? <p className="DAO-messaging-hint">{hint}</p> : null
}

function MessagingStatusPills({ platform }: { platform: MessagingPlatformInfo }) {
  const { t } = useI18n()
  const m = t.messaging
  const tone = stateTone(platform)
  const pills: { key: string; label: string; tone: StatusTone }[] = [
    {
      key: 'state',
      label: !platform.enabled ? m.disabled : stateLabel(platform.state, m),
      tone
    },
    {
      key: 'credentials',
      label: platform.configured ? m.credentialsSet : m.needsSetup,
      tone: platform.configured ? 'good' : 'warn'
    }
  ]

  if (!platform.gateway_running) {
    pills.push({ key: 'gateway', label: m.gatewayStopped, tone: 'warn' })
  }

  return (
    <div className="DAO-messaging-pills">
      {pills.map(pill => (
        <span className={pillClass(pill.tone)} key={pill.key}>
          <StatusDot tone={pill.tone} />
          {pill.label}
        </span>
      ))}
    </div>
  )
}
