import type { DriveObject } from '../api/types'

/** Collapse duplicate slashes; folders end with `/`, root is `/`. */
export function normalizeDrivePath(path: string): string {
  if (!path || path === '/') return '/'
  let normalized = path.startsWith('/') ? path : `/${path}`
  normalized = normalized.replace(/\/{2,}/g, '/')
  if (!normalized.endsWith('/')) normalized += '/'
  return normalized === '//' ? '/' : normalized
}

/** API folder paths are absolute — never prefix the current path again. */
export function resolveFolderTarget(currentPath: string, folder: string): string {
  const trimmed = folder.trim()
  if (trimmed.startsWith('/')) return normalizeDrivePath(trimmed)
  const base = normalizeDrivePath(currentPath)
  return normalizeDrivePath(`${base}${trimmed}`)
}

export function folderLabel(folderPath: string): string {
  const parts = folderPath.replace(/\/$/, '').split('/').filter(Boolean)
  return parts[parts.length - 1] ?? folderPath
}

function immediateChildFolder(parent: string, targetPath: string): string | null {
  const root = normalizeDrivePath(parent)
  let normalized = targetPath.trim()
  if (!normalized.startsWith('/')) {
    normalized = `${root}${normalized}`
  }

  const folderPath =
    normalized.includes('.') && !normalized.endsWith('/')
      ? normalized.slice(0, normalized.lastIndexOf('/') + 1)
      : normalizeDrivePath(normalized)

  if (folderPath === root || !folderPath.startsWith(root)) return null

  const rel =
    root === '/'
      ? folderPath.slice(1)
      : folderPath.slice(root.length).replace(/^\//, '')
  const segment = rel.split('/').filter(Boolean)[0]
  if (!segment) return null
  return root === '/' ? `/${segment}/` : normalizeDrivePath(`${root}${segment}/`)
}

/** Folders one level below ``currentPath``. */
export function listChildFolders(
  folders: string[],
  objects: DriveObject[],
  currentPath: string,
): string[] {
  const seen = new Set<string>()
  for (const folder of folders) {
    const child = immediateChildFolder(currentPath, folder)
    if (child) seen.add(child)
  }
  for (const obj of objects) {
    const child = immediateChildFolder(currentPath, obj.path)
    if (child) seen.add(child)
  }
  return [...seen].sort()
}

/** Files directly in ``currentPath`` (not nested subfolders). */
export function listChildObjects(objects: DriveObject[], currentPath: string): DriveObject[] {
  const root = normalizeDrivePath(currentPath)
  return objects.filter((obj) => {
    const path = obj.path
    if (root === '/') {
      const parts = path.split('/').filter(Boolean)
      return parts.length === 1
    }
    if (!path.startsWith(root.replace(/\/$/, ''))) return false
    const rel = path.slice(root.length)
    return rel.length > 0 && !rel.slice(1).includes('/')
  })
}

/** At root, list every object so research artifacts are visible without drilling in. */
export function visibleDriveObjects(objects: DriveObject[], currentPath: string): DriveObject[] {
  const root = normalizeDrivePath(currentPath)
  if (root === '/') return objects
  return listChildObjects(objects, root)
}
