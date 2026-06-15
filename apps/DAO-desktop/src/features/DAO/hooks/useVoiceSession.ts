import { useCallback, useEffect, useRef, useState } from 'react'

import { useStore } from '@nanostores/react'

import { useMicRecorder } from '@/app/chat/composer/hooks/use-mic-recorder'
import { transcribeAudio } from '@/hermes'
import { useI18n } from '@/i18n'
import { connectDAOGateway, DAOGatewaySession, type GatewayEvent } from '@/lib/gateway-client'
import { VOICE_SESSION_SOURCE_ID, markVoiceSessionLineage } from '@/lib/session-source'
import { sanitizeTextForSpeech } from '@/lib/speech-text'
import { playSpeechText, stopVoicePlayback } from '@/lib/voice-playback'
import { notifyError } from '@/store/notifications'
import { $voicePlayback } from '@/store/voice-playback'

/**
 * Home-screen "Jarvis" voice session.
 *
 * A real, hands-free conversation loop driven by the agent gateway:
 *   listen (mic + VAD) → transcribe → prompt.submit → stream reply → speak → repeat.
 *
 * It opens its OWN gateway connection (never the shared primary one the native
 * chat uses) so a quick voice command from Home can never disrupt an open chat
 * session. The agent still runs tools, so this genuinely executes tasks.
 */
export type VoiceState = 'idle' | 'listening' | 'transcribing' | 'thinking' | 'speaking'

export interface DAOVoiceSession {
  state: VoiceState
  /** Latest user transcript for the active turn. */
  transcript: string
  /** Streaming assistant reply for the active turn (full text). */
  reply: string
  /** Current spoken line, revealed sentence-by-sentence in sync with TTS (CC/subtitle). */
  caption: string
  status: string | null
  error: string | null
  /** Live mic amplitude 0..1 (for the orb while listening). */
  micLevel: number
  /** Live TTS audio element (for the orb while speaking). */
  audioElement: HTMLAudioElement | null
  active: boolean
  /** Start / stop the hands-free conversation. */
  toggle: () => void
  stop: () => void
  /** Speak a short greeting once per session (does not start a turn). */
  greet: (text: string) => void
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.addEventListener('load', () => {
      if (typeof reader.result === 'string') resolve(reader.result)
      else reject(new Error('Could not read recorded audio.'))
    })
    reader.addEventListener('error', () => reject(reader.error ?? new Error('Could not read recorded audio.')))
    reader.readAsDataURL(blob)
  })
}

/**
 * Pull the next speakable sentence/clause out of a streaming reply so TTS can
 * speak — and captions can reveal — one line at a time, like subtitles.
 *
 * Returns `[chunk, nextConsumed]`. `chunk` is null when there isn't a stable
 * boundary yet and the stream is still flowing (wait for more text). When
 * `done` is true the remaining buffer is flushed as a final chunk.
 */
function nextSpeechChunk(full: string, consumed: number, done: boolean): [string | null, number] {
  if (consumed >= full.length) return [null, consumed]
  const rest = full.slice(consumed)
  const leadWs = rest.length - rest.replace(/^\s+/, '').length
  const buffer = rest.slice(leadWs)
  if (!buffer) return [null, done ? full.length : consumed]

  const sentence = buffer.match(/^[\s\S]*?[.!?。！？…](?=\s|$)/)
  if (sentence) {
    const seg = sentence[0]
    if (seg.trim().length >= 8 || done) {
      let used = consumed + leadWs + seg.length
      while (used < full.length && /\s/.test(full[used] ?? '')) used += 1
      return [seg.trim(), used]
    }
  }

  // Long run-on without punctuation: break at a soft clause boundary so the
  // caption keeps moving instead of stalling on a wall of text.
  if (!done && buffer.length > 220) {
    const slice = buffer.slice(0, 200)
    const soft = Math.max(slice.lastIndexOf(', '), slice.lastIndexOf('; '), slice.lastIndexOf(' — '))
    if (soft > 60) {
      return [buffer.slice(0, soft + 1).trim(), consumed + leadWs + soft + 1]
    }
  }

  if (done) return [buffer.trim(), full.length]
  return [null, consumed]
}

export function useVoiceSession({ spaceId, leadName }: { spaceId: string; leadName: string }): DAOVoiceSession {
  const { t } = useI18n()
  const voiceCopy = t.notifications.voice
  const { handle, level } = useMicRecorder(voiceCopy)
  const playback = useStore($voicePlayback)

  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [reply, setReply] = useState('')
  const [caption, setCaption] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [active, setActive] = useState(false)

  const sessionRef = useRef<DAOGatewaySession | null>(null)
  const offRef = useRef<(() => void) | null>(null)
  const activeRef = useRef(false)
  const turnClosingRef = useRef(false)
  const replyRef = useRef('')
  const greetedRef = useRef(false)
  const stateRef = useRef<VoiceState>('idle')
  const startListeningRef = useRef<() => Promise<void>>(async () => {})
  // Streaming-speech cursor: how much of replyRef has been queued for TTS,
  // whether the model is done streaming, and a re-entrancy guard for the pump.
  const consumedRef = useRef(0)
  const streamDoneRef = useRef(false)
  const pumpingRef = useRef(false)

  const setPhase = useCallback((next: VoiceState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const setConversationActive = useCallback((next: boolean) => {
    activeRef.current = next
    setActive(next)
  }, [])

  // Speak the reply one sentence at a time as it streams in, revealing each
  // line as a caption right before it is voiced (CC/subtitle behaviour).
  const pumpSpeech = useCallback(async () => {
    if (pumpingRef.current) return
    pumpingRef.current = true
    try {
      for (;;) {
        const [chunk, nextIdx] = nextSpeechChunk(replyRef.current, consumedRef.current, streamDoneRef.current)
        if (chunk == null) break
        consumedRef.current = nextIdx
        const display = chunk.trim()
        if (display) {
          setCaption(display)
          setPhase('speaking')
        }
        const speakable = sanitizeTextForSpeech(chunk)
        if (speakable) {
          try {
            await playSpeechText(speakable, { source: 'voice-conversation' })
          } catch (err) {
            notifyError(err, voiceCopy.playbackFailed)
          }
        }
      }
    } finally {
      pumpingRef.current = false
      const finished = streamDoneRef.current && consumedRef.current >= replyRef.current.length
      if (finished) {
        if (activeRef.current) void startListeningRef.current()
        else setPhase('idle')
      }
    }
  }, [setPhase, voiceCopy.playbackFailed])

  const pumpSpeechRef = useRef(pumpSpeech)
  pumpSpeechRef.current = pumpSpeech

  const handleEvent = useCallback(
    (ev: GatewayEvent) => {
      const payload = (ev.payload ?? {}) as {
        text?: string
        rendered?: string
        name?: string
        message?: string
      }
      switch (ev.type) {
        case 'message.start':
          replyRef.current = ''
          consumedRef.current = 0
          streamDoneRef.current = false
          setReply('')
          setCaption('')
          setPhase('thinking')
          setStatus(`${leadName} is working…`)
          break
        case 'message.delta':
          if (payload.text) {
            replyRef.current += payload.text
            setReply(replyRef.current)
            // Speak + caption each completed sentence as soon as it lands.
            void pumpSpeechRef.current()
          }
          break
        case 'reasoning.delta':
        case 'reasoning.available':
          if (stateRef.current !== 'speaking') setStatus(`${leadName} is thinking…`)
          break
        case 'tool.start':
        case 'tool.generating':
        case 'tool.progress':
          if (payload.name && stateRef.current !== 'speaking') setStatus(`Running ${payload.name}…`)
          break
        case 'message.complete': {
          const final = payload.text || payload.rendered || replyRef.current
          replyRef.current = final
          streamDoneRef.current = true
          setReply(final)
          setStatus(null)
          // Flush any remaining unsung text; resumes listening when drained.
          void pumpSpeechRef.current()
          break
        }
        case 'error':
          setError(payload.message ?? 'Something went wrong.')
          setConversationActive(false)
          setPhase('idle')
          break
        default:
          break
      }
    },
    [leadName, setConversationActive, setPhase],
  )

  const handleEventRef = useRef(handleEvent)
  handleEventRef.current = handleEvent

  const ensureGateway = useCallback(async (): Promise<DAOGatewaySession> => {
    if (sessionRef.current) return sessionRef.current
    const gateway = await connectDAOGateway(spaceId)
    const session = new DAOGatewaySession(gateway)
    offRef.current = session.onEvent((ev) => handleEventRef.current(ev))
    sessionRef.current = session
    return session
  }, [spaceId])

  const submit = useCallback(
    async (text: string) => {
      const trimmed = text.trim()
      if (!trimmed) return
      setError(null)
      replyRef.current = ''
      consumedRef.current = 0
      streamDoneRef.current = false
      setReply('')
      setCaption('')
      setPhase('thinking')
      setStatus('Connecting…')
      try {
        const session = await ensureGateway()
        setStatus(`${leadName} is working…`)
        // Persist Home voice turns as their own "Voice" sessions in chat history
        // (source bucket) and keep them alive past this connection so they show
        // up in the sidebar. Options only take effect on session creation.
        await session.submitPrompt(trimmed, {
          source: VOICE_SESSION_SOURCE_ID,
          title: trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed,
          closeOnDisconnect: false,
        })
        const storedId = session.storedId
        if (storedId) {
          markVoiceSessionLineage({ id: storedId, _lineage_root_id: storedId })
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Could not reach the agent gateway.')
        setConversationActive(false)
        setPhase('idle')
      }
    },
    [ensureGateway, leadName, setConversationActive, setPhase],
  )

  const handleTurn = useCallback(
    async (force = false) => {
      if (turnClosingRef.current) return
      turnClosingRef.current = true
      setPhase('transcribing')
      try {
        const result = await handle.stop()
        if (!result || (!result.heardSpeech && !force)) {
          if (activeRef.current) void startListeningRef.current()
          else setPhase('idle')
          return
        }
        try {
          const dataUrl = await blobToDataUrl(result.audio)
          const res = await transcribeAudio(dataUrl, result.audio.type)
          const text = (res.transcript ?? '').trim()
          if (!text) {
            if (activeRef.current) void startListeningRef.current()
            else setPhase('idle')
            return
          }
          setTranscript(text)
          await submit(text)
        } catch (err) {
          notifyError(err, voiceCopy.transcriptionFailed)
          if (activeRef.current) void startListeningRef.current()
          else setPhase('idle')
        }
      } finally {
        turnClosingRef.current = false
      }
    },
    [handle, setPhase, submit, voiceCopy.transcriptionFailed],
  )

  const startListening = useCallback(async () => {
    if (!activeRef.current) return
    if (stateRef.current === 'listening') return
    setTranscript('')
    try {
      // VAD tuning mirrors the native chat voice loop.
      await handle.start({
        silenceLevel: 0.075,
        silenceMs: 1_250,
        idleSilenceMs: 12_000,
        onError: (err) => {
          notifyError(err, voiceCopy.microphoneFailed)
          setConversationActive(false)
          setPhase('idle')
        },
        onSilence: () => void handleTurn(),
      })
      setPhase('listening')
      setStatus('Listening…')
    } catch (err) {
      notifyError(err, voiceCopy.couldNotStartSession)
      setConversationActive(false)
      setPhase('idle')
    }
  }, [handle, handleTurn, setConversationActive, setPhase, voiceCopy.couldNotStartSession, voiceCopy.microphoneFailed])

  startListeningRef.current = startListening

  const stop = useCallback(() => {
    setConversationActive(false)
    turnClosingRef.current = false
    streamDoneRef.current = false
    consumedRef.current = 0
    handle.cancel()
    stopVoicePlayback()
    setStatus(null)
    setTranscript('')
    setCaption('')
    setPhase('idle')
  }, [handle, setConversationActive, setPhase])

  const toggle = useCallback(() => {
    if (activeRef.current || stateRef.current !== 'idle') {
      stop()
      return
    }
    setError(null)
    setConversationActive(true)
    void startListening()
  }, [setConversationActive, startListening, stop])

  const greet = useCallback(
    (text: string) => {
      if (greetedRef.current) return
      const speakable = sanitizeTextForSpeech(text)
      if (!speakable) return
      greetedRef.current = true
      // Speak ONLY the short greeting — never the on-screen briefing — and do
      // not open a turn. The user taps the orb to actually start talking.
      setPhase('speaking')
      void playSpeechText(speakable, { source: 'read-aloud' })
        .catch(() => undefined)
        .finally(() => {
          if (!activeRef.current) setPhase('idle')
        })
    },
    [setPhase],
  )

  useEffect(() => {
    return () => {
      activeRef.current = false
      handle.cancel()
      stopVoicePlayback()
      offRef.current?.()
      offRef.current = null
      sessionRef.current?.close()
      sessionRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return {
    state,
    transcript,
    reply,
    caption,
    status,
    error,
    micLevel: level,
    audioElement: playback.audioElement,
    active: active || state !== 'idle',
    toggle,
    stop,
    greet,
  }
}
