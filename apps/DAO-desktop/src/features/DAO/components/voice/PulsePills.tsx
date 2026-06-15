import { cn } from '@/lib/utils'

export type PulsePill = {
  value: string | number
  label: string
  alert?: boolean
  onClick?: () => void
}

export function PulsePills({ pills, className }: { pills: PulsePill[]; className?: string }) {
  if (pills.length === 0) {
    return null
  }

  return (
    <div className={cn('DAO-jarvis-pill-row', className)}>
      {pills.map((pill) => (
        <button
          className={cn('DAO-jarvis-pill', pill.alert && 'DAO-jarvis-pill--alert')}
          key={pill.label}
          onClick={pill.onClick}
          type="button"
        >
          <span className="DAO-jarvis-pill__value">{pill.value}</span>
          <span className="DAO-jarvis-pill__label">{pill.label}</span>
        </button>
      ))}
    </div>
  )
}
