import type { ReactNode } from 'react'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'

const FILTER_ALL_VALUE = '__all__'

type UtilChipSwitchProps = {
  'aria-label'?: string
  children: ReactNode
  className?: string
}

/** Pill segmented control — Skills/Toolsets, artifact kinds, messaging filters. */
export function UtilChipSwitch({ 'aria-label': ariaLabel = 'View', children, className }: UtilChipSwitchProps) {
  return (
    <div aria-label={ariaLabel} className={cn('DAO-util-chip-switch', className)} role="tablist">
      {children}
    </div>
  )
}

type UtilChipSwitchItemProps = {
  active?: boolean
  children: ReactNode
  className?: string
  count?: number | string
  onClick?: () => void
  title?: string
}

export function UtilChipSwitchItem({ active, children, className, count, onClick, title }: UtilChipSwitchItemProps) {
  return (
    <button
      aria-selected={active}
      className={cn('DAO-util-chip-switch-item', active && 'DAO-util-chip-switch-item--active', className)}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      role="tab"
      title={title}
      type="button"
    >
      <span className="DAO-util-chip-switch-item-label">{children}</span>
      {count !== undefined && active ? <span className="DAO-util-chip-switch-item-meta">{count}</span> : null}
    </button>
  )
}

type UtilFilterSelectOption = {
  count?: number
  label: string
  value: string
}

type UtilFilterSelectProps = {
  'aria-label'?: string
  className?: string
  onValueChange: (value: string | null) => void
  options: UtilFilterSelectOption[]
  placeholder?: string
  value: string | null
}

/** Compact dropdown for secondary filters (e.g. skill category). */
export function UtilFilterSelect({
  'aria-label': ariaLabel = 'Filter',
  className,
  onValueChange,
  options,
  placeholder = 'Filter',
  value
}: UtilFilterSelectProps) {
  const selectValue = value ?? FILTER_ALL_VALUE

  return (
    <Select
      onValueChange={next => onValueChange(next === FILTER_ALL_VALUE ? null : next)}
      value={selectValue}
    >
      <SelectTrigger
        aria-label={ariaLabel}
        className={cn('DAO-util-filter-select', className)}
        size="xs"
      >
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent align="start" className="DAO-util-filter-select-menu">
        {options.map(option => (
          <SelectItem key={option.value} value={option.value}>
            <span className="DAO-util-filter-select-option">
              <span>{option.label}</span>
              {option.count !== undefined ? (
                <span className="DAO-util-filter-select-count">{option.count}</span>
              ) : null}
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

export function utilFilterAllOption(label: string, count?: number): UtilFilterSelectOption {
  return { value: FILTER_ALL_VALUE, label, count }
}

type UtilSideNavItemProps = {
  active?: boolean
  avatar?: ReactNode
  children: ReactNode
  className?: string
  hint?: string
  onClick?: () => void
  trailing?: ReactNode
}

export function UtilSideNavItem({
  active,
  avatar,
  children,
  className,
  hint,
  onClick,
  trailing
}: UtilSideNavItemProps) {
  return (
    <button
      className={cn('DAO-util-side-nav-item', active && 'DAO-util-side-nav-item--active', className)}
      data-active={active ? 'true' : 'false'}
      onClick={onClick}
      type="button"
    >
      {avatar ? <span className="DAO-util-side-nav-avatar">{avatar}</span> : null}
      <span className="DAO-util-side-nav-copy">
        <span className="DAO-util-side-nav-title">{children}</span>
        {hint ? <span className="DAO-util-side-nav-hint">{hint}</span> : null}
      </span>
      {trailing ? <span className="DAO-util-side-nav-trailing">{trailing}</span> : null}
    </button>
  )
}
