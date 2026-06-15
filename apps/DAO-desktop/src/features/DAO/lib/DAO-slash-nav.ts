import type { NavigateFunction } from 'react-router-dom'

import type { DAOChatScreen } from './DAO-chat-commands'
import { spaceRoute } from '../routes'

let navigateFn: NavigateFunction | null = null
let slugFn: (() => string | null) | null = null

export function registerDAOSlashNavigation(
  navigate: NavigateFunction,
  getSlug: () => string | null,
): () => void {
  navigateFn = navigate
  slugFn = getSlug
  return () => {
    navigateFn = null
    slugFn = null
  }
}

export function DAOSlashNavigate(screen: DAOChatScreen): boolean {
  const slug = slugFn?.()
  if (!navigateFn || !slug) return false

  if (screen === 'chat') {
    navigateFn('/')
    return true
  }

  if (screen === 'reports' || screen === 'drive') {
    navigateFn(`${spaceRoute(slug, 'brain')}?view=${screen}`)
    return true
  }

  if (screen === 'command') {
    navigateFn(spaceRoute(slug, 'org'))
    return true
  }

  const base = spaceRoute(slug, screen === 'home' ? '' : screen)
  navigateFn(base)
  return true
}
