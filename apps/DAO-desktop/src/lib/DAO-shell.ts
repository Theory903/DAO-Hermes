import { brainRoute } from '@/features/DAO/routes'

/** Matches `.void-chat-topbar` / `.DAO-topbar` block in the VOID chat shell. */
export const VOID_CHAT_TOPBAR_INSET_PX = 52

/**
 * Hermes `RightSidebarPane` (local project tree) is not mounted in chat.
 * Company files live on Space Drive; local cwd is set from the status bar / picker.
 */
export const DAO_CHAT_FILE_BROWSER = false

/** Sessions sidebar toggle lives in DAO top nav — not Hermes titlebar flip/swap chrome. */
export const DAO_NAV_OWNS_SIDEBAR = true

export function DAODriveRoute(slug: string | null | undefined): string {
  if (!slug?.trim()) {
    return '/'
  }

  return brainRoute(slug, { view: 'drive' })
}
