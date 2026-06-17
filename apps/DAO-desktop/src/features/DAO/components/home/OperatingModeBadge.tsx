import type { OperatingMode } from '../../api/types'

const MODE_LABEL: Record<OperatingMode['mode'], string> = {
  growth: 'Growth',
  execution: 'Execution',
  learning: 'Learning',
  recovery: 'Recovery',
}

type OperatingModeBadgeProps = {
  mode: OperatingMode
}

export function OperatingModeBadge({ mode }: OperatingModeBadgeProps) {
  return (
    <div className="DAO-home-mode" data-mode={mode.mode}>
      <p className="DAO-home-mode__line">
        Current Mode: <strong>{MODE_LABEL[mode.mode]}</strong>
      </p>
      <p className="DAO-home-mode__focus">Focus: {mode.focus_label}</p>
    </div>
  )
}
