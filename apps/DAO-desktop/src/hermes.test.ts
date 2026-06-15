import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getCronJobs,
  getMessagingPlatforms,
  getProfiles,
  getSessionMessages,
  getSkills,
  getToolsets,
  listAllProfileSessions,
  listSessions
} from './hermes'

const emptySessionsResponse = {
  limit: 0,
  offset: 0,
  sessions: [],
  total: 0
}

describe('Hermes REST session helpers', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn().mockResolvedValue(emptySessionsResponse)
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { api }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('uses a longer timeout for the single-profile session list', async () => {
    await listSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent',
        timeoutMs: 60_000
      })
    )
  })

  it('uses a longer timeout for the all-profile session list', async () => {
    await listAllProfileSessions(50, 1)

    expect(api).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/api/profiles/sessions?limit=50&offset=0&min_messages=1&archived=exclude&order=recent&profile=all',
        timeoutMs: 60_000
      })
    )
  })

  it('tags cross-profile message reads for Electron routing and backend lookup', async () => {
    api.mockResolvedValue({ messages: [], session_id: 'session-1' })

    await getSessionMessages('session-1', 'xiaoxuxu')

    expect(api).toHaveBeenCalledWith({
      path: '/api/sessions/session-1/messages?profile=xiaoxuxu',
      profile: 'xiaoxuxu'
    })
  })

  it('normalizes missing sessions in listSessions', async () => {
    api.mockResolvedValue({ limit: 40, offset: 0, total: 0 })

    await expect(listSessions()).resolves.toEqual({
      limit: 40,
      offset: 0,
      total: 0,
      sessions: []
    })
  })

  it('normalizes missing sessions in listAllProfileSessions', async () => {
    api.mockResolvedValue({ limit: 40, offset: 0, total: 0 })

    await expect(listAllProfileSessions()).resolves.toEqual({
      limit: 40,
      offset: 0,
      total: 0,
      sessions: []
    })
  })
})

describe('Hermes REST normalization helpers', () => {
  let api: ReturnType<typeof vi.fn>

  beforeEach(() => {
    api = vi.fn()
    Object.defineProperty(window, 'hermesDesktop', {
      configurable: true,
      value: { api }
    })
  })

  afterEach(() => {
    vi.restoreAllMocks()
    Reflect.deleteProperty(window, 'hermesDesktop')
  })

  it('normalizes getProfiles when profiles field is missing', async () => {
    api.mockResolvedValue({})

    await expect(getProfiles()).resolves.toEqual({ profiles: [] })
  })

  it('normalizes getProfiles when API returns a bare array', async () => {
    const profiles = [{ name: 'default', is_default: true, path: '/tmp' }]
    api.mockResolvedValue(profiles)

    await expect(getProfiles()).resolves.toEqual({ profiles })
  })

  it('normalizes getCronJobs to an empty array when response is not an array', async () => {
    api.mockResolvedValue(null)

    await expect(getCronJobs()).resolves.toEqual([])
  })

  it('normalizes getMessagingPlatforms when platforms is missing', async () => {
    api.mockResolvedValue({})

    await expect(getMessagingPlatforms()).resolves.toEqual({ platforms: [] })
  })

  it('normalizes getSkills to an empty array when response is not an array', async () => {
    api.mockResolvedValue(undefined)

    await expect(getSkills()).resolves.toEqual([])
  })

  it('normalizes getToolsets to an empty array when response is not an array', async () => {
    api.mockResolvedValue(undefined)

    await expect(getToolsets()).resolves.toEqual([])
  })
})
