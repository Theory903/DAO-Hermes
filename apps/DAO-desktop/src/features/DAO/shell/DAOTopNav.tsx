import type { MouseEvent } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { useStore } from '@nanostores/react'

import { $sidebarOpen, setSidebarOpen, toggleSidebarOpen } from '@/store/layout'
import { triggerHaptic } from '@/lib/haptics'

import {
  DAO_CHAT_NAV_ITEM,
  DAO_CHAT_ROUTE,
  DAONavHref,
  DAONavSegments,
  isChatRoute,
  isNavItemActive,
  type DAONavVariant,
  type NavItem
} from './nav'

type DAOTopNavProps = {
  slug: string
  variant?: DAONavVariant
}

function navItemClass(isActive: boolean, extra?: string) {
  return ['DAO-nav-item', isActive ? 'DAO-nav-active' : '', extra].filter(Boolean).join(' ')
}

function DAONavLink({
  disabled,
  isActive,
  item,
  slug
}: {
  disabled?: boolean
  isActive: boolean
  item: NavItem
  slug: string
}) {
  const title = item.hint ?? item.label

  if (disabled) {
    return (
      <span
        aria-disabled="true"
        className={navItemClass(false, 'DAO-nav-item--disabled')}
        title={title}
      >
        <item.icon size={16} aria-hidden />
        <span className="DAO-nav-label">{item.label}</span>
      </span>
    )
  }

  return (
    <NavLink
      to={DAONavHref(slug, item.key)}
      aria-current={isActive ? 'page' : undefined}
      className={() => navItemClass(isActive)}
      end={item.key === ''}
      title={title}
    >
      <item.icon size={16} aria-hidden />
      <span className="DAO-nav-label">{item.label}</span>
    </NavLink>
  )
}

/** Horizontal VOID nav — shared by company layout and chat shell topbar. */
export function DAOTopNav({ slug, variant = 'default' }: DAOTopNavProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const sidebarOpen = useStore($sidebarOpen)
  const chatActive = isChatRoute(location.pathname)
  const navDisabled = !slug
  const { work, knowledge, space } = DAONavSegments(variant)

  const openChat = () => {
    triggerHaptic('tap')
    if (!chatActive) {
      navigate(DAO_CHAT_ROUTE)
      setSidebarOpen(true)
      return
    }
    toggleSidebarOpen()
  }

  const onChatFromCompany = (event: MouseEvent<HTMLAnchorElement>) => {
    if (variant === 'chat') return
    event.preventDefault()
    triggerHaptic('tap')
    navigate(DAO_CHAT_ROUTE)
    setSidebarOpen(true)
  }

  const chatTitle =
    variant === 'chat' && chatActive
      ? sidebarOpen
        ? 'Hide sessions'
        : 'Show sessions'
      : (DAO_CHAT_NAV_ITEM.hint ?? DAO_CHAT_NAV_ITEM.label)

  return (
    <nav
      className={`DAO-nav${variant === 'chat' ? ' DAO-nav--chat' : ' DAO-nav--company'}`}
      aria-label={variant === 'chat' ? 'Workspace navigation' : 'Space navigation'}
    >
      <div className="DAO-nav-segment DAO-nav-segment--primary" role="group" aria-label="Work">
        {work.map(item => (
          <DAONavLink
            disabled={navDisabled}
            isActive={isNavItemActive(slug, location.pathname, item)}
            item={item}
            key={item.key || 'home'}
            slug={slug}
          />
        ))}
      </div>

      {knowledge.length > 0 ? (
        <div className="DAO-nav-segment DAO-nav-segment--knowledge" role="group" aria-label="Brain">
          {knowledge.map(item => (
            <DAONavLink
              disabled={navDisabled}
              isActive={isNavItemActive(slug, location.pathname, item)}
              item={item}
              key={item.key}
              slug={slug}
            />
          ))}
        </div>
      ) : null}

      <div className="DAO-nav-segment DAO-nav-segment--space" role="group" aria-label="Space settings">
        <DAONavLink
          disabled={navDisabled}
          isActive={isNavItemActive(slug, location.pathname, space)}
          item={space}
          slug={slug}
        />
      </div>

      <div className="DAO-nav-divider" aria-hidden="true" />

      <div className="DAO-nav-segment DAO-nav-segment--chat" role="group" aria-label="Chat">
        {variant === 'chat' ? (
          <button
            type="button"
            className={navItemClass(chatActive, 'DAO-nav-chat-toggle')}
            aria-current={chatActive ? 'page' : undefined}
            aria-pressed={chatActive ? sidebarOpen : undefined}
            aria-label={chatTitle}
            title={chatTitle}
            onClick={openChat}
          >
            {chatActive && sidebarOpen ? (
              <PanelLeftClose size={16} aria-hidden />
            ) : (
              <PanelLeft size={16} aria-hidden />
            )}
            <span className="DAO-nav-label">{DAO_CHAT_NAV_ITEM.label}</span>
          </button>
        ) : (
          <NavLink
            to={DAONavHref(slug, DAO_CHAT_NAV_ITEM.key)}
            aria-current={chatActive ? 'page' : undefined}
            className={() => navItemClass(chatActive)}
            title={DAO_CHAT_NAV_ITEM.hint ?? DAO_CHAT_NAV_ITEM.label}
            onClick={onChatFromCompany}
          >
            <DAO_CHAT_NAV_ITEM.icon size={16} aria-hidden />
            <span className="DAO-nav-label">{DAO_CHAT_NAV_ITEM.label}</span>
          </NavLink>
        )}
      </div>
    </nav>
  )
}
