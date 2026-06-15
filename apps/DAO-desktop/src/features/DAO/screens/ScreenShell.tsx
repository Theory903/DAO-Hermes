import type { ReactNode } from 'react'

export {
  EmptyState,
  ErrorNote,
  LoadingRows,
  ScreenShell,
} from './_ui'

export function PlaceholderBadge({ children }: { children: ReactNode }) {
  return (
    <span className="DAO-badge DAO-mono" style={{ letterSpacing: '0.06em', textTransform: 'uppercase' }}>
      {children}
    </span>
  )
}
