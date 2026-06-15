import { ScrambleStatusText } from '@/components/scramble-status-text'
import { useScrambleTail } from '@/lib/scramble-text'

const BOOT_PREFIX = 'LOAD'
const BOOT_TAIL = 'ING'

type DAOBootScreenProps = {
  message?: string
}

/** Shared VOID boot screen — auth gate, chat chunk suspense, and other full-screen waits. */
export function DAOBootScreen({ message = 'Starting DAO…' }: DAOBootScreenProps) {
  const tail = useScrambleTail(BOOT_TAIL, true)

  return (
    <div className="DAO-boot-screen void-screen void-center void-glow">
      <div
        className="DAO-boot-stack void-boot"
        role="status"
        aria-live="polite"
        aria-busy="true"
        aria-label={message}
      >
        <p className="DAO-boot-eyebrow">DAO</p>
        <ScrambleStatusText prefix={BOOT_PREFIX} tail={tail} />
        <p className="void-muted DAO-boot-caption">{message}</p>
      </div>
    </div>
  )
}
