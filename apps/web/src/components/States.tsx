import type { ReactNode } from 'react';

export function Loading({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <div className="empty">
      <div className="spinner" style={{ margin: '0 auto 0.75rem' }} />
      <p className="muted">{label}</p>
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
  return (
    <div className="alert alert--error" role="alert">
      <strong>Das hat nicht geklappt.</strong>
      <div className="small">{message}</div>
      {onRetry && (
        <button type="button" className="btn btn--ghost btn--small" onClick={onRetry} style={{ marginTop: '0.5rem' }}>
          Erneut versuchen
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action}
    </div>
  );
}
