import { useRef, useState } from "react";
import { Folder, Upload } from "lucide-react";

import { UtilSideNavItem } from "@/app/util-page-nav";
import { Button } from "@/components/ui/button";
import { Codicon } from "@/components/ui/codicon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

import { ObjectPrimitives } from "../components/objects/ObjectPrimitives";
import { getDriveTree, searchDrive, uploadToDrive, type DriveObject } from "../api/space-api";
import { useSpaceContext } from "../context/SpaceContext";
import { useAsync } from "../hooks/useAsync";
import {
  folderLabel,
  listChildFolders,
  normalizeDrivePath,
  resolveFolderTarget,
  visibleDriveObjects,
} from "../lib/drive-nav";
import {
  CompanyBanner,
  CompanyEmpty,
  CompanyError,
  CompanyLoading,
  DAOCompanyShell,
} from "./_company-shell";

export function DriveScreen() {
  const space = useSpaceContext();
  const [path, setPath] = useState("/");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<DriveObject[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [banner, setBanner] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [selected, setSelected] = useState<DriveObject | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tree = useAsync(() => getDriveTree(space.id, path), [space.id, path]);

  async function runSearch(value: string) {
    const trimmed = value.trim();
    if (!trimmed) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const res = await searchDrive(space.id, trimmed);
      setResults(res.results);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBanner(null);
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const res = await uploadToDrive(space.id, file, path);
        if (res.dedup) {
          setBanner(`"${file.name}" already exists — reused the existing copy.`);
        }
      }
      tree.reload();
    } catch (err) {
      setBanner(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const allObjects = tree.data?.objects ?? [];
  const objects = results ?? visibleDriveObjects(allObjects, path);
  const childFolders = listChildFolders(tree.data?.folders ?? [], allObjects, path);
  const inSearch = results !== null;
  const loading = tree.loading || searching;

  function goUp() {
    const parts = normalizeDrivePath(path).split("/").filter(Boolean);
    parts.pop();
    setPath(parts.length ? normalizeDrivePath(`/${parts.join("/")}`) : "/");
  }

  return (
    <DAOCompanyShell
      description="Upload brand guides and research — agents preflight here before redoing work."
      headerTrailing={
        <Button disabled={uploading} onClick={() => fileRef.current?.click()} size="sm" type="button">
          <Upload size={14} />
          {uploading ? "Uploading…" : "Upload"}
        </Button>
      }
      onSearchChange={(value) => {
        setQuery(value);
        void runSearch(value);
      }}
      searchPlaceholder="Search Drive…"
      searchTrailingAction={
        <Button
          aria-label="Refresh"
          className="text-(--ui-text-tertiary) hover:bg-transparent hover:text-foreground"
          onClick={() => tree.reload()}
          size="icon-xs"
          type="button"
          variant="ghost"
        >
          <Codicon name="refresh" size="0.875rem" spinning={tree.loading} />
        </Button>
      }
      searchValue={query}
      title="Drive"
    >
      <input
        ref={fileRef}
        className="DAO-company-hidden-input"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        type="file"
      />

      <div className="DAO-company-drive-layout DAO-util-page-content--tight h-full min-h-0">
        {!inSearch ? (
          <aside aria-label="Folders" className="DAO-company-drive-sidebar">
            <div className="DAO-company-drive-sidebar-head">
              <p className="DAO-company-drive-sidebar-label">Folders</p>
              <p className="DAO-company-drive-path">{path}</p>
            </div>
            <div className="DAO-company-drive-folders DAO-util-scrollbar">
              {path !== "/" ? (
                <UtilSideNavItem hint="Parent folder" onClick={goUp}>
                  ↑ Up
                </UtilSideNavItem>
              ) : null}
              {childFolders.map((folder) => (
                  <UtilSideNavItem
                    avatar={<Folder size={14} />}
                    hint={folder}
                    key={folder}
                    onClick={() => setPath(resolveFolderTarget(path, folder))}
                  >
                    {folderLabel(folder)}
                  </UtilSideNavItem>
                ))}
            </div>
          </aside>
        ) : null}

        <main className="DAO-company-drive-main">
          <div className="DAO-company-drive-objects DAO-util-scrollbar">
            {banner ? (
              <div className="mb-3">
                <CompanyBanner tone="info">{banner}</CompanyBanner>
              </div>
            ) : null}
            <h2 className="DAO-util-section-label">{inSearch ? "Search results" : "Objects"}</h2>

            {loading ? (
              <CompanyLoading label={inSearch ? "Searching…" : "Loading objects…"} />
            ) : tree.error && !inSearch ? (
              <CompanyError message={tree.error} onRetry={tree.reload} />
            ) : objects.length === 0 ? (
              <CompanyEmpty
                description={
                  inSearch
                    ? "Try a different search, or clear to browse folders."
                    : "Upload docs and research. Everything here feeds preflight and writeback."
                }
                title={inSearch ? "No matches" : "Your company brain starts here"}
              />
            ) : (
              <ul className="DAO-company-feed">
                {objects.map((obj) => (
                  <li key={obj.id}>
                    <button
                      className="DAO-company-drive-row DAO-company-drive-row--button"
                      onClick={() => setSelected(obj)}
                      type="button"
                    >
                      <span className="DAO-company-drive-row-name">{obj.path.split("/").pop() ?? obj.path}</span>
                      {obj.produced_by_dept ? (
                        <span className="DAO-company-pill DAO-company-pill--reused">{obj.produced_by_dept}</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>
      </div>

      <Sheet onOpenChange={(open) => !open && setSelected(null)} open={Boolean(selected)}>
        <SheetContent className="DAO-company-hitl-sheet" showCloseButton side="right">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.path.split("/").pop() ?? selected.path}</SheetTitle>
                <SheetDescription>{selected.path}</SheetDescription>
              </SheetHeader>
              <ObjectPrimitives
                missingLabel="Upload is saved to Drive. Timeline appears once indexed in company memory."
                sourceId={selected.id}
                sourceTable="drive_objects"
                spaceId={space.id}
              />
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </DAOCompanyShell>
  );
}
