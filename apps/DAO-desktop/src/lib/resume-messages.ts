import {
  type ChatMessage,
  chatMessageText
} from '@/lib/chat-messages'
import { embeddedImageUrls, textWithoutEmbeddedImages } from '@/lib/embedded-images'

function withAppendedText(message: ChatMessage, suffix: string): ChatMessage {
  let appended = false

  const parts = message.parts.map(part => {
    if (part.type !== 'text' || appended) {
      return part
    }

    appended = true

    return { ...part, text: `${part.text}${suffix}` }
  })

  return appended ? { ...message, parts } : message
}

function preserveReasoningParts(message: ChatMessage, previous: ChatMessage): ChatMessage {
  if (message.parts.some(part => part.type === 'reasoning')) {
    return message
  }

  const reasoningParts = previous.parts.filter(part => part.type === 'reasoning')

  return reasoningParts.length ? { ...message, parts: [...reasoningParts, ...message.parts] } : message
}

function chatMessagesEquivalent(a: ChatMessage, b: ChatMessage): boolean {
  if (
    a.id !== b.id ||
    a.role !== b.role ||
    a.pending !== b.pending ||
    a.error !== b.error ||
    a.hidden !== b.hidden ||
    a.branchGroupId !== b.branchGroupId
  ) {
    return false
  }

  if (a.parts.length !== b.parts.length) {
    return false
  }

  return a.parts.every((part, index) => JSON.stringify(part) === JSON.stringify(b.parts[index]))
}

export function chatMessageArraysEquivalent(a: ChatMessage[], b: ChatMessage[]): boolean {
  return a.length === b.length && a.every((message, index) => chatMessagesEquivalent(message, b[index]))
}

/** Merge server resume rows with local in-flight reasoning / embedded images. */
export function reconcileResumeMessages(nextMessages: ChatMessage[], previousMessages: ChatMessage[]): ChatMessage[] {
  if (!previousMessages.length) {
    return nextMessages
  }

  const previousByRoleOrdinal = new Map<string, ChatMessage>()
  const previousRoleCounts = new Map<string, number>()

  for (const message of previousMessages) {
    const ordinal = previousRoleCounts.get(message.role) ?? 0
    previousRoleCounts.set(message.role, ordinal + 1)
    previousByRoleOrdinal.set(`${message.role}:${ordinal}`, message)
  }

  const nextRoleCounts = new Map<string, number>()

  return nextMessages.map(message => {
    const ordinal = nextRoleCounts.get(message.role) ?? 0
    nextRoleCounts.set(message.role, ordinal + 1)

    const previous = previousByRoleOrdinal.get(`${message.role}:${ordinal}`)

    if (!previous) {
      return message
    }

    const nextText = chatMessageText(message).trim()
    const previousText = chatMessageText(previous)
    const previousVisibleText = textWithoutEmbeddedImages(previousText)
    let preserved = message

    if (nextText === previousVisibleText || nextText === previousText.trim()) {
      preserved = preserveReasoningParts(preserved, previous)
    }

    const previousImages = embeddedImageUrls(previousText)

    if (!previousImages.length || embeddedImageUrls(chatMessageText(preserved)).length) {
      return preserved
    }

    if (nextText !== previousVisibleText) {
      return preserved
    }

    return withAppendedText(preserved, previousImages.map((url: string) => `\n${url}`).join(''))
  })
}
