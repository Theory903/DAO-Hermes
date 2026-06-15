import { useEffect, useState } from "react";
import { Activity } from "lucide-react";
import { usePageHeader } from "@/contexts/usePageHeader";
import {
  VoidBadge,
  VoidCard,
  VoidPage,
  VoidSectionHeader,
} from "@/components/void";
import {
  DAOApiBase,
  DAOFetch,
  getDAOSpaceId,
  spaceApiPath,
} from "@/lib/DAO-api";
import { DAOHermes } from "@/lib/DAO-embed";

const DEPTS = [
  { id: "research", label: "Research", accent: "border-l-dept-research/40" },
  { id: "engineering", label: "Engineering", accent: "border-l-dept-engineering/40" },
  { id: "marketing", label: "Marketing", accent: "border-l-dept-marketing/40" },
  { id: "sales", label: "Sales", accent: "border-l-dept-sales/40" },
  { id: "ops", label: "Ops", accent: "border-l-dept-ops/40" },
] as const;

type Snapshot = {
  ai_lead: string;
  departments: Record<string, string>;
  pending_hitl: number;
  recent_handoffs: Array<{
    from_dept: string;
    to_dept: string;
    subject: string;
    created_at: string;
  }>;
};

export default function CommandPage() {
  const { setEnd } = usePageHeader();
  const spaceId = getDAOSpaceId();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [events, setEvents] = useState<string[]>([]);

  useEffect(() => {
    setEnd(null);
  }, [setEnd]);

  useEffect(() => {
    if (!spaceId) return;
    DAOFetch<Snapshot>(spaceApiPath(spaceId, "/command/snapshot")).then(setSnap);
  }, [spaceId]);

  useEffect(() => {
    if (!spaceId) return;
    const token =
      DAOHermes()?.getToken() ??
      (typeof window !== "undefined"
        ? localStorage.getItem("DAO_token")
        : null);
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    const url = `${DAOApiBase()}${spaceApiPath(spaceId, "/events")}${qs}`;
    const es = new EventSource(url);
    es.onmessage = (ev) => {
      setEvents((prev) => [ev.data, ...prev].slice(0, 20));
      void DAOFetch<Snapshot>(spaceApiPath(spaceId, "/command/snapshot")).then(
        setSnap,
      );
    };
    return () => es.close();
  }, [spaceId]);

  return (
    <VoidPage className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <VoidSectionHeader label="Command" title="Live company floor" />
        <div className="flex items-center gap-2">
          <Activity className="size-5 text-primary" strokeWidth={1.5} />
          <VoidBadge variant="primary">{snap?.ai_lead ?? "Jarvis"}</VoidBadge>
        </div>
      </div>

      <div className="grid min-w-0 gap-4 md:grid-cols-[repeat(5,minmax(200px,1fr))]">
        {DEPTS.map((dept) => {
          const status = snap?.departments[dept.id] ?? "idle";
          const isActive = status !== "idle";
          return (
            <VoidCard
              key={dept.id}
              className={`border-l-[3px] ${dept.accent} p-4`}
            >
              <p className="font-body text-xs uppercase tracking-[0.08em] text-text-muted">
                {dept.label}
              </p>
              <p
                className={`mt-2 font-display text-sm font-medium capitalize ${
                  isActive ? "text-text-primary" : "text-text-muted"
                }`}
              >
                {status}
              </p>
            </VoidCard>
          );
        })}
      </div>

      <VoidCard elevated className="space-y-4">
        <VoidSectionHeader label="Handoffs" title="Recent transfers" />
        <p className="font-body text-sm text-text-secondary">
          Pending HITL:{" "}
          <span className="text-signal-yellow">{snap?.pending_hitl ?? 0}</span>
        </p>
        <ul className="space-y-3">
          {(snap?.recent_handoffs ?? []).length === 0 && (
            <li className="text-sm text-text-muted">No recent handoffs.</li>
          )}
          {(snap?.recent_handoffs ?? []).map((h, i) => (
            <li
              key={i}
              className="border-b border-void-border pb-3 font-body text-sm text-text-secondary last:border-0"
            >
              <span className="text-text-primary">{h.from_dept}</span>
              {" → "}
              <span className="text-text-primary">{h.to_dept}</span>
              {h.subject ? `: ${h.subject}` : ""}
            </li>
          ))}
        </ul>
      </VoidCard>

      <VoidCard elevated>
        <VoidSectionHeader label="Events" title="Live stream" />
        <ul className="mt-4 max-h-48 space-y-1 overflow-y-auto font-mono text-xs text-text-muted">
          {events.length === 0 && <li className="text-text-muted/60">Waiting…</li>}
          {events.map((e, i) => (
            <li
              key={i}
              className="motion-safe:animate-fade-up border-b border-void-border/50 py-1 last:border-0"
            >
              {e}
            </li>
          ))}
        </ul>
      </VoidCard>
    </VoidPage>
  );
}
