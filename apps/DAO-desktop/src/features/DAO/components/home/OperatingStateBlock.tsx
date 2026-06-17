import type { OperatingState } from '../../api/types'
import { HomeSection } from './HomeSection'

type OperatingStateBlockProps = {
  state: OperatingState
}

export function OperatingStateBlock({ state }: OperatingStateBlockProps) {
  return (
    <HomeSection label="Current State" title={state.label}>
      <div className="DAO-home-state" data-tone={state.tone}>
        <p className="DAO-home-state__label">{state.label}</p>
        {state.subline ? <p className="DAO-home-state__subline">{state.subline}</p> : null}
      </div>
    </HomeSection>
  )
}
