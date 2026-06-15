import { DAOTopbarBrand } from './DAOTopbarBrand'
import { DAONavUtilityControls } from './DAONavUtilityControls'
import { DAOTopNav } from './DAOTopNav'

type DAOTopbarProps = {
  brandLabel: string
  slug: string
  variant?: 'default' | 'chat'
}

/** Brand left, main nav centered, utilities pinned right. */
export function DAOTopbar({ brandLabel, slug, variant = 'default' }: DAOTopbarProps) {
  const topbarClass = [
    'DAO-topbar',
    'DAO-glass',
    variant === 'chat' ? 'void-chat-topbar' : 'DAO-topbar--company'
  ].join(' ')

  return (
    <header className={topbarClass}>
      <div className="DAO-topbar-slot DAO-topbar-slot--start">
        <DAOTopbarBrand label={brandLabel} />
      </div>
      <div className="DAO-topbar-slot DAO-topbar-slot--center">
        <DAOTopNav slug={slug} variant={variant} />
      </div>
      <div className="DAO-topbar-slot DAO-topbar-slot--end">
        <DAONavUtilityControls />
      </div>
    </header>
  )
}
