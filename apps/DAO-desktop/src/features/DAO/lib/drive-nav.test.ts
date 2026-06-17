import { describe, expect, it } from 'vitest'

import {
  listChildFolders,
  normalizeDrivePath,
  resolveFolderTarget,
  visibleDriveObjects,
} from './drive-nav'

describe('drive-nav', () => {
  it('normalizes duplicate slashes', () => {
    expect(normalizeDrivePath('//knowledge/')).toBe('/knowledge/')
    expect(normalizeDrivePath('/')).toBe('/')
  })

  it('resolves absolute API folder paths without double prefix', () => {
    expect(resolveFolderTarget('/', '/knowledge/')).toBe('/knowledge/')
    expect(resolveFolderTarget('/knowledge/', 'indore-slug')).toBe('/knowledge/indore-slug/')
  })

  it('lists immediate child folders at root', () => {
    const folders = listChildFolders(
      ['/knowledge/', '/knowledge//indore-a/', '/wiki/'],
      [{ id: '1', path: '/writeback/2026/06/16/foo.md' }],
      '/',
    )
    expect(folders).toEqual(['/knowledge/', '/wiki/', '/writeback/'])
  })

  it('shows all objects at root for discoverability', () => {
    const objects = [
      { id: '1', path: '/knowledge/a/compiled.md' },
      { id: '2', path: '/wiki/index.md' },
    ]
    expect(visibleDriveObjects(objects, '/')).toHaveLength(2)
    expect(visibleDriveObjects(objects, '/knowledge/')).toHaveLength(0)
  })
})
