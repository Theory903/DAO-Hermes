import { getObjectBySource, getSpaceObject } from '../../api/space-api'
import { useAsync } from '../../hooks/useAsync'
import { CompanyError, CompanyLoading } from '../../screens/_company-shell'
import { ObjectMergeForm } from './ObjectMergeForm'
import { ObjectTimeline } from './ObjectTimeline'
import { RelatedPanel } from './RelatedPanel'

type ObjectPrimitivesProps =
  | {
      spaceId: string
      objectId: string
      onSelectObject?: (objectId: string) => void
      onMerged?: (survivorId: string) => void
      showMerge?: boolean
    }
  | {
      spaceId: string
      sourceTable: string
      sourceId: string
      missingLabel?: string
      onSelectObject?: (objectId: string) => void
      onMerged?: (survivorId: string) => void
      showMerge?: boolean
    }

export function ObjectPrimitives(props: ObjectPrimitivesProps) {
  const missingLabel =
    'missingLabel' in props ? props.missingLabel : 'Not in company memory yet.'
  const onSelectObject = props.onSelectObject
  const onMerged = props.onMerged
  const showMerge = props.showMerge ?? true

  const bundle = useAsync(() => {
    if ('objectId' in props) {
      return getSpaceObject(props.spaceId, props.objectId)
    }
    return getObjectBySource(props.spaceId, props.sourceTable, props.sourceId).catch(() => null)
  }, [
    props.spaceId,
    'objectId' in props ? props.objectId : props.sourceTable,
    'objectId' in props ? '' : props.sourceId,
  ])

  if (bundle.loading) {
    return <CompanyLoading label="Loading timeline…" />
  }

  if (bundle.error) {
    return <CompanyError message={bundle.error} onRetry={bundle.reload} />
  }

  if (!bundle.data) {
    return <p className="DAO-object-empty">{missingLabel}</p>
  }

  const { object, events, related } = bundle.data

  return (
    <div className="DAO-object-primitives">
      <section className="DAO-object-section">
        <h3 className="DAO-util-section-label">Overview</h3>
        <p className="DAO-object-overview__title">{object.title}</p>
        <div className="DAO-object-overview">
          <span className="DAO-company-pill">{object.object_type}</span>
          <span className="DAO-company-pill">{object.status}</span>
        </div>
      </section>
      <section className="DAO-object-section">
        <h3 className="DAO-util-section-label">Related</h3>
        <RelatedPanel
          edges={related}
          onSelectPeer={onSelectObject}
          selfObjectId={object.id}
        />
      </section>
      <section className="DAO-object-section">
        <h3 className="DAO-util-section-label">Timeline</h3>
        <ObjectTimeline events={events} />
      </section>
      {showMerge && onMerged ? (
        <ObjectMergeForm
          objectId={object.id}
          objectTitle={object.title}
          onMerged={(survivorId) => {
            bundle.reload()
            onMerged(survivorId)
          }}
          spaceId={props.spaceId}
        />
      ) : null}
    </div>
  )
}
