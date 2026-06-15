import { cn } from '@/lib/utils'

type ScrambleStatusTextProps = {
  prefix: string
  tail: string
  leaving?: boolean
  className?: string
}

/** Mono decode text + blinking cursor (gateway connect, boot, etc.). */
export function ScrambleStatusText({ prefix, tail, leaving = false, className }: ScrambleStatusTextProps) {
  return (
    <>
      <style>{'@keyframes scramble-cursor { 0%, 49% { opacity: 1 } 50%, 100% { opacity: 0 } }'}</style>
      <span
        className={cn(
          'DAO-scramble-status inline-flex items-center pl-[0.4em] font-mono text-[0.64rem] font-semibold uppercase tracking-[0.4em] tabular-nums text-(--theme-primary,var(--primary)) transition duration-300 ease-out',
          leaving ? 'translate-y-2 opacity-0 saturate-0' : 'translate-y-0 opacity-100 saturate-100',
          className
        )}
        aria-hidden="true"
      >
        {prefix}
        {tail}
        <span
          className="DAO-scramble-cursor dither ml-0.5 inline-block size-2 shrink-0 -translate-y-px rounded-[1px]"
          style={{ animation: 'scramble-cursor 1s step-end infinite' }}
        />
      </span>
    </>
  )
}
