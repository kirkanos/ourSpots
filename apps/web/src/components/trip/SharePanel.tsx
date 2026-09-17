import { useState } from 'react';
import { useCreateShareLink, useRevokeShareLink, useShareLinks } from '../../api/hooks';
import { ErrorState, Loading } from '../States';
import { IconTrash } from '../Icons';
import { formatDate } from '../../lib/format';

export function SharePanel({ tripId }: { tripId: string }) {
  const links = useShareLinks(tripId);
  const create = useCreateShareLink(tripId);
  const revoke = useRevokeShareLink(tripId);
  const [includePhotos, setIncludePhotos] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(url);
      window.setTimeout(() => setCopied(null), 2000);
    } catch {
      // Ohne Zwischenablage-Rechte bleibt der Link zum Markieren stehen.
      setCopied(null);
    }
  };

  return (
    <div className="card stack">
      <h2>Reise teilen</h2>
      <p className="muted small">
        Wer den Link hat, sieht Route, Stellplätze und Bewertungen – ohne Konto und ohne
        Bearbeitungsrechte. Als privat markierte Notizen werden nie mitgeteilt.
      </p>

      {links.isPending && <Loading />}
      {links.error && <ErrorState error={links.error} />}

      <ul className="stack" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
        {links.data?.map((link) => (
          <li key={link.id} className="stack" style={{ gap: '0.35rem' }}>
            <div className="row row--between">
              <code className="share-url">{link.url}</code>
              <span className="row">
                <button type="button" className="btn btn--ghost btn--small" onClick={() => void copy(link.url)}>
                  {copied === link.url ? 'Kopiert' : 'Kopieren'}
                </button>
                <button
                  type="button"
                  className="btn btn--danger btn--small"
                  aria-label="Link widerrufen"
                  onClick={() => {
                    if (window.confirm('Diesen Link widerrufen? Er funktioniert danach für niemanden mehr.')) {
                      revoke.mutate(link.token);
                    }
                  }}
                >
                  <IconTrash />
                </button>
              </span>
            </div>
            <div className="small muted">
              erstellt am {formatDate(link.createdAt.slice(0, 10))} ·{' '}
              {link.includePhotos ? 'mit Fotos' : 'ohne Fotos'}
            </div>
          </li>
        ))}
      </ul>

      {links.data?.length === 0 && <p className="muted">Es gibt noch keinen Link.</p>}

      <label className="row small" style={{ fontWeight: 400 }}>
        <input
          type="checkbox"
          style={{ width: 'auto' }}
          checked={includePhotos}
          onChange={(e) => setIncludePhotos(e.target.checked)}
        />
        Fotos mitteilen
      </label>

      {create.error && <ErrorState error={create.error} />}

      <div>
        <button
          type="button"
          className="btn"
          disabled={create.isPending}
          onClick={() => create.mutate(includePhotos)}
        >
          {create.isPending ? 'Wird erstellt …' : 'Link erstellen'}
        </button>
      </div>
    </div>
  );
}
