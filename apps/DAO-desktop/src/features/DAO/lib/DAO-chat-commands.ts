/** DAO chat slash commands — navigate company screens or trigger AI Lead tools. */

export type DAOChatScreen =
  | 'home'
  | 'chat'
  | 'inbox'
  | 'reports'
  | 'drive'
  | 'command'
  | 'org'
  | 'brain'
  | 'settings'

export type DAOChatCommand = {
  name: string
  description: string
  aliases?: string[]
  navigate?: DAOChatScreen
  prompt?: string
  localHelp?: boolean
}

export const DAO_CHAT_COMMANDS: readonly DAOChatCommand[] = [
  {
    name: '/pulse',
    description: 'Company pulse — approvals, briefings, activity',
    aliases: ['/status'],
    prompt:
      'You are my AI Lead in this Space. Call DAO_pulse (refresh briefing only if stale) and give me a tight executive summary: pending approvals, latest briefing highlights, and what needs my attention. Offer to open Inbox or Reports if relevant.',
  },
  {
    name: '/briefing',
    description: 'Refresh and summarize the morning briefing',
    aliases: ['/standup', '/morning'],
    prompt:
      'Call DAO_pulse with refresh_briefing=true, then summarize the briefing for the Board in plain language. Use DAO_navigate(screen="reports") if I should see the full history.',
  },
  {
    name: '/inbox',
    description: 'Open the approvals inbox',
    aliases: ['/approvals', '/hitl'],
    navigate: 'inbox',
  },
  {
    name: '/reports',
    description: 'Open Brain — briefings and Drive artifacts',
    aliases: ['/artifacts'],
    navigate: 'reports',
  },
  {
    name: '/drive',
    description: 'Open Brain — company Drive files',
    navigate: 'drive',
  },
  {
    name: '/command',
    description: 'Open Org — live floor and activity',
    navigate: 'command',
  },
  {
    name: '/grow',
    description: 'Growth planning — reuse, delegate, compound',
    aliases: ['/company', '/plan'],
    prompt:
      'Act as AI Lead for this Space. Call DAO_pulse, then DAO_reports. Propose the highest-leverage 3 moves to grow the company this week — reuse existing Drive artifacts, delegate cross-department work via delegate_task, and say which screen I should open. Keep it actionable, not generic SaaS advice.',
  },
  {
    name: '/delegate',
    description: 'Route work — /delegate research …',
    prompt:
      'The Board wants to delegate work. Ask which department if unclear, then use delegate_task with the right department and Drive writeback context.',
  },
  {
    name: '/DAO',
    description: 'Show DAO chat commands',
    aliases: ['/company-help'],
    localHelp: true,
  },
]

const BY_NAME = new Map<string, DAOChatCommand>(
  DAO_CHAT_COMMANDS.flatMap(cmd => [
    [cmd.name.slice(1).toLowerCase(), cmd] as const,
    ...(cmd.aliases ?? []).map(a => [a.slice(1).toLowerCase(), cmd] as const),
  ]),
)

export type ResolvedDAOCommand =
  | { kind: 'navigate'; screen: DAOChatScreen; command: string }
  | { kind: 'prompt'; text: string; command: string }
  | { kind: 'help'; command: string }

export function formatDAOCommandsHelp(): string {
  const lines = ['**DAO commands** — type `/` in chat', '']
  for (const cmd of DAO_CHAT_COMMANDS) {
    const alias = cmd.aliases?.length ? ` (${cmd.aliases.join(', ')})` : ''
    lines.push(`- \`${cmd.name}\`${alias} — ${cmd.description}`)
  }
  lines.push('', 'Tip: `/grow` runs a company planning pass. `/pulse` is the fastest orient.')
  return lines.join('\n')
}

export function filterDAOCommands(query: string): DAOChatCommand[] {
  const q = query.replace(/^\//, '').trim().toLowerCase()
  if (!q) return [...DAO_CHAT_COMMANDS]
  return DAO_CHAT_COMMANDS.filter(cmd => {
    const names = [cmd.name.slice(1), ...(cmd.aliases ?? []).map(a => a.slice(1))]
    return names.some(n => n.startsWith(q) || n.includes(q))
  })
}

export function resolveDAOChatCommand(raw: string): ResolvedDAOCommand | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('/')) return null

  const [head, ...rest] = trimmed.split(/\s+/)
  const nameKey = head.toLowerCase().slice(1)
  const spec = BY_NAME.get(nameKey)
  if (!spec) return null

  const argText = rest.join(' ').trim()

  if (spec.localHelp) {
    return { kind: 'help', command: head }
  }

  if (spec.navigate) {
    return { kind: 'navigate', screen: spec.navigate, command: head }
  }

  if (spec.name === '/delegate' && argText) {
    const dept = rest[0]?.toLowerCase() ?? ''
    const task = rest.slice(1).join(' ').trim() || argText
    return {
      kind: 'prompt',
      command: head,
      text: `Delegate to the ${dept} department: ${task}. Use delegate_task with department=${JSON.stringify(dept)} in context for Drive writeback. Summarize what you delegated.`,
    }
  }

  const prompt = spec.prompt ?? `Run ${spec.name} for this Space.`
  const withArg = argText ? `${prompt}\n\nBoard note: ${argText}` : prompt

  return { kind: 'prompt', text: withArg, command: head }
}

export function isDAOSlashCommandName(command: string): boolean {
  const normalized = command.trim().toLowerCase().split(/\s+/)[0] ?? ''
  const key = normalized.startsWith('/') ? normalized.slice(1) : normalized
  return BY_NAME.has(key)
}

export function isDAOSlashInput(value: string): boolean {
  return value.trimStart().startsWith('/')
}
