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
  id?: string
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

export type CompanyDna = {
  mission: string
  stage: string
  north_star: string
  archetype: string
}

export type OperatingMode = {
  mode: 'growth' | 'execution' | 'learning' | 'recovery'
  focus_label: string
  confidence: number
}

export type OperatingState = {
  label: string
  tone: 'positive' | 'neutral' | 'warning'
  subline?: string
}

export type FocusCard = {
  id: string
  kind: 'hitl' | 'recommend' | 'decision'
  title: string
  context: string
  recommendation?: string | null
  why_this_matters: string
  impact?: string | null
  time_estimate?: string | null
  confidence?: number | null
  tool_trace?: Record<string, unknown>
  drive_refs?: string[]
  object_id?: string
}

export type HomePulse = {
  pending_hitl: number
  handoffs_24h: number
  drive_artifacts_24h: number
  brain_entities: number
  greeting?: string | null
  greeting_subline?: string | null
  greeting_kind?: string | null
}

export type MomentumRings = {
  growth: number
  execution: number
  learning: number
  autonomy: number
}

export type HeatmapDay = {
  date: string
  level: number
  count: number
}

export type TimeMachinePoint = {
  week_start: string
  score: number
  rings: MomentumRings
  factors: string[]
}

export type StoryCard = {
  kind: string
  title: string
  body: string
  at?: string | null
  object_id?: string
  event_type?: string
  importance?: number
}

export type InsightCard = {
  title: string
  body: string
}

export type CompanyStory = {
  started: string
  are: string
  going: string
  achievements: string[]
  milestones?: string[]
}

export type MemorySearchHit = SpaceObject & {
  match_rank?: number
  drive_path?: string
}

export type WorkStream = {
  object_id: string
  object_type: string
  title: string
  status: string
  verb: string
  outcome_hint?: string | null
  updated_at?: string | null
}

export type OperationLaneItem = {
  object_id: string
  title: string
  object_type: string
  event_type: string
  headline: string
  importance: number
  at?: string | null
}

export type WorkActivityItem = {
  id: string
  object_id: string
  object_type: string
  object_title: string
  event_type: string
  importance: number
  headline: string
  actor: string
  at?: string | null
}

export type WorkBundle = {
  focus: FocusCard[]
  focus_primary: FocusCard | null
  also_attention: FocusCard[]
  active_work: WorkStream[]
  operations: {
    verbs: Array<{ key: string; label: string }>
    lanes: Record<string, OperationLaneItem[]>
    window_hours: number
  }
  activity: WorkActivityItem[]
  projects: Array<{
    id: string
    title: string
    status: string
    metadata?: Record<string, unknown>
    updated_at?: string | null
    created_at?: string | null
  }>
  floor: CommandSnapshot
  generated_at: string
}

export type HomeBundle = {
  dna: CompanyDna
  pulse: HomePulse
  operating_mode: OperatingMode
  operating_state: OperatingState
  focus_now: FocusCard | null
  also_attention: FocusCard[]
  winning_signals: string[]
  momentum: {
    score: number
    score_delta_week: number | null
    rings: MomentumRings
    heatmap: HeatmapDay[]
    time_machine: { points: TimeMachinePoint[] }
  }
  changed: StoryCard[]
  learned: InsightCard[]
  recommends: InsightCard[]
  story: CompanyStory
  generated_at: string
}

export type SpaceObject = {
  id: string
  space_id: string
  object_type: string
  title: string
  status: string
  metadata?: Record<string, unknown>
  source_table?: string | null
  source_id?: string | null
  created_at?: string
  updated_at?: string
}

export type ObjectEvent = {
  id: string
  object_id: string
  event_type: string
  importance: number
  payload?: Record<string, unknown>
  actor: string
  created_at: string
}

export type ObjectEdge = {
  id: string
  from_object_id: string
  to_object_id: string
  edge_type: string
  source: string
  peer_title?: string
  peer_type?: string
  created_at?: string
}

export type ObjectBundle = {
  object: SpaceObject
  events: ObjectEvent[]
  related: ObjectEdge[]
}
