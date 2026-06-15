import { useEffect, useState } from 'react'

/** Even-width mono glyphs so cycling characters don't jump layout. */
export const SCRAMBLE_CHARS = '/\\|-_=+<>~:*'
export const SCRAMBLE_TICK_MS = 45

export function scrambledTail(resolvedCount: number, tail: string): string {
  return Array.from(tail, (ch, i) =>
    i < resolvedCount ? ch : SCRAMBLE_CHARS[(Math.random() * SCRAMBLE_CHARS.length) | 0]
  ).join('')
}

/** Decode-loop for a fixed tail while `active` (CONNECTING, LOADING, etc.). */
export function useScrambleTail(tail: string, active: boolean): string {
  const [display, setDisplay] = useState(tail)

  useEffect(() => {
    if (!active) {
      setDisplay(tail)
      return
    }

    let resolved = 0
    let hold = 0

    const id = window.setInterval(() => {
      if (resolved >= tail.length) {
        hold += 1

        if (hold > 16) {
          resolved = 0
          hold = 0
        }

        setDisplay(tail)
        return
      }

      resolved += 0.5
      setDisplay(scrambledTail(Math.floor(resolved), tail))
    }, SCRAMBLE_TICK_MS)

    return () => window.clearInterval(id)
  }, [active, tail])

  return display
}
