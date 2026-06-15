import type { ClientSessionState } from '../types'

/** Per-runtime session cache — survives DesktopController unmount (company routes). */
export const sessionStateByRuntimeId = new Map<string, ClientSessionState>()

/** Stored session id → live gateway runtime id. */
export const runtimeIdByStoredSessionId = new Map<string, string>()
