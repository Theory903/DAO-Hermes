import { atom } from 'nanostores'

import { storedString, persistString } from '@/lib/storage'

/**
 * Wake-word ("Hey Jarvis") configuration for the Home voice console.
 *
 * Powered by Picovoice Porcupine (on-device, runs entirely in the renderer via
 * WebAssembly — no audio leaves the machine). Porcupine requires a free
 * AccessKey from the Picovoice Console. Users can pick a built-in keyword
 * (e.g. "Jarvis") or train + upload a custom `.ppn` keyword file.
 */
export interface WakeWordConfig {
  /** Master toggle — when false the listener never starts. */
  enabled: boolean
  /** Picovoice AccessKey (from console.picovoice.ai). Required to run. */
  accessKey: string
  /** Built-in keyword name (e.g. "Jarvis"). Ignored when a custom keyword is set. */
  builtin: string
  /** Human label for a trained custom keyword (e.g. "Hey DAO"). */
  customLabel: string
  /** Base64 of a custom `.ppn` keyword file (no data: prefix). Takes priority. */
  customPpnBase64: string
  /** Detection sensitivity 0..1 — higher catches more (and more false positives). */
  sensitivity: number
}

/** Porcupine's built-in English keywords (mirrors the SDK enum). */
export const BUILTIN_WAKE_WORDS = [
  'Jarvis',
  'Computer',
  'Alexa',
  'Hey Google',
  'Hey Siri',
  'Okay Google',
  'Bumblebee',
  'Picovoice',
  'Porcupine',
  'Terminator',
] as const

const STORAGE_KEY = 'hermes.desktop.wakeWord'

export const DEFAULT_WAKE_WORD_CONFIG: WakeWordConfig = {
  enabled: false,
  accessKey: '',
  builtin: 'Jarvis',
  customLabel: '',
  customPpnBase64: '',
  sensitivity: 0.5,
}

function loadConfig(): WakeWordConfig {
  const raw = storedString(STORAGE_KEY)
  if (!raw) return { ...DEFAULT_WAKE_WORD_CONFIG }
  try {
    const parsed = JSON.parse(raw) as Partial<WakeWordConfig>
    return {
      ...DEFAULT_WAKE_WORD_CONFIG,
      ...parsed,
      // Clamp sensitivity to a valid range regardless of stored value.
      sensitivity: Math.min(1, Math.max(0, Number(parsed.sensitivity ?? DEFAULT_WAKE_WORD_CONFIG.sensitivity))),
    }
  } catch {
    return { ...DEFAULT_WAKE_WORD_CONFIG }
  }
}

export const $wakeWord = atom<WakeWordConfig>(loadConfig())

$wakeWord.subscribe(cfg => persistString(STORAGE_KEY, JSON.stringify(cfg)))

export function setWakeWord(patch: Partial<WakeWordConfig>) {
  $wakeWord.set({ ...$wakeWord.get(), ...patch })
}

/** True when the config has everything Porcupine needs to start listening. */
export function wakeWordReady(cfg: WakeWordConfig): boolean {
  if (!cfg.enabled) return false
  if (!cfg.accessKey.trim()) return false
  return Boolean(cfg.customPpnBase64) || Boolean(cfg.builtin)
}

/** Display label for whichever keyword is active. */
export function wakeWordLabel(cfg: WakeWordConfig): string {
  if (cfg.customPpnBase64 && cfg.customLabel.trim()) return cfg.customLabel.trim()
  if (cfg.customPpnBase64) return 'Custom keyword'
  return cfg.builtin || 'Jarvis'
}
