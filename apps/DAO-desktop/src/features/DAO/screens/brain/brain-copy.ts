/** User-facing Brain copy — plain language, no internal jargon in primary UI. */

export type BrainArea = 'overview' | 'truths' | 'wiki' | 'drive' | 'reports'

export const BRAIN_SHELL = {
  title: 'Brain',
  tagline: 'Everything your company has learned — searchable and reusable.',
} as const

export const BRAIN_VIEW_COPY: Record<
  BrainArea,
  {
    shellDescription: string
    tabLabel: string
    tabHint: string
    guideTitle: string
    guidePurpose: string
    youCan: string[]
    tip?: string
  }
> = {
  overview: {
    shellDescription:
      'A single home for facts, wiki pages, files, and briefings. Open a section below to dig in.',
    tabLabel: 'Overview',
    tabHint: 'Summary of all knowledge in this Space',
    guideTitle: 'Your company memory',
    guidePurpose:
      'Brain is where work sticks around after a chat ends. Agents read from here before redoing research.',
    youCan: [
      'See what was saved recently',
      'Jump to facts, wiki, files, or briefings',
      'Spot gaps before starting a new project',
    ],
  },
  truths: {
    shellDescription:
      'Short, verified facts your agents reuse — so the same research is not run twice.',
    tabLabel: 'Facts',
    tabHint: 'Compiled truths saved for reuse',
    guideTitle: 'Saved facts',
    guidePurpose:
      'When an agent finishes research, key conclusions can be stored as a fact. Next time someone asks the same question, the answer comes from here instead of the web.',
    youCan: [
      'Read and copy a compiled fact',
      'Search by title',
      'Check how confident the system is in each fact',
    ],
    tip: 'Ask your AI Lead to “save this to Brain” after a deep dive.',
  },
  wiki: {
    shellDescription:
      'Long-form, linked notes about people, companies, and topics — built as your team learns.',
    tabLabel: 'Wiki',
    tabHint: 'Interlinked reference pages',
    guideTitle: 'Company wiki',
    guidePurpose:
      'Wiki pages are living documents: entities, concepts, and sources tied together. Facts are the short version; wiki is the full story.',
    youCan: ['Browse pages by section', 'Search titles and summaries', 'Read full markdown in place'],
    tip: 'Wiki files live under Drive → /wiki/ if you need the raw files.',
  },
  drive: {
    shellDescription:
      'Uploads, reports, and outputs from agent work — organized in folders.',
    tabLabel: 'Files',
    tabHint: 'Drive — uploads and agent artifacts',
    guideTitle: 'Company files',
    guidePurpose:
      'Store brand guides, spreadsheets, and research here. Agents attach new outputs after tasks (for example under /research/ or /writeback/).',
    youCan: ['Upload documents', 'Browse folders', 'Search by filename or path'],
    tip: 'Drag files in or use Upload. Everything is private to this Space.',
  },
  reports: {
    shellDescription:
      'Morning briefings, recent agent outputs, and a pulse of what happened in the last 24 hours.',
    tabLabel: 'Activity',
    tabHint: 'Briefings, writebacks, and Space pulse',
    guideTitle: 'Activity & briefings',
    guidePurpose:
      'Briefings are summaries from your AI Lead. Writebacks are files agents saved after using tools. Pulse shows approvals and handoffs at a glance.',
    youCan: [
      'Read the latest morning briefing',
      'Review files agents produced recently',
      'See pending approvals (links to Inbox)',
    ],
  },
}

export const BRAIN_EMPTY = {
  title: 'Nothing saved yet',
  description: (leadName: string) =>
    `When ${leadName} finishes research or you upload files, they appear here. You do not need to organize manually — agents save in the right place.`,
  steps: (leadName: string) => [
    `Chat with ${leadName}: “Research X and save the key facts to Brain.”`,
    'Upload a PDF or spreadsheet under Files.',
    'Check Home tomorrow for an automatic morning briefing.',
  ],
} as const
