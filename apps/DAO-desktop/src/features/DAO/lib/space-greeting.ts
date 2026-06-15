export type GreetingKind = 'chat' | 'briefing' | 'ai' | 'fallback'

export type GreetingPreferences = {
  use_chat_opener?: boolean
}

export const DEFAULT_GREETING_PREFS: Required<GreetingPreferences> = {
  use_chat_opener: true,
}

export type SpaceGreeting = {
  headline: string
  subline?: string
  kind: GreetingKind
  dateLine: string
}

export type SpaceGreetingInput = {
  displayName?: string | null
  leadName?: string
  now?: Date
  spaceId?: string
  chatGreeting?: string | null
  briefingGreeting?: string | null
  briefingSubline?: string | null
  greetingPrefs?: GreetingPreferences
}

const CHAT_GREETING_PREFIX = 'DAO_home_greeting'

const GREETING_START =
  /^(good\s+(morning|afternoon|evening|night)|happy\s+|welcome\b|hey\b|hi\b|greetings\b|namaste\b)/i

function chatGreetingKey(spaceId?: string): string {
  return spaceId ? `${CHAT_GREETING_PREFIX}:${spaceId}` : CHAT_GREETING_PREFIX
}

function localDay(now: Date): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function firstName(displayName?: string | null): string | null {
  const raw = displayName?.trim()
  if (!raw) return null
  return raw.split(/\s+/)[0] || null
}

function leadSubline(lead: string): string {
  return `${lead} is ready when you are.`
}

export function formatGreetingDateLine(now: Date): string {
  return now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })
}

export function readStoredChatGreeting(spaceId?: string, now = new Date()): string | null {
  if (typeof window === 'undefined') return null
  try {
    const keys = spaceId
      ? [chatGreetingKey(spaceId), chatGreetingKey()]
      : [chatGreetingKey()]

    for (const key of keys) {
      const raw = localStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as { text?: string; day?: string }
      if (parsed.day && parsed.day !== localDay(now)) continue
      const text = parsed.text?.trim()
      if (text) return text
    }
    return null
  } catch {
    return null
  }
}

export function clearStoredChatGreeting(spaceId?: string): void {
  if (typeof window === 'undefined') return
  const keys = spaceId
    ? [chatGreetingKey(spaceId), chatGreetingKey()]
    : [chatGreetingKey()]
  for (const key of keys) {
    localStorage.removeItem(key)
  }
  window.dispatchEvent(new CustomEvent('DAO-greeting-updated'))
}

export function storeChatGreeting(text: string, spaceId?: string, now = new Date()): void {
  if (typeof window === 'undefined') return
  const trimmed = text.trim()
  if (!trimmed) return
  localStorage.setItem(
    chatGreetingKey(spaceId),
    JSON.stringify({ text: trimmed, day: localDay(now), source: 'chat' }),
  )
  window.dispatchEvent(new CustomEvent('DAO-greeting-updated'))
}

/** Pull a short, conversational opener from an assistant reply. */
export function extractGreetingCandidate(text: string): string | null {
  const cleaned = text
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*/g, '')
    .trim()
  if (!cleaned) return null

  const firstPara = cleaned.split(/\n\n+/)[0]?.trim() ?? ''
  if (!firstPara || firstPara.startsWith('-') || firstPara.startsWith('*')) return null

  const sentence =
    firstPara.match(/^[^.!?\n]{8,180}[.!?]?/)?.[0]?.trim() ??
    firstPara.slice(0, 140).trim()

  if (!sentence || sentence.length < 8 || sentence.length > 180) return null
  if (sentence.includes('```') || sentence.includes('| ---')) return null

  if (GREETING_START.test(sentence)) return sentence
  if (firstPara.length <= 120 && !firstPara.includes('\n-')) return sentence

  return null
}

export function maybeStoreHomeGreetingFromAssistant(
  text: string,
  spaceId?: string,
  now = new Date(),
): boolean {
  const candidate = extractGreetingCandidate(text)
  if (!candidate) return false
  if (readStoredChatGreeting(spaceId, now)) return false
  storeChatGreeting(candidate, spaceId, now)
  return true
}

export function resolveSpaceGreeting(input: SpaceGreetingInput): SpaceGreeting {
  const now = input.now ?? new Date()
  const name = firstName(input.displayName)
  const lead = input.leadName?.trim() || 'AI Lead'
  const dateLine = formatGreetingDateLine(now)
  const prefs = { ...DEFAULT_GREETING_PREFS, ...input.greetingPrefs }

  if (prefs.use_chat_opener) {
    const storedChat =
      input.chatGreeting?.trim() ||
      readStoredChatGreeting(input.spaceId, now)

    if (storedChat) {
      return {
        headline: storedChat,
        subline: leadSubline(lead),
        kind: 'chat',
        dateLine,
      }
    }
  }

  const briefing = input.briefingGreeting?.trim()
  if (briefing) {
    return {
      headline: briefing,
      subline: input.briefingSubline?.trim() || leadSubline(lead),
      kind: 'briefing',
      dateLine,
    }
  }

  const headline = name ? `Welcome back, ${name}.` : 'Welcome back.'
  return {
    headline,
    subline: leadSubline(lead),
    kind: 'fallback',
    dateLine,
  }
}
