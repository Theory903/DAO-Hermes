import { Link } from "react-router-dom";
import { ArrowUpRight, Radio } from "lucide-react";

import { COMMAND_DEPTS, type CommandFloorState } from "../lib/command-floor";
import type { CommandSnapshot } from "../api/types";
import { cn } from "@/lib/utils";

type SpaceFloorPreviewProps = {
  snapshot: CommandSnapshot | null;
  floor: CommandFloorState;
  live: boolean;
  commandHref: string;
};

function statusClass(status: string): string {
  if (status === "reused") return "DAO-space-floor-status--reused";
  if (status === "active") return "DAO-space-floor-status--active";
  if (status === "needs_approval") return "DAO-space-floor-status--pending";
  return "DAO-space-floor-status--idle";
}

export function SpaceFloorPreview({
  snapshot,
  floor,
  live,
  commandHref,
}: SpaceFloorPreviewProps) {
  const activeCount = COMMAND_DEPTS.filter((d) => floor.statuses[d.key] !== "idle").length;

  return (
    <section className="DAO-space-floor-preview">
      <div className="DAO-space-floor-preview-head DAO-space-floor-preview-head--brief">
        <p className="DAO-util-section-label">
          Floor · {activeCount > 0 ? `${activeCount} active` : 'idle'}
        </p>
        <Link className="DAO-space-floor-preview-link" to={commandHref}>
          Command
          <ArrowUpRight size={12} strokeWidth={1.6} />
        </Link>
      </div>

      <div className="DAO-space-floor-preview-card">
        <div className="DAO-space-floor-preview-meta">
          <span className={cn("DAO-space-floor-live", live && "DAO-space-floor-live--on")}>
            <Radio size={12} />
            {live ? "Live" : "Connecting"}
          </span>
          {(snapshot?.pending_hitl ?? 0) > 0 ? (
            <span className="DAO-space-floor-pending">{snapshot?.pending_hitl} awaiting approval</span>
          ) : null}
        </div>

        <div className="DAO-space-floor-preview-grid">
          {COMMAND_DEPTS.map((dept) => {
            const status = floor.statuses[dept.key] ?? snapshot?.departments?.[dept.key] ?? "idle";
            const tasks = floor.lanes[dept.key];
            return (
              <div
                key={dept.key}
                className="DAO-space-floor-lane"
                style={{ borderLeftColor: dept.color }}
              >
                <div className="DAO-space-floor-lane-head">
                  <p className="DAO-company-dept-name">{dept.label}</p>
                  <span className={cn("DAO-space-floor-status", statusClass(status))}>
                    {status.replace(/_/g, " ")}
                  </span>
                </div>
                {tasks[0] ? (
                  <p className="DAO-space-floor-task">{tasks[0].text}</p>
                ) : (
                  <p className="DAO-space-floor-empty">No active tasks</p>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
