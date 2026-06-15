import type { ReactNode } from 'react'

import { useAuth } from '@/features/auth'

import '../styles/void-tokens.css'
import '../styles/DAO-shell.css'
import '../styles/void-chat-shell.css'

import { DAOAppChrome } from './DAOAppChrome'
import { DAOTopbar } from './DAOTopbar'
import { useSpaceBrandLabel } from './useSpaceBrandLabel'

/** VOID company chrome wrapping Hermes chat — topbar nav + full-height body. */
export function VoidAppShell({ children }: { children: ReactNode }) {
  const { spaceSlug } = useAuth()
  const slug = spaceSlug ?? ''
  const brandLabel = useSpaceBrandLabel(slug || 'Space')

  return (
    <DAOAppChrome className="DAO-void DAO-app void-chat-root">
      <DAOTopbar brandLabel={brandLabel} slug={slug} variant="chat" />
      <div className="void-chat-body min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
    </DAOAppChrome>
  )
}
