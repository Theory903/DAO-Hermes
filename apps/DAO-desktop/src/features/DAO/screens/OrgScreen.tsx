import { useCallback, useEffect, useMemo, useState } from "react";

import { UtilChipSwitch, UtilChipSwitchItem } from "@/app/util-page-nav";
import { Button } from "@/components/ui/button";
import { Codicon } from "@/components/ui/codicon";
import {
  Sheet,
  SheetContent,
  SheetFooter,
} from "@/components/ui/sheet";

import {
  applyOrgTemplate,
  createAgent,
  getOrgChart,
  listAgents,
  listOrgTemplates,
  suggestOrgTemplate,
  updateAgent,
  updateOrgConfig,
  type AgentCreateBody,
  type AgentRow,
  type DepartmentMeta,
  type OrgChart,
  type OrgChartNode,
  type OrgTemplate,
} from "../api/space-api";
import { useSpaceContext } from "../context/SpaceContext";
import { useLeadName } from "../lib/space-lead";
import { useAsync } from "../hooks/useAsync";
import {
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from "./_company-shell";

type OrgView = "structure" | "setup";
type StructureMode = "departments" | "hierarchy";
type EditorMode =
  | { kind: "edit"; agentId: string }
  | { kind: "create"; department: string }
  | null;

const TIER_LABEL: Record<number, string> = { 1: "Fast", 2: "Balanced", 3: "Reasoning" };

const TIER_HINT: Record<number, string> = {
  1: "Quick replies · AI Lead default",
  2: "Everyday delegation · department leads",
  3: "Deep reasoning · workers & research",
};

const TYPE_LABEL: Record<string, string> = {
  ai_lead: "AI Lead",
  lead: "Department Lead",
  worker: "Worker",
};

const TYPE_HINT: Record<string, string> = {
  lead: "Owns a department lane and delegates to workers",
  worker: "Executes tasks, tools, and deliverables",
};

function deptColor(meta: DepartmentMeta[] | undefined, key: string): string {
  return meta?.find((d) => d.key === key)?.color ?? "var(--color-primary)";
}

function deptLabel(meta: DepartmentMeta[] | undefined, key: string): string {
  return meta?.find((d) => d.key === key)?.label ?? key;
}

function reportsFor(chart: OrgChart, nodeId: string) {
  return chart.edges
    .filter((e) => e.from === nodeId)
    .map((e) => chart.nodes.find((n) => n.id === e.to))
    .filter(Boolean) as OrgChartNode[];
}

function rootNodes(chart: OrgChart) {
  const hasParent = new Set(chart.edges.map((e) => e.to));
  return chart.nodes.filter((n) => !hasParent.has(n.id));
}

function groupByDepartment(nodes: OrgChartNode[]): Map<string, OrgChartNode[]> {
  const map = new Map<string, OrgChartNode[]>();
  for (const node of nodes) {
    const dept = node.department || "other";
    const bucket = map.get(dept) ?? [];
    bucket.push(node);
    map.set(dept, bucket);
  }
  return map;
}

function defaultParentId(
  nodes: OrgChartNode[],
  department: string,
  agentType: "lead" | "worker",
): string | null {
  if (agentType === "lead") {
    return nodes.find((n) => n.agent_type === "ai_lead")?.id ?? null;
  }
  return nodes.find((n) => n.department === department && n.agent_type === "lead")?.id ?? null;
}

export function OrgScreen({ embedded = false }: { embedded?: boolean }) {
  const space = useSpaceContext();
  const [view, setView] = useState<OrgView>("structure");
  const [structureMode, setStructureMode] = useState<StructureMode>("departments");
  const chart = useAsync(() => getOrgChart(space.id), [space.id]);
  const agentsList = useAsync(() => listAgents(space.id), [space.id]);
  const templates = useAsync(() => listOrgTemplates(space.id), [space.id]);

  const [editor, setEditor] = useState<EditorMode>(null);
  const [draft, setDraft] = useState<Partial<AgentRow> & { agent_type?: string }>({});
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [customKeys, setCustomKeys] = useState<string[]>([]);
  const [suggestReason, setSuggestReason] = useState<string | null>(null);

  const nodes = chart.data?.nodes ?? [];
  const edges = chart.data?.edges ?? [];
  const deptMeta = chart.data?.departments ?? [];
  const byDept = useMemo(() => groupByDepartment(nodes), [nodes]);
  const leadName = useLeadName();

  const agentsById = useMemo(() => {
    const map = new Map<string, AgentRow>();
    for (const a of agentsList.data?.agents ?? []) map.set(a.id, a);
    return map;
  }, [agentsList.data]);

  const enabledKeys = useMemo(
    () => deptMeta.map((d) => d.key).filter((k) => k !== "executive"),
    [deptMeta],
  );

  useEffect(() => {
    if (view === "setup" && customKeys.length === 0 && enabledKeys.length) {
      setCustomKeys(enabledKeys);
    }
  }, [view, enabledKeys, customKeys.length]);

  const orderedDepts = useMemo(() => {
    const keys = [...enabledKeys];
    if (byDept.get("executive")?.length) keys.unshift("executive");
    for (const k of byDept.keys()) {
      if (!keys.includes(k)) keys.push(k);
    }
    return keys;
  }, [enabledKeys, byDept]);

  const reloadAll = useCallback(async () => {
    await Promise.all([chart.reload(), agentsList.reload(), templates.reload()]);
  }, [chart, agentsList, templates]);

  const editingAgent = editor?.kind === "edit" ? agentsById.get(editor.agentId) : null;
  const isAiLead = editingAgent?.agent_type === "ai_lead";

  function openEdit(node: OrgChartNode) {
    const full = agentsById.get(node.id);
    setEditor({ kind: "edit", agentId: node.id });
    setDraft({
      name: full?.name ?? node.label,
      role: full?.role ?? node.role,
      department: full?.department ?? node.department,
      agent_type: full?.agent_type ?? node.agent_type,
      model_tier: full?.model_tier ?? node.model_tier ?? 2,
      system_instruction: full?.system_instruction ?? "",
      parent_agent_id: full?.parent_agent_id ?? node.parent_id ?? null,
    });
  }

  function openCreate(department: string) {
    const label = deptLabel(deptMeta, department);
    const deptAgents = byDept.get(department) ?? [];
    const agentType: "lead" | "worker" = deptAgents.some((n) => n.agent_type === "lead") ? "worker" : "lead";
    setEditor({ kind: "create", department });
    setDraft({
      name: agentType === "lead" ? `${label} Lead` : `${label} Worker`,
      role: agentType === "lead" ? `${label} Lead` : `${label} Worker`,
      department,
      agent_type: agentType,
      model_tier: agentType === "lead" ? 2 : 3,
      system_instruction:
        agentType === "lead"
          ? `You lead the ${label} department.`
          : `You execute tasks for the ${label} department.`,
      parent_agent_id: defaultParentId(nodes, department, agentType),
    });
  }

  async function saveEditor() {
    if (!editor) return;
    setSaving(true);
    try {
      if (editor.kind === "edit" && editingAgent) {
        await updateAgent(space.id, editingAgent.id, {
          name: draft.name,
          role: draft.role,
          department: draft.department,
          model_tier: draft.model_tier,
          system_instruction: draft.system_instruction,
          parent_agent_id: draft.parent_agent_id ?? null,
        });
      } else if (editor.kind === "create") {
        const body: AgentCreateBody = {
          name: draft.name ?? "Agent",
          role: draft.role ?? draft.name ?? "Agent",
          department: editor.department,
          agent_type: (draft.agent_type as "lead" | "worker") ?? "worker",
          model_tier: draft.model_tier ?? 3,
          system_instruction: draft.system_instruction ?? "",
          parent_agent_id: draft.parent_agent_id ?? null,
        };
        await createAgent(space.id, body);
      }
      setEditor(null);
      await reloadAll();
    } finally {
      setSaving(false);
    }
  }

  async function applyTemplate(templateId: string, replace = false, departments?: string[]) {
    if (
      replace &&
      !window.confirm("Replace existing org? This removes all agents and re-seeds from the template.")
    ) {
      return;
    }
    setApplying(true);
    try {
      await applyOrgTemplate(space.id, { template_id: templateId, replace, departments });
      setSuggestReason(null);
      await reloadAll();
      setView("structure");
      setStructureMode("departments");
    } finally {
      setApplying(false);
    }
  }

  async function saveLayoutOnly(keys: string[]) {
    if (!keys.length) return;
    setApplying(true);
    try {
      await updateOrgConfig(space.id, { template_id: "custom", departments: keys });
      await reloadAll();
    } finally {
      setApplying(false);
    }
  }

  async function suggestTemplate() {
    setApplying(true);
    try {
      const res = await suggestOrgTemplate(space.id, {
        mission: space.ai_lead_config?.mission,
        space_name: space.name,
      });
      setSuggestReason(res.reason);
      if (res.template_id === "custom") {
        setCustomKeys(res.template.departments.map((d) => d.key));
        setView("setup");
      } else {
        await applyTemplate(res.template_id, false);
      }
    } finally {
      setApplying(false);
    }
  }

  const templateList = templates.data?.templates ?? [];
  const currentTemplate = chart.data?.template_id ?? "standard-five";
  const hasAgents = nodes.length > 0;

  const parentOptions = useMemo(() => {
    const exclude = editor?.kind === "edit" ? editor.agentId : null;
    return nodes.filter((n) => n.id !== exclude);
  }, [nodes, editor]);

  const orgFilters = (
    <UtilChipSwitch aria-label="Organization views">
      <UtilChipSwitchItem active={view === "structure"} count={nodes.length} onClick={() => setView("structure")}>
        Structure
      </UtilChipSwitchItem>
      <UtilChipSwitchItem active={view === "setup"} onClick={() => setView("setup")}>
        Customize
      </UtilChipSwitchItem>
    </UtilChipSwitch>
  );

  const orgTrailing = (
    <Button
      aria-label="Refresh"
      className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
      onClick={() => reloadAll()}
      size="icon-xs"
      type="button"
      variant="ghost"
    >
      <Codicon name="refresh" size="0.875rem" spinning={chart.loading} />
    </Button>
  );

  const body = (
    <>
      {embedded ? (
        <div className="DAO-control-org-toolbar">
          {orgFilters}
          {orgTrailing}
        </div>
      ) : null}
      <CompanyScroll>
        {chart.loading && view === "structure" ? (
          <CompanyLoading label="Loading org chart…" />
        ) : chart.error ? (
          <CompanyError message={chart.error} onRetry={chart.reload} />
        ) : view === "setup" ? (
          <SetupPanel
            applying={applying}
            catalog={templates.data?.catalog ?? []}
            currentTemplate={currentTemplate}
            customKeys={customKeys}
            hasAgents={hasAgents}
            onApply={applyTemplate}
            onSaveLayout={saveLayoutOnly}
            onSuggest={suggestTemplate}
            onToggleCustom={(key) =>
              setCustomKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
            }
            suggestReason={suggestReason}
            templates={templateList}
          />
        ) : nodes.length === 0 ? (
          <CompanyEmpty
            description="Open Customize to pick a template and seed your org."
            title="No agents yet"
          />
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <UtilChipSwitch aria-label="Structure view">
                <UtilChipSwitchItem
                  active={structureMode === "departments"}
                  count={nodes.length}
                  onClick={() => setStructureMode("departments")}
                >
                  Departments
                </UtilChipSwitchItem>
                <UtilChipSwitchItem
                  active={structureMode === "hierarchy"}
                  count={edges.length}
                  onClick={() => setStructureMode("hierarchy")}
                >
                  Hierarchy
                </UtilChipSwitchItem>
              </UtilChipSwitch>
            </div>

            {structureMode === "departments" ? (
              <div className="DAO-company-org-grid">
                {orderedDepts.map((dept) => {
              const members = byDept.get(dept) ?? [];
              const color = deptColor(deptMeta, dept);
              const canAdd = dept !== "executive" && enabledKeys.includes(dept);
              return (
                <section key={dept} className="DAO-company-org-dept">
                  <div className="DAO-company-org-dept-header">
                    <h2 className="DAO-company-dept-name" style={{ color }}>
                      {deptLabel(deptMeta, dept)}
                    </h2>
                    {canAdd ? (
                      <Button onClick={() => openCreate(dept)} size="sm" type="button" variant="ghost">
                        <Codicon name="add" size="0.875rem" />
                        Add
                      </Button>
                    ) : null}
                  </div>
                  {members.length === 0 ? (
                    <p className="DAO-company-dept-status">No agents</p>
                  ) : (
                    <ul className="DAO-company-org-agent-list">
                      {members.map((agent) => (
                        <li key={agent.id}>
                          <button
                            className="DAO-company-org-agent-card DAO-company-org-agent-card--clickable"
                            onClick={() => openEdit(agent)}
                            style={{ borderLeftColor: color }}
                            type="button"
                          >
                            <span className="DAO-company-org-agent-name">{agent.label}</span>
                            <span className="DAO-company-pill DAO-company-pill--reused">{agent.agent_type}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
              </div>
            ) : chart.data ? (
              <ul className="DAO-company-org-tree">
                {rootNodes(chart.data).map((root) => (
                  <OrgTree key={root.id} chart={chart.data!} node={root} onEdit={openEdit} />
                ))}
              </ul>
            ) : null}
          </div>
        )}
      </CompanyScroll>

      <Sheet onOpenChange={(open) => !open && setEditor(null)} open={Boolean(editor)}>
        <SheetContent className="DAO-company-org-editor-sheet" showCloseButton side="right">
          {editor ? (
            <AgentEditorHeader
              agentType={draft.agent_type ?? editingAgent?.agent_type}
              department={
                editor.kind === "create"
                  ? editor.department
                  : (draft.department ?? editingAgent?.department ?? "")
              }
              deptMeta={deptMeta}
              isCreate={editor.kind === "create"}
              name={draft.name}
            />
          ) : null}

          <div className="DAO-company-org-editor-fields">
            {editor ? (
              <AgentEditorForm
                deptMeta={deptMeta}
                draft={draft}
                editor={editor}
                enabledKeys={enabledKeys}
                isAiLead={isAiLead}
                nodes={nodes}
                parentOptions={parentOptions}
                setDraft={setDraft}
              />
            ) : null}
          </div>

          <SheetFooter className="DAO-company-org-editor-actions">
            <Button className="flex-1" disabled={saving} onClick={saveEditor} type="button">
              {saving ? "Saving…" : editor?.kind === "create" ? "Create agent" : "Save changes"}
            </Button>
            <Button onClick={() => setEditor(null)} type="button" variant="ghost">
              Cancel
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );

  if (embedded) {
    return body;
  }

  return (
    <DAOCompanyShell
      description="Department structure, agents, and org templates."
      filters={orgFilters}
      headerTrailing={orgTrailing}
      searchHidden
      title="Organization"
    >
      {body}
    </DAOCompanyShell>
  );
}

function OrgTree({
  chart,
  node,
  onEdit,
  depth = 0,
}: {
  chart: OrgChart;
  node: OrgChartNode;
  onEdit: (n: OrgChartNode) => void;
  depth?: number;
}) {
  const children = reportsFor(chart, node.id);
  const color = deptColor(chart.departments, node.department);

  return (
    <li className="DAO-company-org-tree-root" style={{ marginLeft: depth * 16 }}>
      <button
        className="DAO-company-org-agent-card DAO-company-org-agent-card--root DAO-company-org-agent-card--clickable"
        onClick={() => onEdit(node)}
        style={{ borderLeft: `2px solid ${color}` }}
        type="button"
      >
        <span className="DAO-company-org-agent-name">{node.label}</span>
        <span className="DAO-company-pill DAO-company-pill--reused">{node.agent_type}</span>
      </button>
      {children.length ? (
        <ul className="DAO-company-org-tree-children">
          {children.map((child) => (
            <OrgTree key={child.id} chart={chart} node={child} onEdit={onEdit} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function SetupPanel({
  templates,
  catalog,
  currentTemplate,
  customKeys,
  applying,
  suggestReason,
  hasAgents,
  onApply,
  onSaveLayout,
  onSuggest,
  onToggleCustom,
}: {
  templates: OrgTemplate[];
  catalog: DepartmentMeta[];
  currentTemplate: string;
  customKeys: string[];
  applying: boolean;
  suggestReason: string | null;
  hasAgents: boolean;
  onApply: (id: string, replace?: boolean, departments?: string[]) => void;
  onSaveLayout: (keys: string[]) => void;
  onSuggest: () => void;
  onToggleCustom: (key: string) => void;
}) {
  return (
    <div className="DAO-company-org-setup">
      <section className="DAO-company-org-template-card">
        <h3 className="DAO-company-org-agent-name">How customization works</h3>
        <ul className="DAO-company-org-help-list">
          <li><strong>Save layout</strong> — updates departments only, keeps agents.</li>
          <li><strong>Add missing agents</strong> — seeds new department teams without removing anyone.</li>
          <li><strong>Replace org</strong> — wipes and rebuilds from template.</li>
        </ul>
      </section>

      <div className="DAO-company-org-setup-actions">
        <Button disabled={applying} onClick={onSuggest} size="sm" type="button">
          Suggest from mission
        </Button>
        {suggestReason ? <p className="DAO-company-dept-status">{suggestReason}</p> : null}
      </div>

      <div className="DAO-company-org-template-grid">
        {templates
          .filter((t) => t.id !== "custom")
          .map((t) => (
            <article
              key={t.id}
              className={`DAO-company-org-template-card${t.id === currentTemplate ? " DAO-company-org-template-card--active" : ""}`}
            >
              <h3 className="DAO-company-org-agent-name">{t.name}</h3>
              <p className="DAO-company-dept-status">{t.description}</p>
              <div className="DAO-company-org-template-tags">
                {t.departments.map((d) => (
                  <span key={d.key} className="DAO-company-pill" style={{ borderColor: d.color }}>
                    {d.label}
                  </span>
                ))}
              </div>
              <div className="DAO-company-org-template-actions">
                <Button disabled={applying} onClick={() => onApply(t.id, false)} size="sm" type="button">
                  {hasAgents ? "Add missing agents" : "Apply"}
                </Button>
                <Button disabled={applying} onClick={() => onApply(t.id, true)} size="sm" type="button" variant="ghost">
                  Replace org
                </Button>
              </div>
            </article>
          ))}
      </div>

      <section className="DAO-company-org-template-card">
        <h3 className="DAO-company-org-agent-name">Custom departments</h3>
        <p className="DAO-company-dept-status">Toggle lanes, save layout, or provision agents.</p>
        <div className="DAO-company-org-template-tags">
          {catalog
            .filter((d) => d.key !== "executive")
            .map((d) => {
              const on = customKeys.includes(d.key);
              return (
                <button
                  key={d.key}
                  className={`DAO-company-pill${on ? " DAO-company-pill--pending" : ""}`}
                  onClick={() => onToggleCustom(d.key)}
                  style={on ? { borderColor: d.color } : undefined}
                  type="button"
                >
                  {d.label}
                </button>
              );
            })}
        </div>
        <div className="DAO-company-org-template-actions">
          <Button disabled={applying || customKeys.length === 0} onClick={() => onSaveLayout(customKeys)} size="sm" type="button">
            Save layout
          </Button>
          <Button disabled={applying || customKeys.length === 0} onClick={() => onApply("custom", false, customKeys)} size="sm" type="button">
            {hasAgents ? "Add missing agents" : "Apply custom"}
          </Button>
          <Button
            disabled={applying || customKeys.length === 0}
            onClick={() => onApply("custom", true, customKeys)}
            size="sm"
            type="button"
            variant="ghost"
          >
            Replace with custom
          </Button>
        </div>
      </section>
    </div>
  );
}

function AgentEditorHeader({
  isCreate,
  name,
  department,
  agentType,
  deptMeta,
}: {
  isCreate: boolean;
  name?: string;
  department: string;
  agentType?: string;
  deptMeta: DepartmentMeta[];
}) {
  const color = deptColor(deptMeta, department);
  const title = isCreate ? "New agent" : name || "Edit agent";
  const subtitle = isCreate
    ? `Add to ${deptLabel(deptMeta, department)}`
    : [TYPE_LABEL[agentType ?? ""] ?? agentType, deptLabel(deptMeta, department)].filter(Boolean).join(" · ");

  return (
    <header className="DAO-company-org-editor-header">
      <span
        className="DAO-company-org-editor-avatar"
        style={{ background: `${color}18`, boxShadow: `inset 0 0 0 1px ${color}44` }}
      >
        <span className="DAO-company-org-editor-avatar-dot" style={{ background: color }} />
      </span>
      <div className="DAO-company-org-editor-header-copy">
        <p className="DAO-company-org-editor-kicker">{isCreate ? "Create" : "Edit agent"}</p>
        <h2 className="DAO-company-org-editor-title">{title}</h2>
        {subtitle ? <p className="DAO-company-org-editor-subtitle">{subtitle}</p> : null}
      </div>
    </header>
  );
}

function EditorSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="DAO-company-org-editor-section">
      <div className="DAO-company-org-editor-section-head">
        <h3 className="DAO-company-org-editor-section-title">{title}</h3>
        {description ? <p className="DAO-company-org-editor-section-desc">{description}</p> : null}
      </div>
      <div className="DAO-company-org-editor-panel">{children}</div>
    </section>
  );
}

function AgentEditorForm({
  editor,
  draft,
  setDraft,
  deptMeta,
  enabledKeys,
  nodes,
  parentOptions,
  isAiLead,
}: {
  editor: NonNullable<EditorMode>;
  draft: Partial<AgentRow> & { agent_type?: string };
  setDraft: React.Dispatch<React.SetStateAction<Partial<AgentRow> & { agent_type?: string }>>;
  deptMeta: DepartmentMeta[];
  enabledKeys: string[];
  nodes: OrgChartNode[];
  parentOptions: OrgChartNode[];
  isAiLead: boolean;
}) {
  const dept = editor.kind === "create" ? editor.department : (draft.department ?? "");

  return (
    <>
      {editor.kind === "create" ? (
        <EditorSection title="Agent type" description="How this agent fits the hierarchy">
          <div className="DAO-company-org-choice-grid">
            {(["lead", "worker"] as const).map((t) => {
              const active = (draft.agent_type ?? "worker") === t;
              return (
                <button
                  key={t}
                  className={`DAO-company-org-choice-card${active ? " DAO-company-org-choice-card--active" : ""}`}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      agent_type: t,
                      model_tier: t === "lead" ? 2 : 3,
                      parent_agent_id: defaultParentId(nodes, editor.department, t),
                    }))
                  }
                  type="button"
                >
                  <span className="DAO-company-org-choice-title">{t}</span>
                  <span className="DAO-company-org-choice-hint">{TYPE_HINT[t]}</span>
                </button>
              );
            })}
          </div>
        </EditorSection>
      ) : null}

      <EditorSection title="Identity" description="Name and title on the org chart">
        <Field hint="Shown on cards and hierarchy" label="Display name">
          <input
            className="DAO-company-org-input"
            onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Research Lead"
            value={draft.name ?? ""}
          />
        </Field>
        <Field hint="Subtitle under the agent name" label="Role">
          <input
            className="DAO-company-org-input"
            onChange={(e) => setDraft((d) => ({ ...d, role: e.target.value }))}
            placeholder="Job title or short mandate"
            value={draft.role ?? ""}
          />
        </Field>
        {editor.kind === "edit" && draft.agent_type ? (
          <div className="DAO-company-org-editor-meta">
            <span className="DAO-company-pill DAO-company-pill--reused">
              {TYPE_LABEL[draft.agent_type] ?? draft.agent_type}
            </span>
            <span className="DAO-company-dept-status">{deptLabel(deptMeta, draft.department ?? "")}</span>
          </div>
        ) : null}
      </EditorSection>

      {!isAiLead ? (
        <EditorSection title="Placement" description="Department and reporting line">
          {editor.kind === "edit" ? (
            <Field label="Department">
              <div className="DAO-company-org-template-tags">
                {enabledKeys.map((k) => {
                  const active = draft.department === k;
                  const color = deptColor(deptMeta, k);
                  return (
                    <button
                      key={k}
                      className={`DAO-company-pill${active ? " DAO-company-pill--pending" : ""}`}
                      onClick={() => setDraft((d) => ({ ...d, department: k }))}
                      style={active ? { borderColor: color } : undefined}
                      type="button"
                    >
                      {deptLabel(deptMeta, k)}
                    </button>
                  );
                })}
              </div>
            </Field>
          ) : (
            <div className="DAO-company-org-editor-meta">
              <span className="DAO-company-org-editor-avatar-dot" style={{ background: deptColor(deptMeta, dept) }} />
              <span className="DAO-company-dept-status">{deptLabel(deptMeta, dept)}</span>
            </div>
          )}

          <Field hint="Who supervises this agent" label="Reports to">
            <div className="DAO-company-org-manager-list">
              <button
                className={`DAO-company-org-manager-item${!draft.parent_agent_id ? " DAO-company-org-manager-item--active" : ""}`}
                onClick={() => setDraft((d) => ({ ...d, parent_agent_id: null }))}
                type="button"
              >
                <span className="DAO-company-dept-status">No manager</span>
              </button>
              {parentOptions.map((n) => {
                const active = draft.parent_agent_id === n.id;
                return (
                  <button
                    key={n.id}
                    className={`DAO-company-org-manager-item${active ? " DAO-company-org-manager-item--active" : ""}`}
                    onClick={() => setDraft((d) => ({ ...d, parent_agent_id: n.id }))}
                    type="button"
                  >
                    <span className="DAO-company-org-agent-name">{n.label}</span>
                    <span className="DAO-company-pill DAO-company-pill--reused">
                      {TYPE_LABEL[n.agent_type] ?? n.agent_type}
                    </span>
                  </button>
                );
              })}
            </div>
          </Field>
        </EditorSection>
      ) : null}

      <EditorSection title="Model & behavior" description="Tier and system instructions">
        <Field label="Model tier">
          <div className="DAO-company-org-tier-stack">
            {[1, 2, 3].map((t) => {
              const active = (draft.model_tier ?? 2) === t;
              return (
                <button
                  key={t}
                  className={`DAO-company-org-tier-card${active ? " DAO-company-org-tier-card--active" : ""}`}
                  onClick={() => setDraft((d) => ({ ...d, model_tier: t }))}
                  type="button"
                >
                  <span className="DAO-company-org-tier-card-title">
                    Tier {t} · {TIER_LABEL[t]}
                  </span>
                  <span className="DAO-company-org-tier-card-hint">{TIER_HINT[t]}</span>
                </button>
              );
            })}
          </div>
        </Field>

        <Field hint="Core behavior prompt for this agent" label="System instruction">
          <textarea
            className="DAO-company-org-textarea"
            onChange={(e) => setDraft((d) => ({ ...d, system_instruction: e.target.value }))}
            placeholder="How should this agent behave? What should it optimize for?"
            rows={7}
            value={draft.system_instruction ?? ""}
          />
        </Field>
      </EditorSection>
    </>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="DAO-company-org-field">
      <span className="DAO-company-org-field-label">{label}</span>
      {hint ? <span className="DAO-company-org-field-hint">{hint}</span> : null}
      {children}
    </label>
  );
}
