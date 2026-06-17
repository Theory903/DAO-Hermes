import { useEffect, useRef, useState } from 'react'
import {
  ChevronRight,
  File as FileIcon,
  FileText,
  Folder,
  Home,
  Image as ImageIcon,
  Search,
  Upload,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { cn } from '@/lib/utils'

import { getDriveTree, searchDrive, uploadToDrive, type DriveObject } from '../../api/space-api'
import { useSpaceContext } from '../../context/SpaceContext'
import { useAsync } from '../../hooks/useAsync'
import {
  folderLabel,
  listChildFolders,
  normalizeDrivePath,
  resolveFolderTarget,
  visibleDriveObjects,
} from '../../lib/drive-nav'
import { CompanyBanner, CompanyEmpty, CompanyError, CompanyLoading } from '../_company-shell'
import { BrainPanelGuide } from './BrainPanelGuide'

function fileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return ImageIcon
  if (['md', 'txt', 'json', 'csv', 'yaml', 'yml'].includes(ext)) return FileText
  return FileIcon
}

function pathSegments(path: string): string[] {
  return path.split('/').filter(Boolean)
}

export function BrainDrivePanel() {
  const space = useSpaceContext()
  const [searchParams] = useSearchParams()
  const initialPath = normalizeDrivePath(searchParams.get('path') ?? '/')
  const [path, setPath] = useState(initialPath)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<DriveObject[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const tree = useAsync(() => getDriveTree(space.id, path), [space.id, path])

  useEffect(() => {
    const next = searchParams.get('path')
    if (next) {
      const normalized = normalizeDrivePath(next)
      if (normalized !== path) setPath(normalized)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  async function runSearch(value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      setResults(null)
      return
    }
    setSearching(true)
    try {
      const res = await searchDrive(space.id, trimmed)
      setResults(res.results)
    } catch {
      setResults([])
    } finally {
      setSearching(false)
    }
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setBanner(null)
    setUploading(true)
    try {
      for (const file of Array.from(files)) {
        const res = await uploadToDrive(space.id, file, path)
        if (res.dedup) {
          setBanner(`"${file.name}" already exists — reused the existing copy.`)
        }
      }
      tree.reload()
    } catch (err) {
      setBanner(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  const allObjects = tree.data?.objects ?? []
  const objects = results ?? visibleDriveObjects(allObjects, path)
  const folders = listChildFolders(tree.data?.folders ?? [], allObjects, path)
  const inSearch = results !== null
  const loading = tree.loading || searching
  const segments = pathSegments(path)

  function goTo(index: number) {
    if (index < 0) {
      setPath('/')
      return
    }
    setPath(`/${segments.slice(0, index + 1).join('/')}`)
  }

  return (
    <div className="DAO-brain-panel-stack">
      <BrainPanelGuide area="drive" />
      <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            className="w-full rounded-md border border-border/60 bg-background/40 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary/40"
            onChange={(e) => {
              setQuery(e.target.value)
              void runSearch(e.target.value)
            }}
            placeholder="Search files…"
            type="search"
            value={query}
          />
        </div>
        <Button disabled={uploading} onClick={() => fileRef.current?.click()} size="sm" type="button">
          <Upload size={14} />
          {uploading ? 'Uploading…' : 'Upload'}
        </Button>
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
      </div>

      <input
        ref={fileRef}
        className="DAO-company-hidden-input"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
        type="file"
      />

      {banner ? <CompanyBanner tone="info">{banner}</CompanyBanner> : null}

      {!inSearch ? (
        <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-sm">
          <button
            className={cn(
              'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground',
              path === '/' && 'text-foreground',
            )}
            onClick={() => goTo(-1)}
            type="button"
          >
            <Home className="size-3.5" strokeWidth={1.6} />
            Drive
          </button>
          {segments.map((seg, i) => (
            <span className="inline-flex items-center gap-1" key={`${seg}-${i}`}>
              <ChevronRight className="size-3.5 text-muted-foreground/50" />
              <button
                className={cn(
                  'rounded px-1.5 py-0.5 text-muted-foreground hover:text-foreground',
                  i === segments.length - 1 && 'text-foreground',
                )}
                onClick={() => goTo(i)}
                type="button"
              >
                {seg}
              </button>
            </span>
          ))}
        </nav>
      ) : null}

      {loading ? (
        <CompanyLoading label={inSearch ? 'Searching…' : 'Loading Drive…'} />
      ) : tree.error && !inSearch ? (
        <CompanyError message={tree.error} onRetry={tree.reload} />
      ) : (
        <div className="space-y-4">
          {!inSearch && folders.length > 0 ? (
            <div>
              <p className="DAO-util-section-label mb-2">Folders</p>
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {folders.map((folder) => (
                    <button
                      className="DAO-company-card flex items-center gap-3 text-left transition-colors hover:border-primary/30"
                      key={folder}
                      onClick={() => setPath(resolveFolderTarget(path, folder))}
                      type="button"
                    >
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Folder className="size-4" strokeWidth={1.6} />
                      </span>
                      <span className="min-w-0 truncate font-medium">{folderLabel(folder)}</span>
                    </button>
                  ))}
              </div>
            </div>
          ) : null}

          <div>
            <p className="DAO-util-section-label mb-2">{inSearch ? 'Search results' : 'Files'}</p>
            {objects.length === 0 ? (
              <CompanyEmpty
                description={
                  inSearch
                    ? 'Try different words, or clear search to browse folders.'
                    : 'Upload research, brand assets, or spreadsheets. Agents also save outputs here after tasks.'
                }
                title={inSearch ? 'No matches' : 'This folder is empty'}
              />
            ) : (
              <ul className="space-y-1.5">
                {objects.map((obj) => {
                  const name = obj.path.split('/').pop() ?? obj.path
                  const Icon = fileIcon(name)
                  return (
                    <li
                      className="flex items-center gap-3 rounded-lg border border-border/50 bg-background/40 px-3 py-2.5 transition-colors hover:border-primary/25"
                      key={obj.id}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/40 text-muted-foreground">
                        <Icon className="size-4" strokeWidth={1.6} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{name}</span>
                        {inSearch ? (
                          <span className="block truncate font-mono text-[11px] text-muted-foreground">{obj.path}</span>
                        ) : null}
                      </span>
                      {obj.produced_by_dept ? (
                        <span className="DAO-company-pill DAO-company-pill--reused shrink-0">{obj.produced_by_dept}</span>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  )
}
