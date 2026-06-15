import type { SpaceGreeting } from '../lib/space-greeting'

import { CompanyPoweredBy } from '../screens/_company-shell'

export function SpaceHomeGreeting({
  greeting,
  leadName,
}: {
  greeting: SpaceGreeting
  leadName: string
}) {
  const note =
    greeting.kind === 'chat' ? 'From your chat today' : greeting.dateLine

  return (
    <header className="DAO-space-home-hero DAO-space-home-hero--brief DAO-space-home-greeting DAO-space-home-greeting--intro">
      <span className="DAO-company-lead-avatar DAO-company-lead-avatar--empty" aria-hidden>
        {leadName.slice(0, 1)}
      </span>
      <p className="DAO-space-home-eyebrow">{note}</p>
      <h2 className="DAO-space-home-headline">{greeting.headline}</h2>
      <CompanyPoweredBy className="DAO-space-home-powered" />
      {greeting.subline ? <p className="DAO-space-home-sub">{greeting.subline}</p> : null}
    </header>
  )
}
