import { Navigate, useParams, useSearchParams } from 'react-router-dom'

import { brainRoute } from '../routes'

export type MemoryViewParam = 'truths' | 'wiki' | 'reports' | 'drive'

/** Legacy /reports, /wiki, /drive routes → unified Memory lens. */
export function MemoryReportsRedirect({
  view = 'reports',
}: {
  view?: MemoryViewParam
}) {
  const { slug } = useParams<{ slug: string }>()
  const [params] = useSearchParams()
  if (!slug) return <Navigate replace to="/" />
  const path = params.get('path')
  return <Navigate replace to={brainRoute(slug, { view, path: path ?? undefined })} />
}

/** @deprecated Use MemoryReportsRedirect */
export const BrainReportsRedirect = MemoryReportsRedirect
