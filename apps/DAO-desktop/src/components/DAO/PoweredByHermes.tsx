import { POWERED_BY_HERMES } from '@/lib/DAO-branding'
import { cn } from '@/lib/utils'

type PoweredByHermesProps = {
  className?: string
}

export function PoweredByHermes({ className }: PoweredByHermesProps) {
  return (
    <span className={cn('DAO-powered-by', className)} aria-label={POWERED_BY_HERMES}>
      {POWERED_BY_HERMES}
    </span>
  )
}
