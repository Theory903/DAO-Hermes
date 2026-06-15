import { useCallback, useState } from 'react'
import { Bell, Check, ChevronRight, X } from 'lucide-react'

import { NotificationStack } from '@/components/notifications'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { triggerHaptic } from '@/lib/haptics'
import { cn } from '@/lib/utils'
import { notify } from '@/store/notifications'

import { ToolTracePanel } from '../components/ToolTracePanel'
import { resolveHitl, type HitlRequest } from '../api/space-api'
import { useOptionalSpaceContext } from '../context/SpaceContext'
import { useHitlInbox } from '../hooks/useHitlInbox'
import { DEFAULT_LEAD_NAME } from '../lib/space-lead'

function pushBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'granted') return
  if (!document.hidden) return

  try {
    new Notification(title, { body, tag, silent: false })
  } catch {
    // ignore unsupported environments
  }
}

function requestNotificationPermission() {
  if (typeof window === 'undefined' || !('Notification' in window)) return
  if (Notification.permission !== 'default') return
  void Notification.requestPermission()
}

export function DAONotificationsBell() {
  const space = useOptionalSpaceContext()
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<HitlRequest | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  const onPending = useCallback((event: { id: string; summary: string }) => {
    triggerHaptic('warning')
    notify({
      id: `hitl-${event.id}`,
      kind: 'warning',
      title: 'Approval needed',
      message: event.summary,
      durationMs: 0,
      action: {
        label: 'Review',
        onClick: () => setOpen(true),
      },
    })
    pushBrowserNotification('Approval needed', event.summary, `hitl-${event.id}`)
  }, [])

  const inbox = useHitlInbox(space?.id ?? null, { onPending })

  if (!space) return null

  const spaceId = space.id
  const { requests, pendingCount, loading, error, reload } = inbox
  const leadName = space.ai_lead_config?.name ?? DEFAULT_LEAD_NAME

  async function resolve(req: HitlRequest, decision: 'approved' | 'rejected') {
    setBusy(req.id)
    setActionError(null)
    try {
      await resolveHitl(spaceId, req.id, decision)
      triggerHaptic(decision === 'approved' ? 'success' : 'tap')
      if (selected?.id === req.id) setSelected(null)
      await reload()
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Could not resolve request')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <NotificationStack />
      <Popover
        onOpenChange={(next) => {
          setOpen(next)
          if (next) requestNotificationPermission()
        }}
        open={open}
      >
        <PopoverTrigger asChild>
          <button
            aria-label={pendingCount ? `${pendingCount} notifications` : 'Notifications'}
            className={cn(
              'DAO-nav-item DAO-nav-item--utility DAO-notifications-trigger',
              pendingCount > 0 && 'DAO-notifications-trigger--active',
            )}
            title="Notifications"
            type="button"
          >
            <Bell aria-hidden className="size-4" strokeWidth={1.6} />
            {pendingCount > 0 ? (
              <span aria-hidden className="DAO-notifications-badge">
                {pendingCount > 9 ? '9+' : pendingCount}
              </span>
            ) : null}
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="DAO-notifications-panel" sideOffset={8}>
          <header className="DAO-notifications-header">
            <div>
              <p className="DAO-notifications-eyebrow">Board queue</p>
              <h2 className="DAO-notifications-title">Notifications</h2>
            </div>
            {pendingCount > 0 ? (
              <span className="DAO-company-pill DAO-company-pill--pending">{pendingCount} pending</span>
            ) : (
              <span className="DAO-company-pill DAO-company-pill--live">All clear</span>
            )}
          </header>

          {actionError ? <p className="DAO-notifications-error">{actionError}</p> : null}

          {loading ? (
            <p className="DAO-notifications-empty">Loading approvals…</p>
          ) : error ? (
            <div className="DAO-notifications-empty">
              <p>{error}</p>
              <Button onClick={() => void reload()} size="sm" type="button" variant="ghost">
                Retry
              </Button>
            </div>
          ) : requests.length === 0 ? (
            <div className="DAO-notifications-empty">
              <p className="DAO-notifications-empty-title">All clear</p>
              <p className="DAO-notifications-empty-desc">{leadName} is running autonomously.</p>
            </div>
          ) : (
            <ul className="DAO-notifications-list">
              {requests.map((req) => (
                <li key={req.id} className="DAO-notifications-item">
                  <button
                    className="DAO-notifications-item-main"
                    onClick={() => {
                      setSelected(req)
                      setOpen(false)
                    }}
                    type="button"
                  >
                    <span className="DAO-notifications-item-title">{req.action_summary}</span>
                    {req.created_at ? (
                      <span className="DAO-notifications-item-meta">
                        {new Date(req.created_at).toLocaleString()}
                      </span>
                    ) : null}
                    <span className="DAO-notifications-item-link">
                      Details
                      <ChevronRight aria-hidden className="size-4" strokeWidth={1.6} />
                    </span>
                  </button>
                  <div className="DAO-notifications-item-actions">
                    <Button
                      disabled={busy === req.id}
                      onClick={() => void resolve(req, 'approved')}
                      size="sm"
                      type="button"
                    >
                      <Check className="size-4" strokeWidth={1.6} />
                      Approve
                    </Button>
                    <Button
                      disabled={busy === req.id}
                      onClick={() => void resolve(req, 'rejected')}
                      size="sm"
                      type="button"
                      variant="ghost"
                    >
                      <X className="size-4" strokeWidth={1.6} />
                      Reject
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </PopoverContent>
      </Popover>

      <Sheet onOpenChange={(next) => !next && setSelected(null)} open={Boolean(selected)}>
        <SheetContent className="DAO-company-hitl-sheet" showCloseButton side="right">
          {selected ? (
            <>
              <SheetHeader>
                <SheetTitle>{selected.action_summary}</SheetTitle>
                <SheetDescription>
                  {selected.created_at
                    ? `Queued ${new Date(selected.created_at).toLocaleString()}`
                    : 'Awaiting Board approval'}
                </SheetDescription>
              </SheetHeader>

              {selected.drive_refs?.length ? (
                <section className="DAO-company-hitl-sheet-section">
                  <h3 className="DAO-util-section-label">Drive references</h3>
                  <ul className="DAO-company-hitl-refs">
                    {selected.drive_refs.map((ref: string) => (
                      <li key={ref} className="DAO-company-hitl-ref">
                        {ref}
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <section className="DAO-company-hitl-sheet-section">
                <h3 className="DAO-util-section-label">Tool trace</h3>
                <ToolTracePanel trace={selected.tool_trace} />
              </section>

              <SheetFooter className="DAO-company-hitl-sheet-actions">
                <Button
                  disabled={busy === selected.id}
                  onClick={() => void resolve(selected, 'approved')}
                  size="sm"
                  type="button"
                >
                  <Check className="size-4" strokeWidth={1.6} />
                  Approve
                </Button>
                <Button
                  disabled={busy === selected.id}
                  onClick={() => void resolve(selected, 'rejected')}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  <X className="size-4" strokeWidth={1.6} />
                  Reject
                </Button>
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  )
}
