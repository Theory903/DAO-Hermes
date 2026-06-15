import { NavLink } from 'react-router-dom'

import { DAO_CHAT_NAV_ITEM, DAO_COMPANY_NAV_ITEMS, DAONavHref } from './nav'

interface DAONavProps {
  slug: string
  spaceName: string
  tier?: string
}

export function DAONav({ slug, spaceName, tier }: DAONavProps) {
  return (
    <nav className="flex h-full flex-col px-3 py-4">
      <div className="mb-6 px-2">
        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{spaceName}</p>
        {tier ? (
          <p className="mt-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">{tier}</p>
        ) : null}
      </div>

      <ul className="flex flex-1 flex-col gap-1">
        {[...DAO_COMPANY_NAV_ITEMS, DAO_CHAT_NAV_ITEM].map(item => (
          <li key={item.key || 'home'}>
            <NavLink
              className={({ isActive }) =>
                [
                  'flex items-center gap-2.5 rounded-[var(--radius-void-compact)] border border-transparent px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'DAO-nav-active font-medium'
                    : 'text-[var(--text-secondary)] hover:bg-[var(--void-elevated)] hover:text-[var(--text-primary)]'
                ].join(' ')
              }
              end={item.key === ''}
              to={DAONavHref(slug, item.key)}
            >
              <item.icon className="size-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          </li>
        ))}
      </ul>

      <p className="px-2 pt-4 font-mono text-[10px] text-[var(--text-muted)]">DAO OS · VOID UI</p>
    </nav>
  )
}
