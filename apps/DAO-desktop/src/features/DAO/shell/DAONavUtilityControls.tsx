import { useStore } from '@nanostores/react'
import { useLocation, useNavigate } from 'react-router-dom'

import { SETTINGS_ROUTE } from '@/app/routes'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { $hapticsMuted, toggleHapticsMuted } from '@/store/haptics'
import { toggleKeybindPanel } from '@/store/keybinds'

import { DAONotificationsBell } from './DAONotificationsBell'

/** Haptics, keyboard shortcuts, and app preferences — pinned to topbar right. */
export function DAONavUtilityControls() {
  const { t } = useI18n()
  const location = useLocation()
  const navigate = useNavigate()
  const hapticsMuted = useStore($hapticsMuted)

  const toggleHaptics = () => {
    if (!hapticsMuted) {
      triggerHaptic('tap')
    }

    toggleHapticsMuted()

    if (hapticsMuted) {
      window.requestAnimationFrame(() => triggerHaptic('success'))
    }
  }

  const openSettings = () => {
    triggerHaptic('open')
    const returnTo = `${location.pathname}${location.search}${location.hash}`
    navigate(SETTINGS_ROUTE, { state: { returnTo } })
  }

  return (
    <div
      aria-label={t.titlebar.shortcutsGroup}
      className="DAO-nav-segment DAO-nav-segment--utilities"
      role="group"
    >
      <DAONotificationsBell />
      <button
        aria-label={hapticsMuted ? t.titlebar.unmuteHaptics : t.titlebar.muteHaptics}
        aria-pressed={hapticsMuted}
        className={cn(
          'DAO-nav-item DAO-nav-item--utility DAO-nav-utility-optional',
          hapticsMuted && 'DAO-nav-item--pressed',
        )}
        onClick={toggleHaptics}
        title={hapticsMuted ? t.titlebar.unmuteHaptics : t.titlebar.muteHaptics}
        type="button"
      >
        <Codicon name={hapticsMuted ? 'mute' : 'unmute'} size="1rem" />
      </button>
      <button
        aria-label={t.titlebar.openKeybinds}
        className="DAO-nav-item DAO-nav-item--utility DAO-nav-utility-optional"
        onClick={() => {
          triggerHaptic('open')
          toggleKeybindPanel()
        }}
        title={t.titlebar.openKeybinds}
        type="button"
      >
        <Codicon name="keyboard" size="1rem" />
      </button>
      <button
        aria-label={t.titlebar.openSettings}
        className="DAO-nav-item DAO-nav-item--utility"
        onClick={openSettings}
        title={t.titlebar.openSettings}
        type="button"
      >
        <Codicon name="settings-gear" size="1rem" />
      </button>
    </div>
  )
}
