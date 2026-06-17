import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Activity,
  Inbox,
  MessageSquare,
  Shield,
  Sparkles,
  Upload,
} from "lucide-react";
import { usePageHeader } from "@/contexts/usePageHeader";
import {
  VoidBadge,
  VoidBentoGrid,
  VoidButton,
  VoidFeatureCard,
  VoidGlass,
  VoidHero,
  VoidPage,
  VoidSectionHeader,
  VoidStatRow,
  SignalOverlay,
} from "@/components/void";
import {
  DAOFetch,
  getDAOSpaceId,
  spaceApiPath,
} from "@/lib/DAO-api";
import { DAOHermes } from "@/lib/DAO-embed";

type Snapshot = {
  ai_lead: string;
  pending_hitl: number;
  departments: Record<string, string>;
};

type WorkBundle = {
  floor: Snapshot;
};

export default function HomePage() {
  const { setEnd } = usePageHeader();
  const spaceId = getDAOSpaceId();
  const [briefing, setBriefing] = useState("");
  const [loading, setLoading] = useState(true);
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [fileCount, setFileCount] = useState(0);
  const [flash, setFlash] = useState<"primary" | null>(null);

  useEffect(() => {
    setEnd(null);
  }, [setEnd]);

  useEffect(() => {
    if (!spaceId) return;
    setLoading(true);
    Promise.all([
      DAOFetch<{ markdown: string }>(
        spaceApiPath(spaceId, "/jarvis/briefing/latest"),
      ),
      DAOFetch<WorkBundle>(spaceApiPath(spaceId, "/work/bundle")),
      DAOFetch<{ objects: unknown[] }>(spaceApiPath(spaceId, "/drive/tree")),
    ])
      .then(([b, bundle, tree]) => {
        setBriefing(b.markdown);
        setSnap(bundle.floor);
        setFileCount(tree.objects?.length ?? 0);
      })
      .finally(() => setLoading(false));
  }, [spaceId]);

  async function refreshBriefing() {
    if (!spaceId) return;
    await DAOFetch(spaceApiPath(spaceId, "/jarvis/briefing/trigger"), {
      method: "POST",
    });
    const b = await DAOFetch<{ markdown: string }>(
      spaceApiPath(spaceId, "/jarvis/briefing/latest"),
    );
    setBriefing(b.markdown);
  }

  async function markBriefingRead() {
    setFlash("primary");
    await refreshBriefing();
  }

  const slug = DAOHermes()?.spaceSlug;
  const activeDepts = useMemo(
    () =>
      snap
        ? Object.values(snap.departments).filter((d) => d && d !== "idle").length
        : 0,
    [snap],
  );

  const heroLines = useMemo(() => {
    const lead = snap?.ai_lead ?? "Jarvis";
    if (loading) return ["Good morning.", `${lead} is waking up.`];
    if (activeDepts > 0) {
      return ["Good morning.", `${lead} ran ${activeDepts} lanes overnight.`];
    }
    return ["Good morning.", "Your company is running."];
  }, [loading, snap?.ai_lead, activeDepts]);

  return (
    <VoidPage glow className="flex flex-col gap-10">
      {flash && <SignalOverlay variant={flash} onDone={() => setFlash(null)} />}

      <VoidHero
        lines={heroLines}
        subtitle={slug ? `Space · ${slug}` : "DAO OS"}
        actions={
          <>
            <VoidButton size="sm" onClick={() => void markBriefingRead()}>
              Mark briefing read
            </VoidButton>
            <Link to="/command">
              <VoidButton variant="ghost" size="sm">
                Command Center
              </VoidButton>
            </Link>
          </>
        }
      />

      <VoidStatRow
        stats={[
          { value: activeDepts || "—", label: "active lanes" },
          { value: fileCount || "—", label: "drive files" },
          { value: snap?.pending_hitl ?? "—", label: "pending" },
        ]}
      />

      <div className="flex flex-wrap gap-2">
        <VoidBadge variant="success">Enclave active</VoidBadge>
        <VoidBadge variant="primary">{snap?.ai_lead ?? "AI Lead"} ready</VoidBadge>
      </div>

      <section className="space-y-4">
        <VoidSectionHeader label="Quick actions" title="Jump back in" />
        <VoidBentoGrid>
          <VoidFeatureCard
            icon={MessageSquare}
            title="Chat"
            description="Talk to your AI Lead in a focused thread."
            to="/chat"
            staggerIndex={0}
          />
          <VoidFeatureCard
            icon={Activity}
            title="Command"
            description="Live company floor — departments, handoffs, events."
            to="/command"
            staggerIndex={1}
          />
          <VoidFeatureCard
            icon={Upload}
            title="Drive"
            description="Upload, search, and browse space files."
            to="/drive"
            staggerIndex={2}
          />
          <VoidFeatureCard
            icon={Inbox}
            title="Inbox"
            description="Approve or reject human-in-the-loop requests."
            to="/inbox"
            footer={
              snap && snap.pending_hitl > 0 ? (
                <VoidBadge variant="warning">{snap.pending_hitl} pending</VoidBadge>
              ) : undefined
            }
            staggerIndex={3}
          />
        </VoidBentoGrid>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <VoidSectionHeader label="Briefing" title="Overnight summary" />
          <VoidButton variant="ghost" size="sm" onClick={() => void refreshBriefing()}>
            Refresh
          </VoidButton>
        </div>
        <VoidGlass className="rounded-[var(--radius-void-card)] p-6">
          <div className="mb-3 flex items-center gap-2 text-primary">
            <Sparkles className="size-4" strokeWidth={1.5} />
            <span className="font-display text-sm font-medium">Jarvis briefing</span>
          </div>
          {loading ? (
            <div className="space-y-2">
              <div className="void-skeleton h-4 w-full rounded-md" />
              <div className="void-skeleton h-4 w-5/6 rounded-md" />
              <div className="void-skeleton h-4 w-4/6 rounded-md" />
            </div>
          ) : (
            <pre className="whitespace-pre-wrap font-body text-sm leading-relaxed text-text-secondary">
              {briefing || "No briefing yet. Hit Refresh to generate one."}
            </pre>
          )}
        </VoidGlass>
      </section>

      <section className="space-y-3">
        <VoidSectionHeader label="Security" title="Enclave trust" />
        <VoidGlass className="flex items-start gap-4 rounded-[var(--radius-void-card)] p-5">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Shield className="size-5 text-primary" strokeWidth={1.5} />
          </div>
          <div>
            <p className="font-display text-sm font-medium text-text-primary">
              Space secrets stay in the enclave
            </p>
            <p className="mt-1 font-body text-sm text-text-secondary">
              Credentials and sensitive config are isolated per space. Review pending
              actions in Inbox before they execute.
            </p>
          </div>
        </VoidGlass>
      </section>
    </VoidPage>
  );
}
