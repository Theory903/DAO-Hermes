import { HomeSection } from './HomeSection'

type WinningSignalsProps = {
  lines: string[]
}

export function WinningSignals({ lines }: WinningSignalsProps) {
  if (!lines.length) return null

  return (
    <HomeSection label="Winning Signals" title="What's working">
      <ul className="DAO-home-signals">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </HomeSection>
  )
}
