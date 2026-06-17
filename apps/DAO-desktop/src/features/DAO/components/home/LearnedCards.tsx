import type { InsightCard } from '../../api/types'
import { HomeSection } from './HomeSection'

type LearnedCardsProps = {
  items: InsightCard[]
}

export function LearnedCards({ items }: LearnedCardsProps) {
  return (
    <HomeSection label="What Was Learned" title="Insights">
      <ul className="DAO-home-learned">
        {items.map((item) => (
          <li className="DAO-home-learned__card" key={item.title}>
            <h3>{item.title}</h3>
            <p>{item.body}</p>
          </li>
        ))}
      </ul>
    </HomeSection>
  )
}
