import { StatusbarControls } from '@/app/shell/statusbar-controls'

import { useCompanyStatusbar } from './use-company-statusbar'

/** Shared Hermes status footer (chat + Space company screens). */
export function DAOCompanyFooter() {
  const { leftStatusbarItems, statusbarItems } = useCompanyStatusbar()

  return (
    <StatusbarControls
      className="DAO-company-footer shrink-0"
      leftItems={leftStatusbarItems}
      items={statusbarItems}
    />
  )
}
