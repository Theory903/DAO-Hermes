import type { ReactNode } from "react";

export function ScreenShell({
  label,
  title,
  subtitle,
  actions,
  children,
  maxWidth,
}: {
  label: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  maxWidth?: string;
}) {
  return (
    <div className="DAO-screen DAO-glow">
      <div className="DAO-screen-inner" style={maxWidth ? { maxWidth } : undefined}>
        <header className="DAO-screen-header">
          <div>
            <p className="DAO-eyebrow">{label}</p>
            <h1 className="DAO-title">{title}</h1>
            {subtitle ? <p className="DAO-subtitle">{subtitle}</p> : null}
          </div>
          {actions ? <div className="DAO-screen-header-actions">{actions}</div> : null}
        </header>
        {children}
      </div>
    </div>
  );
}

export function LoadingRows({ count = 3 }: { count?: number }) {
  return (
    <div className="DAO-stack">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="DAO-skeleton DAO-card DAO-skeleton-row" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="DAO-card DAO-empty">
      <h2 className="DAO-title-sm">{title}</h2>
      <p className="DAO-muted">{description}</p>
    </div>
  );
}

export function ErrorNote({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="DAO-error-note" role="alert">
      <p className="DAO-error">{message}</p>
      {onRetry ? (
        <button type="button" className="void-button void-button-ghost void-button-compact" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
