import { useEffect, useRef, useState } from 'react'

import { useStore } from '@nanostores/react'
import {
  BuiltInKeyword,
  type PorcupineKeyword,
  PorcupineWorker,
} from '@picovoice/porcupine-web'
import { WebVoiceProcessor } from '@picovoice/web-voice-processor'

import { $wakeWord, wakeWordReady } from '@/store/wake-word'

export type WakeWordStatus = 'off' | 'loading' | 'listening' | 'error'

export interface WakeWordListener {
  status: WakeWordStatus
  error: string | null
  /** Active keyword label once listening, else null. */
  keyword: string | null
}

const MODEL_PUBLIC_PATH = 'porcupine/porcupine_params.pv'

function resolveKeyword(): PorcupineKeyword | null {
  const cfg = $wakeWord.get()
  const sensitivity = Math.min(1, Math.max(0, cfg.sensitivity))

  if (cfg.customPpnBase64) {
    return {
      base64: cfg.customPpnBase64,
      label: cfg.customLabel.trim() || 'Custom keyword',
      sensitivity,
    }
  }

  // Map our stored display name onto the SDK enum. Fall back to Jarvis.
  const match = Object.values(BuiltInKeyword).find(v => v === cfg.builtin)
  return { builtin: (match ?? BuiltInKeyword.Jarvis) as BuiltInKeyword, sensitivity }
}

/**
 * Always-on wake-word listener for the Home voice console.
 *
 * Runs Picovoice Porcupine fully on-device (WebAssembly in the renderer); the
 * microphone audio never leaves the machine. When the configured keyword
 * ("Jarvis" by default) is heard, `onDetected` fires — the Home screen uses
 * that to start a hands-free voice turn.
 *
 * Pass `paused` while the voice session already owns the mic so the wake-word
 * engine releases the device and can't self-trigger on the assistant's reply.
 */
export function useWakeWord(onDetected: () => void, paused: boolean): WakeWordListener {
  const cfg = useStore($wakeWord)
  const [status, setStatus] = useState<WakeWordStatus>('off')
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState<string | null>(null)

  const onDetectedRef = useRef(onDetected)
  onDetectedRef.current = onDetected

  // Re-create the engine whenever the meaningful config changes. Stringify only
  // the fields that affect the worker so editing an unrelated field is cheap.
  const ready = wakeWordReady(cfg) && !paused
  const signature = ready
    ? JSON.stringify({
        k: cfg.accessKey,
        b: cfg.builtin,
        c: cfg.customPpnBase64.slice(0, 32) + cfg.customPpnBase64.length,
        s: cfg.sensitivity,
      })
    : 'off'

  useEffect(() => {
    if (!ready) {
      setStatus('off')
      setKeyword(null)
      return
    }

    let cancelled = false
    let worker: PorcupineWorker | null = null
    setStatus('loading')
    setError(null)

    const keywordSpec = resolveKeyword()
    if (!keywordSpec) {
      setStatus('error')
      setError('No wake word selected.')
      return
    }

    void (async () => {
      try {
        worker = await PorcupineWorker.create(
          $wakeWord.get().accessKey.trim(),
          keywordSpec,
          () => {
            if (!cancelled) onDetectedRef.current?.()
          },
          { publicPath: MODEL_PUBLIC_PATH },
        )
        if (cancelled) {
          await worker.release().catch(() => undefined)
          worker.terminate()
          worker = null
          return
        }
        await WebVoiceProcessor.subscribe(worker)
        setKeyword('label' in keywordSpec ? keywordSpec.label : String(keywordSpec.builtin))
        setStatus('listening')
      } catch (err) {
        if (cancelled) return
        setStatus('error')
        setError(err instanceof Error ? err.message : 'Wake word engine failed to start.')
      }
    })()

    return () => {
      cancelled = true
      const w = worker
      worker = null
      if (w) {
        void WebVoiceProcessor.unsubscribe(w)
          .catch(() => undefined)
          .finally(() => {
            void w.release().catch(() => undefined)
            w.terminate()
          })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, ready])

  return { status, error, keyword }
}
