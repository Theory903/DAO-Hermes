import type { ReactNode } from 'react'

type HomeSectionProps = {
  id?: string
  label: string
  title?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function HomeSection({ id, label, title, action, children, className }: HomeSectionProps) {
  return (
    <section className={className ? `DAO-home-section ${className}` : 'DAO-home-section'} id={id}>
      <header className="DAO-home-section__head">
        <div>
          <p className="DAO-util-section-label">{label}</p>
          {title ? <h2 className="DAO-home-section__title">{title}</h2> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  )
}
