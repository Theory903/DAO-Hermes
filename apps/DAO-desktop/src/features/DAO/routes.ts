/** DAO company-layer routes (UI-SPEC v2). */

export const DAO_SPACE_PREFIX = '/space'

export type DAOScreenKey =
  | ''
  | 'chat'
  | 'command'
  | 'drive'
  | 'inbox'
  | 'reports'
  | 'settings'
  | 'brain'
  | 'org'
  | 'memory'
  | 'work'
  | 'automation'
  | 'control'

export const DAO_SCREEN_KEYS = [
  '',
  'chat',
  'command',
  'drive',
  'inbox',
  'reports',
  'settings',
  'brain',
  'org',
  'memory',
  'work',
  'automation',
  'control',
] as const

export function spaceRoute(slug: string, sub: DAOScreenKey | string = ''): string {
  const segment = sub ? `/${sub}` : ''
  return `${DAO_SPACE_PREFIX}/${encodeURIComponent(slug)}${segment}`
}

export type BrainViewParam = 'overview' | 'truths' | 'wiki' | 'drive' | 'reports'

/** Deep link into Memory tabs (and optional Drive folder). */
export function brainRoute(
  slug: string,
  options?: { view?: Exclude<BrainViewParam, 'overview'>; path?: string },
): string {
  const base = spaceRoute(slug, 'memory')
  const params = new URLSearchParams()
  if (options?.view) params.set('view', options.view)
  if (options?.path) params.set('path', options.path)
  const qs = params.toString()
  return qs ? `${base}?${qs}` : base
}

/** @deprecated Use brainRoute — kept for slash-nav compatibility. */
export const memoryRoute = brainRoute

/** Deep link into Work or Memory object sheet. */
export function objectLensRoute(
  slug: string,
  lens: 'work' | 'memory',
  objectId: string,
): string {
  return `${spaceRoute(slug, lens)}?object=${encodeURIComponent(objectId)}`
}

export function isDAOSpaceRoute(pathname: string): boolean {
  return pathname === DAO_SPACE_PREFIX || pathname.startsWith(`${DAO_SPACE_PREFIX}/`)
}

export function parseSpaceRoute(pathname: string): { slug: string; screen: string } | null {
  if (!isDAOSpaceRoute(pathname)) return null
  const rest = pathname.slice(DAO_SPACE_PREFIX.length).replace(/^\/+/, '')
  if (!rest) return null
  const [slug, ...segments] = rest.split('/')
  if (!slug) return null
  return { slug: decodeURIComponent(slug), screen: segments[0] ?? '' }
}

export function activeScreenFromPath(pathname: string, slug: string): string {
  const parsed = parseSpaceRoute(pathname)
  if (!parsed || parsed.slug !== slug) return ''
  return parsed.screen
}
