import { useEffect, useState } from "react";
import { Shield } from "lucide-react";
import { usePageHeader } from "@/contexts/usePageHeader";
import {
  SignalOverlay,
  VoidButton,
  VoidCard,
  VoidPage,
  VoidSectionHeader,
} from "@/components/void";
import {
  DAOFetch,
  getDAOSpaceId,
  spaceApiPath,
} from "@/lib/DAO-api";

type HitlRequest = {
  id: string;
  action_summary: string;
  status: string;
};

export default function InboxPage() {
  const { setEnd } = usePageHeader();
  const spaceId = getDAOSpaceId();
  const [requests, setRequests] = useState<HitlRequest[]>([]);
  const [flash, setFlash] = useState<"green" | "red" | null>(null);

  useEffect(() => {
    setEnd(null);
  }, [setEnd]);

  function reload() {
    if (!spaceId) return;
    DAOFetch<{ requests: HitlRequest[] }>(
      spaceApiPath(spaceId, "/hitl?status=pending"),
    ).then((r) => setRequests(r.requests));
  }

  useEffect(() => {
    reload();
  }, [spaceId]);

  async function resolve(id: string, status: "approved" | "rejected") {
    if (!spaceId) return;
    setFlash(status === "approved" ? "green" : "red");
    await DAOFetch(spaceApiPath(spaceId, `/hitl/${id}/resolve`), {
      method: "POST",
      body: JSON.stringify({ status }),
    });
    reload();
  }

  return (
    <VoidPage className="flex max-w-3xl flex-col gap-8">
      {flash && <SignalOverlay variant={flash} onDone={() => setFlash(null)} />}

      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-full bg-signal-yellow/10">
          <Shield className="size-5 text-signal-yellow" strokeWidth={1.5} />
        </div>
        <VoidSectionHeader label="Inbox" title="Pending approvals" />
      </div>

      <div className="space-y-3">
        {requests.length === 0 && (
          <p className="font-body text-sm text-text-muted">No pending approvals.</p>
        )}
        {requests.map((r, i) => (
          <VoidCard
            key={r.id}
            className="border-l-[3px] border-l-signal-yellow p-4 motion-safe:animate-fade-up motion-reduce:opacity-100 opacity-0"
            style={{ animationDelay: `${i * 30}ms`, animationFillMode: "forwards" }}
          >
            <p className="font-body text-sm text-text-primary">{r.action_summary}</p>
            <div className="mt-4 flex gap-2">
              <VoidButton
                variant="success"
                size="sm"
                onClick={() => void resolve(r.id, "approved")}
              >
                Approve
              </VoidButton>
              <VoidButton
                variant="danger"
                size="sm"
                onClick={() => void resolve(r.id, "rejected")}
              >
                Reject
              </VoidButton>
            </div>
          </VoidCard>
        ))}
      </div>
    </VoidPage>
  );
}
