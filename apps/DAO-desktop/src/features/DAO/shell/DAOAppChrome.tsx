import type { CSSProperties, ReactNode } from 'react'

import { useNativeTitlebarInsets } from './useNativeTitlebarInsets'

type DAOAppChromeProps = {
  children: ReactNode
  className?: string
}

/** Applies native window-control insets so topbar utilities clear close/minimize. */
export function DAOAppChrome({ children, className }: DAOAppChromeProps) {
  const insets = useNativeTitlebarInsets()
  const style = {
    '--DAO-titlebar-inset-right': insets.paddingRight,
    '--DAO-brand-inset-left': insets.brandInsetLeft,
  } as CSSProperties

  return (
    <div
      className={className}
      data-window-fullscreen={insets.isFullscreen ? '' : undefined}
      style={style}
    >
      {children}
    </div>
  )
}
