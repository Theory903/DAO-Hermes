import type { BrainArea } from './brain-copy'
import { BRAIN_VIEW_COPY } from './brain-copy'

export function BrainPanelGuide({ area }: { area: BrainArea }) {
  const copy = BRAIN_VIEW_COPY[area]
  if (area === 'overview') return null

  return (
    <aside aria-label={`About ${copy.guideTitle}`} className="DAO-panel-guide">
      <div className="DAO-panel-guide-head">
        <h2 className="DAO-panel-guide-title">{copy.guideTitle}</h2>
        <p className="DAO-panel-guide-purpose">{copy.guidePurpose}</p>
      </div>
      <div className="DAO-panel-guide-body">
        <p className="DAO-panel-guide-label">You can</p>
        <ul className="DAO-panel-guide-list">
          {copy.youCan.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        {copy.tip ? <p className="DAO-panel-guide-tip">{copy.tip}</p> : null}
      </div>
    </aside>
  )
}
