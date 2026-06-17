import type { ObjectEdge } from '../../api/types'

type RelatedPanelProps = {
  edges: ObjectEdge[]
  selfObjectId: string
  emptyLabel?: string
  onSelectPeer?: (objectId: string) => void
}

export function RelatedPanel({
  edges,
  selfObjectId,
  emptyLabel = 'No related objects yet.',
  onSelectPeer,
}: RelatedPanelProps) {
  if (edges.length === 0) {
    return <p className="DAO-object-empty">{emptyLabel}</p>
  }

  return (
    <ul className="DAO-object-related">
      {edges.map((edge) => {
        const peerId =
          edge.from_object_id === selfObjectId ? edge.to_object_id : edge.from_object_id
        const clickable = Boolean(onSelectPeer)
        const Tag = clickable ? 'button' : 'div'
        return (
          <li key={edge.id} className="DAO-object-related-item">
            <Tag
              className={clickable ? 'DAO-object-related-button' : undefined}
              onClick={clickable ? () => onSelectPeer?.(peerId) : undefined}
              type={clickable ? 'button' : undefined}
            >
              <div className="DAO-object-related-main">
                <span className="DAO-object-related-title">{edge.peer_title ?? peerId}</span>
                {edge.peer_type ? (
                  <span className="DAO-company-pill">{edge.peer_type}</span>
                ) : null}
              </div>
              <span className="DAO-object-related-edge">
                {edge.edge_type.replaceAll('_', ' ')}
                {edge.source === 'human' ? ' · confirmed' : ''}
              </span>
            </Tag>
          </li>
        )
      })}
    </ul>
  )
}
