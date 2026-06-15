import { Navigate, useParams, useSearchParams } from 'react-router-dom'

import { spaceRoute } from '../routes'

import type { BrainView } from './BrainScreen'

/** Legacy /reports, /wiki, /drive routes → unified Brain hub. */
export function BrainReportsRedirect({ view = 'reports' }: { view?: Extract<BrainView, 'wiki' | 'reports' | 'drive'> }) {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  if (!slug) return <Navigate replace to="/" />
  const next = new URLSearchParams()
  next.set('view', view)
  const path = params.get('path')
  if (path) next.set('path', path)
  return <Navigate replace to={`${spaceRoute(slug, 'brain')}?${next.toString()}`} />
}
