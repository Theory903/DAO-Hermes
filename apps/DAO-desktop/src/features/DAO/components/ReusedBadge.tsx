import { cn } from '@/lib/utils'

type ReusedBadgeProps = {
  className?: string
  pulse?: boolean
}

/** Green-pulse REUSED pill for Command floor and Chat traces. */
export function ReusedBadge({ className, pulse = true }: ReusedBadgeProps) {
  return (
    <span
      className={cn(
        'DAO-company-pill DAO-company-pill--reused',
        pulse && 'DAO-company-pill--reused-pulse',
        className,
      )}
    >
      REUSED
    </span>
  )
}
