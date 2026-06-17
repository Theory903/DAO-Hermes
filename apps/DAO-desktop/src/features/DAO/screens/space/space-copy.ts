/** User-facing Space settings copy. */

export const SPACE_SHELL = {
  title: 'Space',
  description:
    'Your company instance — name, AI Lead, team, and how the app behaves. Technical keys open in App preferences.',
} as const

export const SPACE_INTRO = {
  title: 'What you can do here',
  purpose:
    'A Space is your company’s isolated workspace. Data here never mixes with another Space. Most day-to-day work happens in Chat and Memory; this page is for setup and people.',
  links: [
    {
      key: 'memory',
      title: 'Memory',
      description: 'Facts, wiki, files, and briefings your agents remember',
    },
    {
      key: 'chat',
      title: 'Chat',
      description: 'Talk to your AI Lead and delegate work',
    },
    {
      key: 'inbox',
      title: 'Inbox',
      description: 'Approve actions that need a human yes',
    },
  ],
} as const

export const SPACE_SECTIONS = {
  identity: {
    eyebrow: 'Your Space',
    blurb: 'Switch between companies or sign out. Each Space has its own Memory, Drive, and chat history.',
  },
  lead: {
    eyebrow: 'AI Lead',
    blurb: 'Name, mission, and tone for the supervisor agent. This shapes how work is routed to departments.',
  },
  team: {
    eyebrow: 'Team',
    blurb: 'Invite colleagues by email. Roles control who can change settings and approve actions.',
  },
  you: {
    eyebrow: 'You',
    blurb: 'Optional personal touches for the Home screen greeting.',
  },
  app: {
    eyebrow: 'App',
    blurb: 'Models, API keys, theme, and gateway — opens in the native preferences panel without leaving this Space.',
  },
  voice: {
    eyebrow: 'Advanced',
    summary: 'Voice & wake word (optional)',
    blurb: 'Hands-free activation on Home. Runs on-device; requires a free Picovoice key.',
  },
} as const
