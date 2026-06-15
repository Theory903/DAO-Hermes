import { useMemo, useState } from "react";
import { Crown, Zap } from "lucide-react";

import { UtilChipSwitch, UtilChipSwitchItem } from "@/app/util-page-nav";
import { cn } from "@/lib/utils";

import { ReusedBadge } from "../components/ReusedBadge";
import { getCommandSnapshot } from "../api/space-api";
import { useSpaceContext } from "../context/SpaceContext";
import { useCommandFloor, useSpaceEvents } from "../hooks/useSpaceEvents";
import { useAsync } from "../hooks/useAsync";
import { COMMAND_DEPTS } from "../lib/command-floor";
import { useLeadName } from "../lib/space-lead";
import {
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from "./_company-shell";

type CommandTab = "floor" | "handoffs" | "events";

function handoffLabel(row: Record<string, unknown>): string {
  return (
    (row.summary as string) ||
    (row.subject as string) ||
    (row.action as string) ||
    `${row.from_dept ?? "?"} → ${row.to_dept ?? "?"}`
  );
}

function deptIndex(dept: string): number {
  return COMMAND_DEPTS.findIndex((lane) => lane.key === dept);
}

function laneStatusClass(status: string): string {
  if (status === "reused") return "DAO-company-lane-status--reused";
  if (status === "active") return "DAO-company-lane-status--active";
  if (status === "needs_approval") return "DAO-company-lane-status--pending";
  return "";
}

function laneCardClass(status: string, isIdle: boolean): string {
  const base = isIdle ? "DAO-company-lane DAO-company-lane--idle" : "DAO-company-lane";
  if (status === "active") return `${base} DAO-company-lane--active`;
  if (status === "reused") return `${base} DAO-company-lane--reused`;
  return base;
}

function HandoffConnector({ fromDept, toDept, subject }: { fromDept: string; toDept: string; subject: string }) {
  const fromIndex = deptIndex(fromDept);
  const toIndex = deptIndex(toDept);
  if (fromIndex < 0 || toIndex < 0) {
    return (
      <div className="DAO-company-handoff-chip">
        <span className="DAO-company-handoff-dept">{fromDept}</span>
        <span className="DAO-company-handoff-arrow" aria-hidden="true">
          ···
        </span>
        <span className="DAO-company-handoff-dept">{toDept}</span>
        <span className="DAO-company-handoff-subject">{subject}</span>
      </div>
    );
  }

  const left = ((Math.min(fromIndex, toIndex) + 0.5) / COMMAND_DEPTS.length) * 100;
  const width = (Math.abs(toIndex - fromIndex) / COMMAND_DEPTS.length) * 100;

  return (
    <div className="DAO-company-handoff-chip">
      <div className="DAO-company-handoff-rail" aria-hidden="true">
        <svg className="DAO-company-handoff-svg" viewBox="0 0 100 12" preserveAspectRatio="none">
          <line
            className="DAO-company-handoff-line"
            x1={left}
            x2={left + width}
            y1="6"
            y2="6"
          />
        </svg>
      </div>
      <div className="DAO-company-handoff-meta">
        <span className="DAO-company-handoff-dept">{fromDept}</span>
        <span className="DAO-company-handoff-arrow">handoff</span>
        <span className="DAO-company-handoff-dept">{toDept}</span>
        <span className="DAO-company-handoff-subject">{subject}</span>
      </div>
    </div>
  );
}

export function CommandScreen() {
  const space = useSpaceContext();
  const configuredLead = useLeadName();
  const [tab, setTab] = useState<CommandTab>("floor");
  const snapshot = useAsync(() => getCommandSnapshot(space.id), [space.id]);
  const { live, events, error: sseError } = useSpaceEvents(space.id);
  const floor = useCommandFloor(events, snapshot.data);

  const leadName = snapshot.data?.ai_lead ?? configuredLead;
  const handoffs = snapshot.data?.recent_handoffs ?? [];
  const pendingHitl = snapshot.data?.pending_hitl ?? 0;

  const activeLanes = useMemo(
    () => COMMAND_DEPTS.filter((d) => floor.statuses[d.key] !== "idle").length,
    [floor.statuses],
  );

  const floorHandoffs = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...floor.handoffs];
    for (const row of handoffs) {
      const key = `${row.from_dept}-${row.to_dept}-${row.subject}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        id: key,
        fromDept: String(row.from_dept ?? ""),
        toDept: String(row.to_dept ?? ""),
        subject: handoffLabel(row),
        ts: row.created_at ? Date.parse(String(row.created_at)) : 0,
      });
    }
    return merged.slice(0, 6);
  }, [floor.handoffs, handoffs]);

  return (
    <DAOCompanyShell
      description={`${leadName} supervises five department lanes.`}
      filters={
        <UtilChipSwitch aria-label="Command views">
          <UtilChipSwitchItem active={tab === "floor"} count={DEPTS.length} onClick={() => setTab("floor")}>
            Floor
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={tab === "handoffs"} count={handoffs.length} onClick={() => setTab("handoffs")}>
            Handoffs
          </UtilChipSwitchItem>
          <UtilChipSwitchItem active={tab === "events"} count={events.length} onClick={() => setTab("events")}>
            Events
          </UtilChipSwitchItem>
        </UtilChipSwitch>
      }
      headerTrailing={
        <span className={live ? "DAO-company-pill DAO-company-pill--live" : "DAO-company-pill DAO-company-pill--pending"}>
          {live ? "Live" : "Connecting…"}
        </span>
      }
      title="Command Center"
    >
      <CompanyScroll>
        {snapshot.loading ? (
          <CompanyLoading label="Loading floor snapshot…" />
        ) : snapshot.error ? (
          <CompanyError message={snapshot.error} onRetry={snapshot.reload} />
        ) : (
          <>
            <div className="DAO-company-stat-strip" aria-label="Floor summary">
              <div className="DAO-company-stat">
                <span className="DAO-company-stat-value">{activeLanes}</span>
                <span className="DAO-company-stat-label">active lanes</span>
              </div>
              <div className="DAO-company-stat">
                <span className="DAO-company-stat-value">{floorHandoffs.length}</span>
                <span className="DAO-company-stat-label">handoffs</span>
              </div>
              <div className="DAO-company-stat">
                <span className="DAO-company-stat-value">{pendingHitl}</span>
                <span className="DAO-company-stat-label">awaiting approval</span>
              </div>
              <div className="DAO-company-stat">
                <span className="DAO-company-stat-value">{events.length}</span>
                <span className="DAO-company-stat-label">live events</span>
              </div>
            </div>

        {tab === "floor" ? (
          <section className="DAO-company-floor">
            <div className="DAO-company-lead-strip">
              <article className="DAO-company-lead-card DAO-company-lead-card--hero">
                <span className="DAO-company-lead-avatar DAO-company-lead-avatar--icon" aria-hidden="true">
                  <Crown size={18} strokeWidth={1.5} />
                </span>
                <div>
                  <p className="DAO-company-lead-name">{leadName}</p>
                  <p className="DAO-company-lead-role">AI Lead · orchestrating the floor</p>
                </div>
                {pendingHitl > 0 ? (
                  <span className="DAO-company-pill DAO-company-pill--pending">
                    {pendingHitl} awaiting approval
                  </span>
                ) : (
                  <span className="DAO-company-pill DAO-company-pill--ready">
                    <Zap size={12} aria-hidden="true" />
                    Ready
                  </span>
                )}
              </article>
            </div>

            {sseError ? <CompanyError message={sseError} /> : null}

            {floorHandoffs.length > 0 ? (
              <div className="DAO-company-handoff-strip">
                <h2 className="DAO-util-section-label">Live handoffs</h2>
                <div className="DAO-company-handoff-list">
                  {floorHandoffs.map((handoff) => (
                    <HandoffConnector
                      key={handoff.id}
                      fromDept={handoff.fromDept}
                      subject={handoff.subject}
                      toDept={handoff.toDept}
                    />
                  ))}
                </div>
              </div>
            ) : null}

            <h2 className="DAO-util-section-label">Department lanes</h2>
            <div className="DAO-company-floor-grid">
              {COMMAND_DEPTS.map((dept) => {
                const tasks = floor.lanes[dept.key];
                const status = floor.statuses[dept.key];
                const isIdle = status === "idle";
                return (
                  <article
                    key={dept.key}
                    className={laneCardClass(status, isIdle)}
                    style={{ borderLeftColor: dept.color }}
                  >
                    <header className="DAO-company-lane-head">
                      <p className="DAO-company-dept-name">{dept.label}</p>
                      <span className={cn("DAO-company-lane-status", laneStatusClass(status))}>
                        {status.replace(/_/g, " ")}
                      </span>
                    </header>
                    <div className="DAO-company-lane-tasks">
                      {tasks.length === 0 ? (
                        <p className="DAO-company-lane-empty">
                          {isIdle ? "Idle — waiting for work" : "Listening…"}
                        </p>
                      ) : (
                        tasks.map((task) => (
                          <div key={task.id} className="DAO-company-task-card">
                            <div className="DAO-company-task-card-head">
                              <span className="DAO-company-feed-type">{task.eventType.replace(/_/g, " ")}</span>
                              {task.reused ? <ReusedBadge pulse={false} /> : null}
                            </div>
                            <p className="DAO-company-task-card-text">{task.text}</p>
                          </div>
                        ))
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : tab === "handoffs" ? (
          <section>
            <h2 className="DAO-util-section-label">Recent handoffs</h2>
            {handoffs.length === 0 ? (
              <CompanyEmpty
                description="Cross-department work routed by AI Leads appears here."
                title="No handoffs yet"
              />
            ) : (
              <ul className="DAO-company-feed">
                {handoffs.slice(0, 12).map((row, i) => (
                  <li key={`handoff-${i}`} className="DAO-company-feed-item">
                    <span className="DAO-company-feed-type">handoff</span>
                    <span className="DAO-company-feed-text">{handoffLabel(row)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        ) : (
          <section>
            <h2 className="DAO-util-section-label">Event feed</h2>
            {sseError ? <CompanyError message={sseError} /> : null}
            {events.length === 0 ? (
              <CompanyEmpty
                description="Handoffs, writebacks, and REUSED badges stream here in real time."
                title="Waiting for floor events"
              />
            ) : (
              <ul className="DAO-company-feed">
                {events.map((ev) => (
                  <li key={ev.id} className="DAO-company-feed-item">
                    <span className="DAO-company-feed-type">{ev.type}</span>
                    <span className="DAO-company-feed-text">{ev.text}</span>
                    {ev.reused ? <ReusedBadge /> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
          </>
        )}
      </CompanyScroll>
    </DAOCompanyShell>
  );
}

const DEPTS = COMMAND_DEPTS;
