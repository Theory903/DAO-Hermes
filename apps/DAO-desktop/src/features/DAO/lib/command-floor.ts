import type { CommandSnapshot } from '../api/types'
import type { SpaceFeedEvent } from '../hooks/useSpaceEvents'

export const COMMAND_DEPTS = [
  { key: 'research', label: 'Research', color: '#60a5fa' },
  { key: 'engineering', label: 'Engineering', color: '#34d399' },
  { key: 'marketing', label: 'Marketing', color: '#f472b6' },
  { key: 'sales', label: 'Sales', color: '#fbbf24' },
  { key: 'ops', label: 'Ops', color: '#a78bfa' },
] as const

export type DeptKey = (typeof COMMAND_DEPTS)[number]['key']

export type DeptTaskCard = {
  id: string
  text: string
  eventType: string
  reused?: boolean
  ts: number
}

export type HandoffVisual = {
  id: string
  fromDept: string
  toDept: string
  subject: string
  ts: number
}

export type CommandFloorState = {
  lanes: Record<DeptKey, DeptTaskCard[]>
  handoffs: HandoffVisual[]
  statuses: Record<DeptKey, string>
}

const DEPT_KEYS = new Set<string>(COMMAND_DEPTS.map((dept) => dept.key))

function normalizeDept(value: unknown): DeptKey | null {
  if (typeof value !== 'string') return null
  const key = value.trim().toLowerCase()
  return DEPT_KEYS.has(key) ? (key as DeptKey) : null
}

function deptFromPath(path: unknown): DeptKey | null {
  if (typeof path !== 'string') return null
  for (const dept of COMMAND_DEPTS) {
    if (path.includes(`/${dept.key}/`) || path.startsWith(`${dept.key}/`)) {
      return dept.key
    }
  }
  return null
}

function deptForEvent(event: SpaceFeedEvent): DeptKey | null {
  const payload = event.payload ?? {}
  return (
    normalizeDept(payload.dept) ??
    normalizeDept(payload.department) ??
    normalizeDept(payload.produced_by_dept) ??
    normalizeDept(payload.to_dept) ??
    deptFromPath(payload.path) ??
    (event.type === 'research_memory_reused' ? 'research' : null) ??
    (event.type === 'drive_reused' ? 'research' : null)
  )
}

function handoffFromEvent(event: SpaceFeedEvent): HandoffVisual | null {
  if (event.type !== 'handoff') return null
  const payload = event.payload ?? {}
  const fromDept = normalizeDept(payload.from_dept)
  const toDept = normalizeDept(payload.to_dept)
  if (!fromDept || !toDept) return null
  return {
    id: event.id,
    fromDept,
    toDept,
    subject: event.text,
    ts: event.ts,
  }
}

function handoffFromSnapshot(row: Record<string, unknown>, index: number): HandoffVisual | null {
  const fromDept = normalizeDept(row.from_dept)
  const toDept = normalizeDept(row.to_dept)
  if (!fromDept || !toDept) return null
  const createdAt = row.created_at ? Date.parse(String(row.created_at)) : Date.now() - index
  return {
    id: `snapshot-handoff-${index}`,
    fromDept,
    toDept,
    subject:
      (typeof row.subject === 'string' && row.subject) ||
      `${fromDept} → ${toDept}`,
    ts: Number.isFinite(createdAt) ? createdAt : Date.now() - index,
  }
}

function laneStatus(base: string | undefined, tasks: DeptTaskCard[]): string {
  if (tasks.some((task) => task.reused)) return 'reused'
  if (tasks.length > 0) return 'active'
  return base ?? 'idle'
}

export function buildCommandFloorState(
  events: SpaceFeedEvent[],
  snapshot?: CommandSnapshot | null,
): CommandFloorState {
  const lanes: Record<DeptKey, DeptTaskCard[]> = {
    research: [],
    engineering: [],
    marketing: [],
    sales: [],
    ops: [],
  }

  for (const event of events) {
    const dept = deptForEvent(event)
    if (!dept) continue
    const card: DeptTaskCard = {
      id: event.id,
      text: event.text,
      eventType: event.type,
      reused: event.reused,
      ts: event.ts,
    }
    const lane = lanes[dept]
    if (!lane.some((item) => item.id === card.id)) {
      lane.push(card)
    }
  }

  for (const dept of COMMAND_DEPTS) {
    lanes[dept.key].sort((a, b) => b.ts - a.ts)
    lanes[dept.key] = lanes[dept.key].slice(0, 2)
  }

  const handoffMap = new Map<string, HandoffVisual>()
  for (const event of events) {
    const handoff = handoffFromEvent(event)
    if (handoff) handoffMap.set(handoff.id, handoff)
  }
  for (const [index, row] of (snapshot?.recent_handoffs ?? []).entries()) {
    const handoff = handoffFromSnapshot(row, index)
    if (handoff) handoffMap.set(handoff.id, handoff)
  }
  const handoffs = [...handoffMap.values()].sort((a, b) => b.ts - a.ts).slice(0, 6)

  const statuses = Object.fromEntries(
    COMMAND_DEPTS.map((dept) => [
      dept.key,
      laneStatus(snapshot?.departments?.[dept.key], lanes[dept.key]),
    ]),
  ) as Record<DeptKey, string>

  return { lanes, handoffs, statuses }
}
