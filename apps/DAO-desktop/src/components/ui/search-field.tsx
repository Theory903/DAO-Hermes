import type { ReactNode, RefObject } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { Loader2, Search } from '@/lib/icons'
import { cn } from '@/lib/utils'

interface SearchFieldProps {
  placeholder: string
  value: string
  onChange: (value: string) => void
  containerClassName?: string
  inputClassName?: string
  loading?: boolean
  onClear?: () => void
  inputRef?: RefObject<HTMLInputElement | null>
  trailingAction?: ReactNode
  variant?: 'inline' | 'toolbar' | 'sidebar'
  'aria-label'?: string
}

const VARIANT_CONTAINER: Record<NonNullable<SearchFieldProps['variant']>, string> = {
  inline:
    'inline-flex max-w-full items-center gap-1.5 border-b border-transparent px-0.5 transition-colors focus-within:border-(--ui-stroke-secondary)',
  toolbar:
    'DAO-search-field DAO-search-field--toolbar flex w-full min-w-0 items-center gap-2 rounded-[10px] border border-transparent bg-[rgba(255,255,255,0.03)] px-2.5 py-1 transition-[border-color,background,box-shadow] focus-within:border-[rgba(171,159,242,0.35)] focus-within:bg-[rgba(171,159,242,0.06)] focus-within:shadow-[0_0_0_1px_rgba(171,159,242,0.12)]',
  sidebar:
    'DAO-search-field DAO-search-field--sidebar flex w-full min-w-0 items-center gap-2 rounded-[10px] border border-(--ui-stroke-tertiary) bg-[color-mix(in_srgb,var(--ui-control-hover-background)_55%,transparent)] px-2.5 py-1.5 transition-[border-color,background] focus-within:border-[rgba(171,159,242,0.35)] focus-within:bg-(--ui-control-active-background)'
}

const VARIANT_INPUT: Record<NonNullable<SearchFieldProps['variant']>, string> = {
  inline: 'h-7',
  toolbar: 'h-8 min-w-[8rem] flex-1',
  sidebar: 'h-8 min-w-0 flex-1'
}

/**
 * Shared search field used everywhere (sessions sidebar, pages, overlays,
 * command center, cron). No box — borderless until focus, then an underline.
 * Width/placement come from `containerClassName`.
 */
export function SearchField({
  placeholder,
  value,
  onChange,
  containerClassName,
  inputClassName,
  loading = false,
  onClear,
  inputRef,
  trailingAction,
  variant = 'inline',
  'aria-label': ariaLabel
}: SearchFieldProps) {
  const { t } = useI18n()
  const clear = onClear ?? (() => onChange(''))

  return (
    <div className={cn(VARIANT_CONTAINER[variant], containerClassName)}>
      <Search className="pointer-events-none size-3.5 shrink-0 text-muted-foreground/70" />
      <input
        aria-label={ariaLabel}
        className={cn(
          'max-w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none',
          variant === 'inline' && '[field-sizing:content]',
          VARIANT_INPUT[variant],
          inputClassName
        )}
        onChange={event => onChange(event.target.value)}
        placeholder={placeholder}
        ref={inputRef}
        type="text"
        value={value}
      />
      {trailingAction}
      {loading ? (
        <Loader2 className="pointer-events-none size-3.5 shrink-0 animate-spin text-muted-foreground/70" />
      ) : value ? (
        <Button
          aria-label={t.ui.search.clear}
          className="shrink-0 text-muted-foreground/85 hover:bg-accent/60 hover:text-foreground"
          onClick={clear}
          size="icon-xs"
          variant="ghost"
        >
          <Codicon name="close" size="0.875rem" />
        </Button>
      ) : null}
    </div>
  )
}
