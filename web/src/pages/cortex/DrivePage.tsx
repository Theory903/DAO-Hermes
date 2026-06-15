import { useEffect, useRef, useState } from "react";
import { FolderOpen, FolderTree, Search, Upload } from "lucide-react";
import { usePageHeader } from "@/contexts/usePageHeader";
import {
  VoidBentoGrid,
  VoidButton,
  VoidCard,
  VoidFeatureCard,
  VoidGlass,
  VoidInput,
  VoidPage,
  VoidSectionHeader,
} from "@/components/void";
import {
  DAOFetch,
  DAOUpload,
  getDAOSpaceId,
  spaceApiPath,
} from "@/lib/DAO-api";

type Tree = {
  folders: string[];
  objects: Array<{
    id: string;
    path: string;
    mime: string;
    size: number;
    produced_by_dept: string | null;
  }>;
};

const SUGGESTED_FOLDERS = [
  { icon: FolderTree, title: "Brand", description: "Logos, guidelines, templates." },
  { icon: Search, title: "Research", description: "Notes, competitive intel, briefs." },
  { icon: FolderOpen, title: "Engineering", description: "Specs, runbooks, exports." },
];

export default function DrivePage() {
  const { setEnd } = usePageHeader();
  const spaceId = getDAOSpaceId();
  const [tree, setTree] = useState<Tree | null>(null);
  const [query, setQuery] = useState("");
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEnd(null);
  }, [setEnd]);

  function reload() {
    if (!spaceId) return;
    setLoading(true);
    DAOFetch<Tree>(spaceApiPath(spaceId, "/drive/tree"))
      .then(setTree)
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    reload();
  }, [spaceId]);

  async function onUpload(file: File) {
    if (!spaceId) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      await DAOUpload(spaceId, "/drive/upload", form);
      reload();
    } finally {
      setUploading(false);
    }
  }

  async function search() {
    if (!spaceId || !query) return;
    const res = await DAOFetch<{ results: Tree["objects"] }>(
      spaceApiPath(spaceId, `/drive/search?q=${encodeURIComponent(query)}`),
    );
    setTree((t) =>
      t
        ? { ...t, objects: res.results }
        : { folders: [], objects: res.results },
    );
  }

  const objects = tree?.objects ?? [];
  const isEmpty = !loading && objects.length === 0;

  return (
    <VoidPage className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <VoidGlass className="h-fit rounded-[var(--radius-void-card)] p-4">
        <div className="mb-3 flex items-center gap-2">
          <FolderOpen className="size-4 text-primary" strokeWidth={1.5} />
          <span className="font-display text-sm font-medium">Folders</span>
        </div>
        <ul className="space-y-1 font-body text-sm text-text-secondary">
          {(tree?.folders ?? ["/"]).map((f) => (
            <li key={f} className="rounded-md px-2 py-1 hover:bg-void-elevated">
              {f}
            </li>
          ))}
        </ul>
      </VoidGlass>

      <div className="flex min-w-0 flex-col gap-6">
        <VoidSectionHeader label="Drive" title="Space files" />

        <div className="flex flex-wrap items-center gap-3">
          <VoidInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Drive…"
            className="max-w-md flex-1"
          />
          <VoidButton variant="secondary" size="sm" onClick={() => void search()}>
            Search
          </VoidButton>
          <VoidButton
            variant="primary"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? "Uploading…" : "Upload"}
          </VoidButton>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onUpload(f);
            }}
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            const f = e.dataTransfer.files?.[0];
            if (f) void onUpload(f);
          }}
          className={`rounded-[var(--radius-void-card)] border border-dashed p-8 text-center transition-all duration-150 ${
            dragOver
              ? "border-primary ring-2 ring-primary/30 bg-primary/5"
              : "border-void-border-strong"
          }`}
        >
          <Upload className="mx-auto size-6 text-text-muted" strokeWidth={1.5} />
          <p className="mt-2 font-body text-sm text-text-secondary">
            Drop a file here or use Upload
          </p>
        </div>

        {isEmpty ? (
          <div className="space-y-4">
            <p className="font-body text-sm text-text-muted">No files yet — start here:</p>
            <VoidBentoGrid className="sm:grid-cols-3">
              {SUGGESTED_FOLDERS.map((f, i) => (
                <VoidFeatureCard
                  key={f.title}
                  icon={f.icon}
                  title={f.title}
                  description={f.description}
                  staggerIndex={i}
                />
              ))}
            </VoidBentoGrid>
          </div>
        ) : (
          <VoidCard elevated className="overflow-hidden p-0">
            {loading ? (
              <div className="space-y-2 p-6">
                <div className="void-skeleton h-4 w-full rounded-md" />
                <div className="void-skeleton h-4 w-4/5 rounded-md" />
              </div>
            ) : (
              <table className="w-full text-left font-body text-sm">
                <thead className="border-b border-void-border text-text-muted">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Dept</th>
                    <th className="px-4 py-3 font-medium">Size</th>
                  </tr>
                </thead>
                <tbody>
                  {objects.map((o) => (
                    <tr
                      key={o.id}
                      className="border-t border-void-border transition-colors hover:bg-void-elevated/50"
                    >
                      <td className="px-4 py-3 text-text-primary">{o.path}</td>
                      <td className="px-4 py-3 text-text-secondary">
                        {o.produced_by_dept ?? "—"}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-text-muted">
                        {o.size}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </VoidCard>
        )}
      </div>
    </VoidPage>
  );
}
