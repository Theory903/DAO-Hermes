import type { InsightCard } from '../../api/types'
import { HomeSection } from './HomeSection'

type RecommendsCardsProps = {
  items: InsightCard[]
}

export function RecommendsCards({ items }: RecommendsCardsProps) {
  if (!items.length) return null

  return (
    <HomeSection label="Recommendations" title="When you have a moment">
      <ul className="DAO-home-recommends">
        {items.map((item) => (
          <li className="DAO-home-recommends__card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
