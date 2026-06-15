import { useEffect, useState } from 'react'
import { Building2, Check, ChevronDown, Plus } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useAuth } from '@/features/auth'
import { listSpaces, type Space } from '@/lib/DAO-api'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'

import { activeScreenFromPath, spaceRoute } from '../routes'
import { DAO_CHAT_ROUTE } from './nav'

type DAOSpaceSwitcherProps = {
  /** Display name or slug when the list has not loaded yet. */
  label: string
  variant?: 'brand' | 'sidebar'
}

/** DAO mark — concentric ring + three-spoke hub, brand-gradient stroke. */
function BrandGlyph() {
  return (
    <span aria-hidden className="DAO-brand-glyph">
      <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="9.25" stroke="url(#DAO-glyph-grad)" strokeWidth="1.6" />
        <path
          d="M12 12V3.5M12 12L4.64 16.25M12 12L19.36 16.25"
          stroke="url(#DAO-glyph-grad)"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
        <circle cx="12" cy="12" fill="url(#DAO-glyph-grad)" r="2.1" />
        <defs>
          <linearGradient gradientUnits="userSpaceOnUse" id="DAO-glyph-grad" x1="3" x2="21" y1="3" y2="21">
            <stop stopColor="#C7B9FF" />
            <stop offset="1" stopColor="#9B86F0" />
          </linearGradient>
        </defs>
      </svg>
    </span>
  )
}

export function DAOSpaceSwitcher({ label, variant = 'brand' }: DAOSpaceSwitcherProps) {
  const { spaceId, spaceSlug, selectSpace, switchSpace } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [spaces, setSpaces] = useState<Space[]>([])
  const [loading, setLoading] = useState(false)
  const [switchingId, setSwitchingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const current = spaces.find(s => s.id === spaceId)
  const displayName = current?.name ?? (label.trim() || spaceSlug || 'Space')
  const busy = switchingId !== null

  useEffect(() => {
    if (!open) return

    let cancelled = false
    setLoading(true)
    setError(null)

    listSpaces()
      .then(rows => {
        if (!cancelled) setSpaces(rows)
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load spaces')
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [open])

  async function onPick(space: Space) {
    if (space.id === spaceId) {
      setOpen(false)
      return
    }

    setSwitchingId(space.id)
    setError(null)
    triggerHaptic('tap')

    try {
      await selectSpace(space.id, space.slug)

      if (spaceSlug && location.pathname.startsWith('/space/')) {
        const screen = activeScreenFromPath(location.pathname, spaceSlug)
        navigate(spaceRoute(space.slug, screen))
      } else {
        navigate(DAO_CHAT_ROUTE)
      }

      setOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not switch Space')
    } finally {
      setSwitchingId(null)
    }
  }

  const triggerClass =
    variant === 'brand'
      ? 'DAO-space-switcher DAO-space-switcher--brand'
      : 'DAO-space-switcher DAO-space-switcher--sidebar'

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={triggerClass}
          aria-label={`Switch Space — ${displayName}`}
          aria-haspopup="menu"
          aria-expanded={open}
          disabled={busy}
        >
          {variant === 'brand' ? (
            <>
              <BrandGlyph />
              <span className="DAO-space-switcher-brand-copy">
                <span className="DAO-topbar-brand-mark">DAO</span>
                <span className="DAO-topbar-brand-meta">
                  <span className="DAO-topbar-brand-sep" aria-hidden>
                    /
                  </span>
                  <span className="DAO-topbar-brand-space">{displayName}</span>
                </span>
              </span>
              <ChevronDown
                size={11}
                strokeWidth={2.25}
                aria-hidden
                className={cn(
                  'DAO-space-switcher-chevron DAO-space-switcher-chevron--brand shrink-0',
                  open && 'DAO-space-switcher-chevron--open'
                )}
              />
            </>
          ) : (
            <>
              <Building2 size={15} aria-hidden className="DAO-space-switcher-icon shrink-0" />
              <span className="DAO-space-switcher-label">
                <span className="DAO-space-switcher-eyebrow">Space</span>
                <span className="DAO-space-switcher-sidebar-name">{displayName}</span>
              </span>
            </>
          )}
          {variant === 'sidebar' ? (
            <ChevronDown
              size={12}
              aria-hidden
              className={cn('DAO-space-switcher-chevron shrink-0', open && 'DAO-space-switcher-chevron--open')}
            />
          ) : null}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align={variant === 'brand' ? 'start' : 'start'}
        className="DAO-space-switcher-menu"
        sideOffset={8}
      >
        <DropdownMenuLabel className="DAO-space-switcher-menu-label">Switch Space</DropdownMenuLabel>

        {loading ? (
          <DropdownMenuItem disabled className="text-(--ui-text-tertiary)">
            Loading…
          </DropdownMenuItem>
        ) : spaces.length === 0 ? (
          <DropdownMenuItem disabled className="text-(--ui-text-tertiary)">
            No Spaces found
          </DropdownMenuItem>
        ) : (
          spaces.map(space => {
            const active = space.id === spaceId
            const picking = switchingId === space.id

            return (
              <DropdownMenuItem
                key={space.id}
                disabled={busy && !picking}
                className={cn('DAO-space-switcher-item', active && 'DAO-space-switcher-item--active')}
                onSelect={() => void onPick(space)}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{space.name}</span>
                  <span className="block truncate text-[0.65rem] text-(--ui-text-tertiary)">/{space.slug}</span>
                </span>
                {active ? <Check size={14} className="shrink-0 text-[var(--primary)]" aria-hidden /> : null}
                {picking ? <span className="DAO-space-switcher-picking">…</span> : null}
              </DropdownMenuItem>
            )
          })
        )}

        {error ? (
          <p className="px-2 py-1 text-[0.65rem] text-[var(--signal-red)]" role="alert">
            {error}
          </p>
        ) : null}

        <DropdownMenuSeparator />

        <DropdownMenuItem
          className="gap-2"
          onSelect={() => {
            triggerHaptic('tap')
            switchSpace()
          }}
        >
          <Plus size={14} aria-hidden />
          Create or manage Spaces
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
