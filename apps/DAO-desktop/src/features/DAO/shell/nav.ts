import {
  Brain,
  Home,
  MessageSquare,
  Network,
  Settings,
  type LucideIcon
} from 'lucide-react'

import { NEW_CHAT_ROUTE, routeSessionId } from '@/app/routes'

import { spaceRoute } from '../routes'

export type NavItem = {
  key: string
  label: string
  icon: LucideIcon
  /** Longer tooltip / aria hint when label is abbreviated. */
  hint?: string
}

export type DAONavVariant = 'default' | 'chat'

export type DAONavSegments = {
  work: NavItem[]
  knowledge: NavItem[]
  space: NavItem
}

/** Hermes chat lives at hash root — not under /space/:slug. */
export const DAO_CHAT_ROUTE = NEW_CHAT_ROUTE

export const DAO_CHAT_NAV_ITEM: NavItem = {
  key: 'chat',
  label: 'Chat',
  icon: MessageSquare,
  hint: 'Jarvis chat and sessions'
}

/** Work surfaces — daily navigation. */
export const DAO_NAV_PRIMARY_ITEMS: NavItem[] = [
  { key: '', label: 'Home', icon: Home },
  { key: 'org', label: 'Org', hint: 'Live floor, structure, and activity', icon: Network }
]

/** Knowledge hub — truths, wiki, drive, briefings, writebacks. */
export const DAO_NAV_KNOWLEDGE_ITEMS: NavItem[] = [
  {
    key: 'brain',
    label: 'Brain',
    hint: 'Truths, wiki, drive, and reports',
    icon: Brain
  }
]

/** @deprecated Use DAO_NAV_KNOWLEDGE_ITEMS */
export const DAO_NAV_KNOWLEDGE_ITEM: NavItem = DAO_NAV_KNOWLEDGE_ITEMS[0]

export const DAO_NAV_SPACE_ITEM: NavItem = {
  key: 'settings',
  label: 'Space',
  hint: 'Space settings',
  icon: Settings
}

/** Space screens — Home first; Chat is rendered separately in the topbar. */
export const DAO_COMPANY_NAV_ITEMS: NavItem[] = [
  ...DAO_NAV_PRIMARY_ITEMS,
  ...DAO_NAV_KNOWLEDGE_ITEMS,
  DAO_NAV_SPACE_ITEM
]

/** @deprecated Use DAO_COMPANY_NAV_ITEMS + DAO_CHAT_NAV_ITEM */
export const DAO_NAV_ITEMS: NavItem[] = [...DAO_COMPANY_NAV_ITEMS, DAO_CHAT_NAV_ITEM]

/** Segmented topbar items — shared by company layout and chat shell. */
export function DAONavSegments(_variant: DAONavVariant = 'default'): DAONavSegments {
  return {
    work: DAO_NAV_PRIMARY_ITEMS,
    knowledge: DAO_NAV_KNOWLEDGE_ITEMS,
    space: DAO_NAV_SPACE_ITEM
  }
}

/** @deprecated Use DAONavSegments */
export function DAOCompanyNavItems(variant: DAONavVariant = 'default'): NavItem[] {
  const { work, knowledge, space } = DAONavSegments(variant)
  return [...work, ...knowledge, space]
}

export function DAONavItems(variant: DAONavVariant = 'default'): NavItem[] {
  return [...DAOCompanyNavItems(variant), DAO_CHAT_NAV_ITEM]
}

export function DAONavHref(slug: string, key: string): string {
  if (key === 'chat') return DAO_CHAT_ROUTE
  if (!slug) return '/'
  return spaceRoute(slug, key)
}

export function isChatRoute(pathname: string): boolean {
  return pathname === DAO_CHAT_ROUTE || routeSessionId(pathname) !== null
}

export function isNavItemActive(slug: string, pathname: string, item: NavItem): boolean {
  if (item.key === 'chat') {
    return isChatRoute(pathname)
  }

  if (!slug) return false

  if (item.key === '') {
    return pathname === spaceRoute(slug, '')
  }

  if (item.key === 'brain') {
    return (
      pathname.startsWith(spaceRoute(slug, 'brain')) ||
      pathname.startsWith(spaceRoute(slug, 'reports')) ||
      pathname.startsWith(spaceRoute(slug, 'wiki')) ||
      pathname.startsWith(spaceRoute(slug, 'drive'))
    )
  }

  if (item.key === 'org') {
    return (
      pathname.startsWith(spaceRoute(slug, 'org')) ||
      pathname.startsWith(spaceRoute(slug, 'command'))
    )
  }

  return pathname.startsWith(spaceRoute(slug, item.key))
}
