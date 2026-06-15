import type { ReactNode } from 'react'

import { SearchField } from '@/components/ui/search-field'
import { cn } from '@/lib/utils'

interface PageSearchShellProps extends Omit<React.ComponentProps<'section'>, 'title'> {
  children: ReactNode
  /** Large page title shown in the header band. */
  title?: ReactNode
  /** One-line supporting copy under the title. */
  description?: ReactNode
  /** Optional trailing element on the headline row (stats, primary action). */
  headerTrailing?: ReactNode
  /** Primary tabs shown on the top row, beside the search. */
  tabs?: ReactNode
  /** Secondary filters — inline in the toolbar (scrolls horizontally). */
  filters?: ReactNode
  onSearchChange?: (value: string) => void
  searchPlaceholder?: string
  searchTrailingAction?: ReactNode
  searchValue?: string
  /** Hide the search field when there's nothing to search (empty dataset). */
  searchHidden?: boolean
}

export function PageSearchShell({
  children,
  className,
  title,
  description,
  headerTrailing,
  tabs,
  filters,
  onSearchChange,
  searchPlaceholder = '',
  searchTrailingAction,
  searchValue = '',
  searchHidden = false,
  ...props
}: PageSearchShellProps) {
  const showHeadline = Boolean(title) || Boolean(description) || Boolean(headerTrailing)
  const showSearch = Boolean(onSearchChange) && !searchHidden
  const showToolbar = Boolean(tabs) || Boolean(filters) || showSearch

  return (
    <section
      {...props}
      className={cn(
        'DAO-util-page flex h-full min-w-0 flex-col overflow-hidden bg-(--ui-chat-surface-background)',
        className
      )}
    >
      {showHeadline || showToolbar ? (
        <div className="DAO-util-page-header shrink-0" data-has-headline={showHeadline ? 'true' : 'false'}>
          {showHeadline ? (
            <div className="DAO-util-page-headline">
              <div className="DAO-util-page-headline-text">
                {title ? <h1 className="DAO-util-page-title">{title}</h1> : null}
                {description ? <p className="DAO-util-page-subtitle">{description}</p> : null}
              </div>
              {headerTrailing ? <div className="DAO-util-page-headline-trailing">{headerTrailing}</div> : null}
            </div>
          ) : null}
          {showToolbar ? (
            <div className="DAO-util-page-toolbar">
              <div className="DAO-util-toolbar-primary">
                {tabs ? <div className="DAO-util-toolbar-tabs">{tabs}</div> : null}
                {filters ? <div className="DAO-util-toolbar-filters">{filters}</div> : null}
              </div>
              {showSearch && onSearchChange ? (
                <div className={cn('DAO-util-search-wrap', !tabs && !filters && 'DAO-util-search-wrap--solo')}>
                  <SearchField
                    containerClassName="DAO-util-search-field w-full"
                    onChange={onSearchChange}
                    placeholder={searchPlaceholder}
                    trailingAction={searchTrailingAction}
                    value={searchValue}
                    variant="toolbar"
                  />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="DAO-util-page-body min-h-0 flex-1 overflow-hidden bg-(--ui-chat-surface-background)">
        {children}
      </div>
    </section>
  )
}
