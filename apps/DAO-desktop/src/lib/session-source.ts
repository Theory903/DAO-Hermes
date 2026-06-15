import { persistStringArray, storedStringArray } from '@/lib/storage'
import type { SessionInfo } from '@/types/hermes'

const SOURCE_LABELS: Record<string, string> = {
  api_server: 'API',
  bluebubbles: 'iMessage',
  cli: 'CLI',
  codex: 'Codex',
  desktop: 'DAO',
  discord: 'Discord',
  email: 'Email',
  gateway: 'Gateway',
  local: 'Local',
  matrix: 'Matrix',
  mattermost: 'Mattermost',
  qqbot: 'QQ',
  signal: 'Signal',
  slack: 'Slack',
  sms: 'SMS',
  telegram: 'Telegram',
  tui: 'DAO',
  voice: 'Voice',
  webhook: 'Webhook',
  weixin: 'WeChat',
  whatsapp: 'WhatsApp',
  yuanbao: 'Yuanbao'
}

const SOURCE_ALIASES: Record<string, string[]> = {
  bluebubbles: ['apple messages', 'imessage'],
  cli: ['terminal'],
  desktop: ['app', 'gui'],
  local: ['machine'],
  qqbot: ['qq'],
  telegram: ['tg'],
  tui: ['dao', 'terminal'],
  weixin: ['wechat'],
  whatsapp: ['wa']
}

// Sources that run on the local machine rather than an external messaging
// platform. A handoff *from* one of these isn't a platform origin worth a badge.
// Exported so the recents fetch can keep these in the main list while the
// messaging fetch excludes them.
export const LOCAL_SESSION_SOURCE_IDS = ['cli', 'codex', 'desktop', 'gateway', 'local', 'tui']
const LOCAL_SOURCE_IDS = new Set(LOCAL_SESSION_SOURCE_IDS)

// Home-screen "Jarvis" voice conversations. Tagged with this source on
// session.create so they bucket into their own sidebar section instead of
// landing in local recents.
export const VOICE_SESSION_SOURCE_ID = 'voice'

const VOICE_LINEAGE_STORAGE_KEY = 'dao.voiceSessionLineages'

let voiceSessionLineages = new Set(storedStringArray(VOICE_LINEAGE_STORAGE_KEY))

function persistVoiceLineages() {
  persistStringArray(VOICE_LINEAGE_STORAGE_KEY, [...voiceSessionLineages])
}

/** Remember a session lineage as voice — survives resume/refresh even if the API briefly returns tui. */
export function markVoiceSessionLineage(session: Pick<SessionInfo, '_lineage_root_id' | 'id'>): void {
  const ids = [session.id, session._lineage_root_id].filter((id): id is string => Boolean(id?.trim()))

  if (!ids.length) {
    return
  }

  let changed = false

  for (const id of ids) {
    if (!voiceSessionLineages.has(id)) {
      voiceSessionLineages.add(id)
      changed = true
    }
  }

  if (changed) {
    persistVoiceLineages()
  }
}

export function isVoiceBucketSession(session: Pick<SessionInfo, '_lineage_root_id' | 'id' | 'source'>): boolean {
  if (isVoiceSource(session.source)) {
    return true
  }

  const lineage = session._lineage_root_id ?? session.id

  return voiceSessionLineages.has(session.id) || voiceSessionLineages.has(lineage)
}

/** Voice source is write-once for sidebar bucketing — never downgrade to tui/cli on merge. */
export function withImmutableVoiceSource(
  session: SessionInfo,
  previous?: Pick<SessionInfo, '_lineage_root_id' | 'id' | 'source'> | null
): SessionInfo {
  const voice =
    isVoiceSource(session.source) ||
    (previous != null && isVoiceBucketSession(previous)) ||
    isVoiceBucketSession(session)

  if (!voice) {
    return session
  }

  markVoiceSessionLineage(session)

  if (isVoiceSource(session.source)) {
    return session
  }

  return { ...session, source: VOICE_SESSION_SOURCE_ID }
}

// External messaging platforms that each get their own self-managed sidebar
// section (fetched separately from local recents). Mirrors the gateway platform
// adapters; keep in sync with PLATFORM_ICONS in app/messaging/platform-icon.tsx.
export const MESSAGING_SESSION_SOURCE_IDS = [
  'telegram',
  'discord',
  'slack',
  'mattermost',
  'matrix',
  'signal',
  'whatsapp',
  'bluebubbles',
  'homeassistant',
  'email',
  'sms',
  'webhook',
  'api_server',
  'weixin',
  'wecom',
  'qqbot',
  'yuanbao',
  'dingtalk',
  'feishu'
]
const MESSAGING_SOURCE_IDS = new Set(MESSAGING_SESSION_SOURCE_IDS)

/** True when a source id is an external messaging platform (gets its own
 *  sidebar section) rather than a local/CLI/desktop session. */
export function isMessagingSource(source: null | string | undefined): boolean {
  const id = normalizeSessionSource(source)

  return id != null && MESSAGING_SOURCE_IDS.has(id)
}

/** True when a session belongs in the Voice sidebar section (Home Jarvis). */
export function isVoiceSource(source: null | string | undefined): boolean {
  return normalizeSessionSource(source) === VOICE_SESSION_SOURCE_ID
}

export function normalizeSessionSource(source: null | string | undefined): string | null {
  const id = source?.trim().toLowerCase()

  return id || null
}

/**
 * Resolve the origin messaging platform for a handed-off session. Returns the
 * normalized platform id (e.g. 'telegram') when the session completed a handoff
 * from a real messaging platform, otherwise null. After a handoff the live
 * source is local, so this is what drives the row's origin-platform badge.
 */
export function handoffOriginSource(
  handoffState: null | string | undefined,
  handoffPlatform: null | string | undefined
): string | null {
  if (handoffState !== 'completed') {
    return null
  }

  const id = normalizeSessionSource(handoffPlatform)

  if (!id || LOCAL_SOURCE_IDS.has(id)) {
    return null
  }

  return id
}

export function sessionSourceLabel(source: null | string | undefined): string | null {
  const id = normalizeSessionSource(source)

  if (!id) {
    return null
  }

  return SOURCE_LABELS[id] || id.replace(/[_-]+/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
}

export function sessionSourceSearchTerms(source: null | string | undefined): string[] {
  const id = normalizeSessionSource(source)
  const label = sessionSourceLabel(id)

  if (!id) {
    return []
  }

  return [id, label ?? '', ...(SOURCE_ALIASES[id] ?? [])].filter(Boolean)
}
