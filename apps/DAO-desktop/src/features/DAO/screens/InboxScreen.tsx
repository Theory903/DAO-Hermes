import { useState } from "react";
import { Check, ChevronRight, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ToolTracePanel } from "../components/ToolTracePanel";
import { listHitl, resolveHitl, type HitlRequest } from "../api/space-api";
import { useSpaceContext } from "../context/SpaceContext";
import { useLeadName } from "../lib/space-lead";
import { useAsync } from "../hooks/useAsync";
import {
  CompanyBanner,
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  CompanyScroll,
  DAOCompanyShell,
} from "./_company-shell";

export function InboxScreen() {
  const space = useSpaceContext();
  const hitl = useAsync(() => listHitl(space.id, "pending"), [space.id]);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<"approved" | "rejected" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HitlRequest | null>(null);
  const requests = hitl.data?.requests ?? [];
  const leadName = useLeadName();

  async function resolve(req: HitlRequest, decision: "approved" | "rejected") {
    setBusy(req.id);
    setFlash(null);
    setActionError(null);
    try {
      await resolveHitl(space.id, req.id, decision);
      setFlash(decision);
      if (selected?.id === req.id) setSelected(null);
      hitl.reload();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Could not resolve request");
    } finally {
      setBusy(null);
    }
  }

  return (
    <DAOCompanyShell
      description="Sensitive actions queue here for Board sign-off."
      headerTrailing={
        requests.length > 0 ? (
          <span className="DAO-company-pill DAO-company-pill--pending">{requests.length} pending</span>
        ) : (
          <span className="DAO-company-pill DAO-company-pill--live">All clear</span>
        )
      }
      title="Inbox"
    >
      <CompanyScroll>
        {actionError ? <CompanyError message={actionError} /> : null}

        {flash ? (
          <CompanyBanner tone={flash === "approved" ? "ok" : "warn"}>
            Request {flash}.
          </CompanyBanner>
        ) : null}

        {hitl.loading ? (
          <CompanyLoading label="Loading approvals…" />
        ) : hitl.error ? (
          <CompanyError message={hitl.error} onRetry={hitl.reload} />
        ) : requests.length === 0 ? (
          <CompanyEmpty
            description={`${leadName} is running autonomously.`}
            leadName={leadName}
            title="All clear"
          />
        ) : (
          <ul className="DAO-company-hitl-list">
            {requests.map((req) => (
              <li key={req.id}>
                <button
                  className="DAO-company-hitl-card DAO-company-hitl-card--button"
                  onClick={() => setSelected(req)}
                  type="button"
                >
                  <div className="DAO-company-hitl-head">
                    <h2 className="DAO-company-hitl-title">{req.action_summary}</h2>
                    <span className="DAO-company-pill DAO-company-pill--pending">pending</span>
                  </div>
                  {req.created_at ? (
                    <p className="DAO-company-hitl-meta">{new Date(req.created_at).toLocaleString()}</p>
                  ) : null}
                  {req.drive_refs?.length ? (
                    <p className="DAO-company-hitl-meta">{req.drive_refs.length} Drive reference(s)</p>
                  ) : null}
                  <span className="DAO-company-hitl-open">
                    Review details
                    <ChevronRight aria-hidden="true" size={14} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CompanyScroll>

      <Sheet onOpenChange={(open) => !open && setSelected(null)} open={Boolean(selected)}>
        <SheetContent className="DAO-company-hitl-sheet" showCloseButton side="right">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.action_summary}</SheetTitle>
                <SheetDescription>
                  {selected.created_at
                    ? `Queued ${new Date(selected.created_at).toLocaleString()}`
                    : "Awaiting Board approval"}
                </SheetDescription>
              </SheetHeader>

              {selected.drive_refs?.length ? (
                <section className="DAO-company-hitl-sheet-section">
                  <h3 className="DAO-util-section-label">Drive references</h3>
                  <ul className="DAO-company-hitl-refs">
                    {selected.drive_refs.map((ref: string) => (
                      <li key={ref} className="DAO-company-hitl-ref">
                        {ref}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="DAO-company-hitl-sheet-section">
                <h3 className="DAO-util-section-label">Tool trace</h3>
                <ToolTracePanel trace={selected.tool_trace} />
              </section>

              <SheetFooter className="DAO-company-hitl-sheet-actions">
                <Button disabled={busy === selected.id} onClick={() => void resolve(selected, "approved")} size="sm" type="button">
                  <Check size={14} />
                  Approve
                </Button>
                <Button
                  disabled={busy === selected.id}
                  onClick={() => void resolve(selected, "rejected")}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X size={14} />
                  Reject
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </DAOCompanyShell>
  );
}
