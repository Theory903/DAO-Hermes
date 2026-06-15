import { DAOSpaceSwitcher } from './DAOSpaceSwitcher'

type DAOTopbarBrandProps = {
  /** Space slug or display name shown after the DAO mark. */
  label: string
}

/** Topbar brand with Space switcher dropdown. */
export function DAOTopbarBrand({ label }: DAOTopbarBrandProps) {
  return (
    <div className="DAO-topbar-brand DAO-topbar-brand--navbar">
      <DAOSpaceSwitcher label={label} variant="brand" />
    </div>
  )
}
