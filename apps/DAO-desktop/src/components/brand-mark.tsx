import { cn } from '@/lib/utils'

type BrandMarkProps = React.ComponentProps<'span'> & {
  size?: 'default' | 'compact'
}

// DAO VOID wordmark — replaces Hermes/Nous tile in onboarding, about, updates.
export function BrandMark({ className, size = 'default', ...props }: BrandMarkProps) {
  const compact = size === 'compact'

  return (
    <span
      className={cn(
        'inline-flex shrink-0 flex-col items-center justify-center border border-[color-mix(in_srgb,var(--primary,#ab9ff2)_35%,transparent)] bg-[color-mix(in_srgb,var(--void-elevated,#111)_90%,#000)] text-[var(--primary,#ab9ff2)]',
        compact
          ? 'size-8 gap-0 rounded-[10px]'
          : 'size-14 gap-0.5 rounded-xl',
        className
      )}
      {...props}
    >
      <span
        aria-hidden
        className={cn(
          'font-semibold leading-none tracking-tight',
          compact ? 'text-[0.7rem]' : 'text-[1.35rem]'
        )}
      >
        Cx
      </span>
      {!compact ? (
        <span className="text-[0.5rem] font-medium uppercase tracking-[0.14em] text-[var(--text-secondary,#a3a3a3)]">
          OS
        </span>
      ) : null}
    </span>
  )
}
