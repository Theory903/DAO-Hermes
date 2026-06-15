export type DAOSpace = {
  id: string
  org_id?: string
  name: string
  slug: string
  tier?: string
  operating_mode?: string
  ai_lead_config?: AiLeadConfig
  created_at?: string
}

export type AiLeadConfig = {
  name?: string
  persona?: string
  mission?: string
  hitl_policy?: Record<string, unknown>
  default_model_tier?: number
}

export type DriveObject = {
  id: string
  path: string
  content_hash?: string
  mime?: string
  size?: number
  topic_tags?: string[]
  produced_by_agent_id?: string | null
  produced_by_dept?: string | null
  referenced_by?: string[]
  created_at?: string
}

export type DriveTree = {
  path: string
  folders: string[]
  objects: DriveObject[]
}

export type HitlRequest = {
  id: string
  space_id: string
  workflow_id?: string | null
  agent_id?: string | null
  action_summary: string
  tool_trace?: Record<string, unknown>
  drive_refs?: string[]
  status: string
  resolved_by?: string | null
  resolved_at?: string | null
  created_at?: string
}

export type CommandSnapshot = {
  ai_lead: string
  departments: Record<string, string>
  pending_hitl: number
  recent_handoffs: Array<Record<string, unknown>>
}

export type SpaceEventPayload = {
  type: string
  payload?: Record<string, unknown>
}

export type BrainEntitySummary = {
  slug: string
  title: string
  confidence?: number
  updated_at?: string | null
}

export type BrainEntityDetail = BrainEntitySummary & {
  compiled_truth?: string
  timeline?: Array<Record<string, unknown>>
  drive_refs?: string[]
}

export type OrgChartNode = {
  id: string
  label: string
  department: string
  agent_type: string
  role?: string
  model_tier?: number
  parent_id?: string | null
}

export type OrgChartEdge = {
  from: string
  to: string
  type: string
}

export type DepartmentMeta = {
  key: string
  label: string
  color: string
}

export type OrgTemplate = {
  id: string
  name: string
  description: string
  departments: DepartmentMeta[]
}

export type OrgChart = {
  nodes: OrgChartNode[]
  edges: OrgChartEdge[]
  departments?: DepartmentMeta[]
  template_id?: string
}

export type OrgDepartmentsView = {
  template_id: string
  departments: DepartmentMeta[]
  catalog: DepartmentMeta[]
}

export type AgentRow = {
  id: string
  name: string
  role?: string
  department?: string
  agent_type?: string
  model_tier?: number
  system_instruction?: string
  tool_allowlist?: string[]
  parent_agent_id?: string | null
}

export type Automation = {
  slug: string
  name: string
  enabled: boolean
  cron?: string
}
