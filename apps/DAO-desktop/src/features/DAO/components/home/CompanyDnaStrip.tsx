import type { CompanyDna } from '../../api/types'

type CompanyDnaStripProps = {
  dna: CompanyDna
}

export function CompanyDnaStrip({ dna }: CompanyDnaStripProps) {
  const items = [
    { label: 'Mission', value: dna.mission },
    { label: 'Stage', value: dna.stage },
    { label: 'North Star', value: dna.north_star },
    { label: 'Archetype', value: dna.archetype },
  ]

  return (
    <div className="DAO-home-dna" role="region" aria-label="Company DNA">
      {items.map((item) => (
        <div className="DAO-home-dna__item" key={item.label}>
          <span className="DAO-home-dna__label">{item.label}</span>
          <span className="DAO-home-dna__value">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
