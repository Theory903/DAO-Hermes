import type { ReactNode } from 'react'

import { PageSearchShell } from '@/app/page-search-shell'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

import { POWERED_BY_HERMES } from '../lib/space-lead'

type DAOCompanyShellProps = Omit<React.ComponentProps<'section'>, 'title'> & {
  children: ReactNode
  title?: ReactNode
  description?: ReactNode
  headerTrailing?: ReactNode
  tabs?: ReactNode
  filters?: ReactNode
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchTrailingAction?: ReactNode
  searchValue?: string
  searchHidden?: boolean
}

/** VOID util shell for /space/:slug company routes (below DAOTopbar). */
export function DAOCompanyShell({
  children,
  className,
  ...props
}: DAOCompanyShellProps) {
  return (
    <PageSearchShell {...props} className={cn('DAO-company-page h-full min-h-0', className)}>
      {children}
    </PageSearchShell>
  )
}

export function CompanyScroll({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('DAO-util-page-scroll DAO-util-scrollbar h-full overflow-y-auto', className)}>
      <div className="DAO-company-scroll-inner">{children}</div>
    </div>
  )
}

export function CompanyPoweredBy({ className }: { className?: string }) {
  return <p className={cn('DAO-powered-by', className)}>{POWERED_BY_HERMES}</p>
}

export function CompanyLeadAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span className={cn('DAO-company-lead-avatar DAO-company-lead-avatar--empty', className)} aria-hidden>
      {name.slice(0, 1)}
    </span>
  )
}

export function CompanyEmpty({
  title,
  description,
  leadName,
}: {
  title: string
  description: string
  leadName?: string
}) {
  if (leadName) {
    return (
      <div className="DAO-util-empty DAO-util-empty--lead">
        <CompanyLeadAvatar name={leadName} />
        <div>
          <div className="DAO-util-empty-title">{title}</div>
          <CompanyPoweredBy className="DAO-util-empty-powered" />
          <div className="DAO-util-empty-desc">{description}</div>
        </div>
      </div>
    )
  }

  return (
    <div className="DAO-util-empty">
      <div>
        <div className="DAO-util-empty-title">{title}</div>
        <div className="DAO-util-empty-desc">{description}</div>
      </div>
    </div>
  )
}

export function CompanyError({
  message,
  onRetry,
}: {
  message: string
  onRetry?: () => void
}) {
  return (
    <div className="DAO-company-alert DAO-company-alert--error" role="alert">
      <p>{message}</p>
      {onRetry ? (
        <Button onClick={onRetry} size="sm" type="button" variant="ghost">
          Retry
        </Button>
      ) : null}
    </div>
  )
}

export function CompanyBanner({ children, tone = 'info' }: { children: ReactNode; tone?: 'info' | 'ok' | 'warn' }) {
  return <p className={cn('DAO-company-banner', `DAO-company-banner--${tone}`)}>{children}</p>
}

export function CompanyLoading({ label = 'Loading…' }: { label?: string }) {
  return <PageLoader label={label} />
}
