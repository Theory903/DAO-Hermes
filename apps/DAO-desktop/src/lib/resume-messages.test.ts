import { describe, expect, it } from 'vitest'

import { reasoningPart, type ChatMessage } from '@/lib/chat-messages'
import { reconcileResumeMessages } from '@/lib/resume-messages'

describe('reconcileResumeMessages', () => {
  it('preserves in-flight reasoning when server resume omits it', () => {
    const previous: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      {
        id: 'a1',
        role: 'assistant',
        parts: [reasoningPart('Thinking step by step...'), { type: 'text', text: 'Hello' }],
        pending: true
      }
    ]

    const fromServer: ChatMessage[] = [
      { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'Hi' }] },
      { id: 'a1', role: 'assistant', parts: [{ type: 'text', text: 'Hello' }] }
    ]

    const merged = reconcileResumeMessages(fromServer, previous)

    expect(merged[1]?.parts.some(part => part.type === 'reasoning')).toBe(true)
    expect(merged[1]?.parts.find(part => part.type === 'reasoning')).toMatchObject({
      type: 'reasoning',
      text: 'Thinking step by step...'
    })
  })
})
