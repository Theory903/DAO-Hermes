import { Link } from 'react-router-dom'
import { Brain, Inbox, MessageSquare } from 'lucide-react'

import { spaceRoute } from '../../routes'
import { SPACE_INTRO } from './space-copy'

const LINK_ICONS = {
  memory: Brain,
  chat: MessageSquare,
  inbox: Inbox,
} as const

type SpaceSettingsIntroProps = {
  slug: string
  spaceName: string
  leadName: string
}

export function SpaceSettingsIntro({ slug, spaceName, leadName }: SpaceSettingsIntroProps) {
  return (
    <section aria-labelledby="space-intro-heading" className="DAO-space-intro">
      <header className="DAO-space-intro-head">
        <p className="DAO-company-settings-eyebrow">Space</p>
        <h2 className="DAO-space-intro-title" id="space-intro-heading">
          {spaceName}
        </h2>
        <p className="DAO-space-intro-meta">
          AI Lead <strong>{leadName}</strong>
        </p>
        <p className="DAO-space-intro-purpose">{SPACE_INTRO.purpose}</p>
      </header>

      <div className="DAO-space-intro-links">
        <p className="DAO-panel-guide-label">{SPACE_INTRO.title}</p>
        <ul className="DAO-space-intro-link-grid">
          {SPACE_INTRO.links.map((link) => {
            const Icon = LINK_ICONS[link.key as keyof typeof LINK_ICONS]
            const to =
              link.key === 'memory'
                ? spaceRoute(slug, 'memory')
                : link.key === 'chat'
                  ? spaceRoute(slug, 'chat')
                  : spaceRoute(slug, 'inbox')
            return (
              <li key={link.key}>
                <Link className="DAO-company-settings-link" to={to}>
                  <Icon aria-hidden size={18} />
                  <span>
                    <strong>{link.title}</strong>
                    <span className="DAO-company-settings-link-desc">{link.description}</span>
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
