import { useStore } from '@nanostores/react'
import type { ComponentProps, ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { $hapticsMuted, toggleHapticsMuted } from '@/store/haptics'
import { toggleKeybindPanel } from '@/store/keybinds'
import {
  $fileBrowserOpen,
  $panesFlipped,
  $sidebarOpen,
  toggleFileBrowserOpen,
  togglePanesFlipped,
  toggleSidebarOpen
} from '@/store/layout'

import { useMediaQuery } from '@/hooks/use-media-query'
import { useAuth } from '@/features/auth'
import { DAO_CHAT_FILE_BROWSER, DAO_NAV_OWNS_SIDEBAR, DAODriveRoute } from '@/lib/DAO-shell'

import { SIDEBAR_COLLAPSE_MEDIA_QUERY } from '../layout-constants'
import { appViewForPath, isOverlayView } from '../routes'

import { titlebarButtonClass } from './titlebar'

export interface TitlebarTool {
  id: string
  label: string
  active?: boolean
  className?: string
  disabled?: boolean
  hidden?: boolean
  href?: string
  icon: ReactNode
  onSelect?: () => void
  title?: string
  to?: string
}

export type TitlebarToolSide = 'left' | 'right'
export type SetTitlebarToolGroup = (id: string, tools: readonly TitlebarTool[], side?: TitlebarToolSide) => void

interface TitlebarControlsProps extends ComponentProps<'div'> {
  leftTools?: readonly TitlebarTool[]
  tools?: readonly TitlebarTool[]
  onOpenSettings: () => void
}

export function TitlebarControls({ leftTools = [], tools = [], onOpenSettings }: TitlebarControlsProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const location = useLocation()
  const { spaceSlug } = useAuth()
  const hapticsMuted = useStore($hapticsMuted)
  const fileBrowserOpen = useStore($fileBrowserOpen)
  const sidebarOpen = useStore($sidebarOpen)
  const panesFlipped = useStore($panesFlipped)
  const narrowViewport = useMediaQuery(SIDEBAR_COLLAPSE_MEDIA_QUERY)
  const sidebarToggleDocked = sidebarOpen && !narrowViewport && !panesFlipped
  const driveRoute = DAODriveRoute(spaceSlug)

  const toggleHaptics = () => {
    if (!hapticsMuted) {
      triggerHaptic('tap')
    }

    toggleHapticsMuted()

    if (hapticsMuted) {
      window.requestAnimationFrame(() => triggerHaptic('success'))
    }
  }

  // Each titlebar button controls the pane physically on its side, so a flip
  // swaps which pane each one toggles. Default: sessions left, file browser
  // right. Flipped: file browser left, sessions right. Sidebar toggles never
  // carry an active highlight — they're plain show/hide affordances.
  const openDrive = () => {
    triggerHaptic('open')
    navigate(driveRoute)
  }

  const fileBrowserEdge = DAO_CHAT_FILE_BROWSER
    ? { open: fileBrowserOpen, toggle: toggleFileBrowserOpen }
    : { open: false, toggle: openDrive }
  const sessionsEdge = { open: sidebarOpen, toggle: toggleSidebarOpen }
  const leftEdge = panesFlipped && DAO_CHAT_FILE_BROWSER ? fileBrowserEdge : sessionsEdge
  const rightEdge = panesFlipped && DAO_CHAT_FILE_BROWSER ? sessionsEdge : fileBrowserEdge

  const sidebarToggleTool: TitlebarTool | null = DAO_NAV_OWNS_SIDEBAR
    ? null
    : {
        icon: <Codicon name={leftEdge.open ? 'layout-sidebar-left-off' : 'layout-sidebar-left'} />,
        id: 'sidebar',
        label: leftEdge.open ? t.titlebar.hideSidebar : t.titlebar.showSidebar,
        onSelect: () => {
          triggerHaptic('tap')
          leftEdge.toggle()
        }
      }

  const leftToolbarTools: TitlebarTool[] = [
    ...(DAO_NAV_OWNS_SIDEBAR
      ? []
      : [
          {
            icon: <Codicon name="arrow-swap" />,
            id: 'flip-panes',
            label: t.titlebar.swapSidebarSides,
            onSelect: () => {
              triggerHaptic('tap')
              togglePanesFlipped()
            },
            title: t.titlebar.swapSidebarSidesTitle
          } satisfies TitlebarTool
        ]),
    ...leftTools
  ]

  // Static system tools — always pinned to the screen's right edge.
  const hapticsTool: TitlebarTool = {
    active: hapticsMuted,
    icon: <Codicon name={hapticsMuted ? 'mute' : 'unmute'} />,
    id: 'haptics',
    label: hapticsMuted ? t.titlebar.unmuteHaptics : t.titlebar.muteHaptics,
    onSelect: toggleHaptics
  }

  const keybindsTool: TitlebarTool = {
    icon: <Codicon name="keyboard" />,
    id: 'keybinds',
    label: t.titlebar.openKeybinds,
    onSelect: () => {
      triggerHaptic('open')
      toggleKeybindPanel()
    }
  }

  const settingsTool: TitlebarTool = {
    icon: <Codicon name="settings-gear" />,
    id: 'settings',
    label: t.titlebar.openSettings,
    onSelect: () => {
      triggerHaptic('open')
      onOpenSettings()
    }
  }

  const rightSidebarTool: TitlebarTool = {
    icon: DAO_CHAT_FILE_BROWSER ? <Codicon name="layout-sidebar-right" /> : <Codicon name="folder" />,
    id: 'right-sidebar',
    label: DAO_CHAT_FILE_BROWSER
      ? rightEdge.open
        ? t.titlebar.hideRightSidebar
        : t.titlebar.showRightSidebar
      : t.titlebar.openKnowledge,
    onSelect: () => {
      rightEdge.toggle()
    }
  }

  // While a full-screen overlay (settings, command center, …) is open it should
  // visually own the window. These control clusters are `fixed` at a higher
  // z-index than the overlay card, so they'd otherwise bleed over it — hide them
  // and let the overlay's own chrome (close button, drag region) take over.
  if (isOverlayView(appViewForPath(location.pathname))) {
    return null
  }

  const visiblePaneTools = tools.filter(tool => !tool.hidden)
  const visibleLeftTools = leftToolbarTools.filter(tool => !tool.hidden)

  return (
    <>
      {visibleLeftTools.length > 0 && (
        <div
          aria-label={t.shell.windowControls}
          className="titlebar-cluster-left void-titlebar-cluster-left fixed left-(--titlebar-controls-left) top-(--titlebar-controls-top) z-70 flex flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]"
        >
          {visibleLeftTools.map(tool => (
            <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
          ))}
        </div>
      )}

      {sidebarToggleTool && (
        <div
          aria-label={sidebarToggleTool.label}
          className={cn(
            'titlebar-cluster-sidebar void-titlebar-cluster-sidebar fixed left-(--titlebar-sidebar-toggle-left) top-(--titlebar-controls-top) z-70 flex flex-row items-center pointer-events-auto select-none [-webkit-app-region:no-drag]',
            sidebarToggleDocked && 'titlebar-cluster-sidebar--docked'
          )}
        >
          <TitlebarToolButton navigate={navigate} tool={sidebarToggleTool} />
        </div>
      )}

      {/*
        Pane-scoped tools (preview's monitor / devtools / refresh / X) render
        as their own fixed cluster. AppShell sets --shell-preview-toolbar-gap
        to either the static cluster's width (file-browser closed → cluster
        sits flush against system tools) or the file-browser pane's width
        (file-browser open → cluster sits flush against the file-browser pane,
        i.e. at the preview pane's right edge). No margin hacks needed.
      */}
      {visiblePaneTools.length > 0 && (
        <div
          aria-label={t.shell.paneControls}
          className="titlebar-cluster-pane fixed top-(--titlebar-controls-top) right-[calc(var(--titlebar-tools-right)+var(--shell-preview-toolbar-gap,0))] z-70 flex flex-row items-center gap-x-1 pointer-events-auto select-none [-webkit-app-region:no-drag]"
        >
          {visiblePaneTools.map(tool => (
            <TitlebarToolButton key={tool.id} navigate={navigate} tool={tool} />
          ))}
        </div>
      )}

      {!DAO_NAV_OWNS_SIDEBAR && (
        <div
          aria-label={t.shell.appControls}
          className="titlebar-cluster-right fixed right-(--titlebar-tools-right) top-(--titlebar-controls-top) z-70 flex flex-row items-center justify-end pointer-events-auto select-none [-webkit-app-region:no-drag]"
        >
          <div
            aria-label={t.titlebar.shortcutsGroup}
            className="titlebar-cluster-group"
            role="group"
          >
            <TitlebarToolButton navigate={navigate} tool={hapticsTool} />
            <TitlebarToolButton navigate={navigate} tool={keybindsTool} />
          </div>
          <div aria-hidden className="titlebar-cluster-sep" />
          <TitlebarToolButton navigate={navigate} tool={settingsTool} />
          <TitlebarToolButton navigate={navigate} tool={rightSidebarTool} />
        </div>
      )}
    </>
  )
}

function TitlebarToolButton({ navigate, tool }: { navigate: ReturnType<typeof useNavigate>; tool: TitlebarTool }) {
  // Titlebar actions never show an active background — state reads from the
  // icon itself (e.g. the mute/unmute glyph). aria-pressed still carries it
  // for a11y.
  const className = cn(titlebarButtonClass, 'bg-transparent select-none', tool.className)

  if (tool.href) {
    return (
      <Button asChild className={className} size="icon-titlebar" variant="ghost">
        <a
          aria-label={tool.label}
          href={tool.href}
          onPointerDown={event => event.stopPropagation()}
          rel="noreferrer"
          target="_blank"
          title={tool.title ?? tool.label}
        >
          {tool.icon}
        </a>
      </Button>
    )
  }

  return (
    <Button
      aria-label={tool.label}
      aria-pressed={tool.active ?? undefined}
      className={className}
      disabled={tool.disabled}
      onClick={() => {
        if (tool.to) {
          navigate(tool.to)
        }

        tool.onSelect?.()
      }}
      onPointerDown={event => event.stopPropagation()}
      size="icon-titlebar"
      title={tool.title ?? tool.label}
      type="button"
      variant="ghost"
    >
      {tool.icon}
    </Button>
  )
}
