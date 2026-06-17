import type { StoryCard } from '../../api/types'
import { HomeSection } from './HomeSection'

type ChangedFeedProps = {
  items: StoryCard[]
  onOpenObject?: (objectId: string) => void
}

export function ChangedFeed({ items, onOpenObject }: ChangedFeedProps) {
  return (
    <HomeSection label="What Changed" title="Recent story">
      {items.length === 0 ? (
        <p className="DAO-home-empty">Quiet period — no handoffs or new outputs in the last day.</p>
      ) : (
        <ul className="DAO-home-changed">
          {items.map((item, index) => {
            const clickable = Boolean(item.object_id && onOpenObject)
            const Tag = clickable ? 'button' : 'div'
            return (
              <li className="DAO-home-changed__item" key={`${item.kind}-${item.at}-${index}`}>
                <Tag
                  className={clickable ? 'DAO-home-changed__button' : undefined}
                  onClick={clickable ? () => onOpenObject?.(item.object_id!) : undefined}
                  type={clickable ? 'button' : undefined}
                >
                  <span className="DAO-home-changed__kind">{item.title}</span>
                  <p>{item.body}</p>
                </Tag>
              </li>
            )
          })}
        </ul>
      )}
    </HomeSection>
  )
}
