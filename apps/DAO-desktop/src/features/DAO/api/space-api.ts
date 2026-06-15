/**
 * DAO space-scoped REST stubs for D2 company screens.
 * Uses the shared desktop `DAOFetch` client.
 */
import { DAO_API_PREFIX, DAOApiBase } from '@/lib/DAO-config'
import { DAOFetch } from '@/lib/DAO-api'
import { getAuthToken } from '@/lib/DAO-auth-token'

import type {
  BrainEntityDetail,
  BrainEntitySummary,
  CommandSnapshot,
  DAOSpace,
  DriveObject,
  DriveTree,
  HitlRequest,
  OrgChart,
  OrgChartNode,
  OrgDepartmentsView,
  OrgTemplate,
  DepartmentMeta,
  AgentRow,
  Automation,
} from './types'

export type {
  BrainEntityDetail,
  BrainEntitySummary,
  CommandSnapshot,
  DAOSpace,
  DriveObject,
  DriveTree,
  HitlRequest,
  OrgChart,
  OrgChartNode,
  OrgDepartmentsView,
  OrgTemplate,
  DepartmentMeta,
  AgentRow,
  Automation,
}

function sp(spaceId: string, path: string): string {
  return `${DAO_API_PREFIX}/spaces/${spaceId}${path}`
}

export function getSpaceBySlug(slug: string): Promise<DAOSpace> {
  return DAOFetch<DAOSpace>(`${DAO_API_PREFIX}/spaces/by-slug/${encodeURIComponent(slug)}`)
}

export type BriefingLatest = {
  markdown: string
  generated_at: string
  greeting?: string | null
  greeting_subline?: string | null
  greeting_kind?: string | null
}

export type BriefingHistoryItem = {
  kind: 'briefing'
  markdown: string
  generated_at: string
  trigger_source?: string | null
}

export type WritebackItem = {
  kind: 'writeback'
  object_id: string
  path: string
  produced_by_dept?: string | null
  created_at?: string | null
}

export type SpaceReports = {
  pulse: {
    pending_hitl: number
    handoffs_24h: number
    drive_artifacts_24h: number
    brain_entities: number
  }
  briefings: BriefingHistoryItem[]
  writebacks: WritebackItem[]
}

export function getBriefingLatest(spaceId: string): Promise<BriefingLatest> {
  return DAOFetch(sp(spaceId, '/jarvis/briefing/latest'))
}

export function getSpaceReports(spaceId: string, limit = 30): Promise<SpaceReports> {
  return DAOFetch(sp(spaceId, `/jarvis/reports?limit=${limit}`))
}

export function triggerBriefing(spaceId: string): Promise<{ triggered: boolean }> {
  return DAOFetch(sp(spaceId, '/jarvis/briefing/trigger'), { method: 'POST' })
}

export function getCommandSnapshot(spaceId: string): Promise<CommandSnapshot> {
  return DAOFetch<CommandSnapshot>(sp(spaceId, '/command/snapshot'))
}

/** GET /api/v1/spaces/{id}/drive/tree */
export function getDriveTree(spaceId: string, path = '/'): Promise<DriveTree> {
  return DAOFetch<DriveTree>(sp(spaceId, `/drive/tree?path=${encodeURIComponent(path)}`))
}

export function searchDrive(spaceId: string, q: string, dept?: string): Promise<{ results: DriveObject[] }> {
  const params = new URLSearchParams({ q })
  if (dept) params.set('dept', dept)
  return DAOFetch(sp(spaceId, `/drive/search?${params.toString()}`))
}

export async function uploadToDrive(
  spaceId: string,
  file: File,
  path = '/',
): Promise<{ id: string; path: string; content_hash?: string; dedup?: boolean; existing_id?: string }> {
  const token = getAuthToken()
  const uploadPath = `${sp(spaceId, '/drive/upload')}?path=${encodeURIComponent(path)}`
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${DAOApiBase()}${uploadPath}`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  })
  if (!res.ok) {
    throw new Error(await res.text().catch(() => res.statusText))
  }
  return res.json()
}

/** GET /api/v1/spaces/{id}/hitl */
export function listHitl(spaceId: string, status = 'pending'): Promise<{ requests: HitlRequest[] }> {
  return DAOFetch<{ requests: HitlRequest[] }>(sp(spaceId, `/hitl?status=${encodeURIComponent(status)}`))
}

export function getHitl(spaceId: string, requestId: string): Promise<HitlRequest> {
  return DAOFetch<HitlRequest>(sp(spaceId, `/hitl/${requestId}`))
}

export function resolveHitl(
  spaceId: string,
  requestId: string,
  status: 'approved' | 'rejected',
): Promise<{ ok: boolean; status: string }> {
  return DAOFetch(sp(spaceId, `/hitl/${requestId}/resolve`), {
    method: 'POST',
    body: JSON.stringify({ status }),
  })
}

/** SSE URL for GET /api/v1/spaces/{id}/events */
export function spaceEventsUrl(spaceId: string): string {
  const token = getAuthToken()
  const base = `${DAOApiBase()}${sp(spaceId, '/events')}`
  return token ? `${base}?token=${encodeURIComponent(token)}` : base
}

export type WikiPageSummary = {
  page_key: string
  title: string
  path: string
  summary?: string | null
  updated_at?: string | null
}

export type WikiSection = {
  id: string
  label: string
  pages: WikiPageSummary[]
}

export type WikiSnapshot = {
  initialized: boolean
  domain?: string | null
  stats: {
    pages: number
    entities: number
    concepts: number
    raw_sources: number
  }
  sections: WikiSection[]
  index_markdown?: string | null
  schema_markdown?: string | null
  recent_log: string[]
  pages: WikiPageSummary[]
}

export type WikiPage = WikiPageSummary & {
  content: string
  body: string
  frontmatter: Record<string, unknown>
}

export function getWiki(spaceId: string): Promise<WikiSnapshot> {
  return DAOFetch<WikiSnapshot>(sp(spaceId, '/wiki'))
}

export function getWikiPage(spaceId: string, pageKey: string): Promise<WikiPage> {
  return DAOFetch<WikiPage>(sp(spaceId, `/wiki/pages/${encodeURIComponent(pageKey)}`))
}

/** GET /api/v1/spaces/{id}/brain/entities */
export function listBrainEntities(spaceId: string): Promise<{ entities: BrainEntitySummary[] }> {
  return DAOFetch<{ entities: BrainEntitySummary[] }>(sp(spaceId, '/brain/entities'))
}

/** GET /api/v1/spaces/{id}/brain/entities/{slug} */
export function getBrainEntity(spaceId: string, slug: string): Promise<BrainEntityDetail> {
  return DAOFetch<BrainEntityDetail>(sp(spaceId, `/brain/entities/${encodeURIComponent(slug)}`))
}

/** GET /api/v1/spaces/{id}/org/chart */
export function getOrgChart(spaceId: string): Promise<OrgChart> {
  return DAOFetch<OrgChart>(sp(spaceId, '/org/chart'))
}

export function getOrgDepartments(spaceId: string): Promise<OrgDepartmentsView> {
  return DAOFetch<OrgDepartmentsView>(sp(spaceId, '/org/departments'))
}

export function listOrgTemplates(spaceId: string): Promise<{ templates: OrgTemplate[]; catalog: DepartmentMeta[] }> {
  return DAOFetch(sp(spaceId, '/org/templates'))
}

export function applyOrgTemplate(
  spaceId: string,
  body: { template_id: string; replace?: boolean; departments?: string[] },
): Promise<OrgDepartmentsView> {
  return DAOFetch(sp(spaceId, '/org/templates/apply'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function suggestOrgTemplate(
  spaceId: string,
  body?: { mission?: string; space_name?: string },
): Promise<{ template_id: string; reason: string; template: OrgTemplate }> {
  return DAOFetch(sp(spaceId, '/org/suggest'), {
    method: 'POST',
    body: JSON.stringify(body ?? {}),
  })
}

export function listAgents(spaceId: string, department?: string): Promise<{ agents: AgentRow[] }> {
  const q = department ? `?department=${encodeURIComponent(department)}` : ''
  return DAOFetch<{ agents: AgentRow[] }>(sp(spaceId, `/org/agents${q}`))
}

export function updateAgent(
  spaceId: string,
  agentId: string,
  body: Partial<AgentRow>,
): Promise<{ ok: boolean }> {
  return DAOFetch(sp(spaceId, `/org/agents/${agentId}`), {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export type AgentCreateBody = {
  name: string
  role: string
  department: string
  agent_type?: 'lead' | 'worker'
  model_tier?: number
  system_instruction?: string
  parent_agent_id?: string | null
}

export function createAgent(spaceId: string, body: AgentCreateBody): Promise<{ id: string }> {
  return DAOFetch(sp(spaceId, '/org/agents'), {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export function updateOrgConfig(
  spaceId: string,
  body: { template_id: string; departments: string[] },
): Promise<{ ok: boolean; template_id: string; departments: DepartmentMeta[] }> {
  return DAOFetch(sp(spaceId, '/org/config'), {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** GET /api/v1/spaces/{id}/jarvis/automations */
export function listAutomations(spaceId: string): Promise<{ automations: Automation[] }> {
  return DAOFetch<{ automations: Automation[] }>(sp(spaceId, '/jarvis/automations'))
}

/** PATCH /api/v1/spaces/{id}/jarvis/automations/{slug} */
export function patchAutomation(
  spaceId: string,
  slug: string,
  patch: Partial<Automation>,
): Promise<{ automations: Automation[] }> {
  return DAOFetch<{ automations: Automation[] }>(
    sp(spaceId, `/jarvis/automations/${encodeURIComponent(slug)}`),
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    },
  )
}

/** GET /api/v1/spaces/{id}/jarvis/config */
export function getJarvisConfig(spaceId: string): Promise<import('./types').AiLeadConfig> {
  return DAOFetch(sp(spaceId, '/jarvis/config'))
}

/** PATCH /api/v1/spaces/{id}/jarvis/config */
export function patchJarvisConfig(
  spaceId: string,
  patch: Partial<import('./types').AiLeadConfig>,
): Promise<import('./types').AiLeadConfig> {
  return DAOFetch(sp(spaceId, '/jarvis/config'), {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export type SpaceMember = {
  id: string
  user_id: string
  email: string
  display_name: string | null
  role: string
  created_at: string
}

export function listSpaceMembers(spaceId: string): Promise<SpaceMember[]> {
  return DAOFetch<SpaceMember[]>(sp(spaceId, '/members'))
}

export function inviteSpaceMember(
  spaceId: string,
  email: string,
  role: 'admin' | 'member' | 'viewer' = 'member',
): Promise<SpaceMember> {
  return DAOFetch<SpaceMember>(sp(spaceId, '/members'), {
    method: 'POST',
    body: JSON.stringify({ email, role }),
  })
}

export function removeSpaceMember(spaceId: string, memberId: string): Promise<void> {
  return DAOFetch<void>(sp(spaceId, `/members/${memberId}`), { method: 'DELETE' })
}
