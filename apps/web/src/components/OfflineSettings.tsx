import { useEffect, useState } from 'react';
import { discardFailed, flushOutbox } from '../offline/outbox';
import { useOnline, useOutbox } from '../offline/useOutbox';
import { clearTileCache, tileCacheSize } from '../offline/tiles';
import { ErrorState } from './States';

export function OfflineSettings() {
  const outbox = useOutbox();
  const online = useOnline();
  const [tiles, setTiles] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void tileCacheSize().then(setTiles);
  }, []);

  return (
    <div className="card stack">
      <h2>Offline</h2>
      <p className="muted small">
        Die App lässt sich auf dem Handy zum Startbildschirm hinzufügen und funktioniert dann auch
        ohne Netz: erfasste Stellplätze und Fotos warten lokal und gehen los, sobald wieder
        Verbindung besteht.
      </p>

      <div className="row">
        <span className={`badge${online ? '' : ' badge--accent'}`}>
          {online ? 'Verbindung besteht' : 'Kein Netz'}
        </span>
        <span className="badge">
          {outbox.pending === 0
            ? 'Nichts in der Warteschlange'
            : `${outbox.pending} ${outbox.pending === 1 ? 'Änderung wartet' : 'Änderungen warten'}`}
        </span>
        {outbox.failed > 0 && <span className="badge">{outbox.failed} abgelehnt</span>}
      </div>

      {outbox.lastError && <ErrorState error={new Error(outbox.lastError)} />}

      {outbox.failed > 0 && (
        <div className="alert alert--error stack">
          <span>
            {outbox.failed === 1 ? 'Ein Eintrag wurde' : `${outbox.failed} Einträge wurden`} vom
            Server abgelehnt und bleibt liegen, bis du ihn verwirfst.
          </span>
          <div>
            <button type="button" className="btn btn--danger btn--small" onClick={() => void discardFailed()}>
              Abgelehnte verwerfen
            </button>
          </div>
        </div>
      )}

      <div className="row">
        <button
          type="button"
          className="btn btn--ghost"
          disabled={!online || outbox.syncing || outbox.pending === 0}
          onClick={() => void flushOutbox()}
        >
          {outbox.syncing ? 'Wird übertragen …' : 'Jetzt übertragen'}
        </button>
      </div>

      <hr className="rule" />

      <h3>Kartenkacheln</h3>
      <p className="muted small">
        {tiles === null
          ? 'Zwischenspeicher wird geprüft …'
          : `${tiles.toLocaleString('de-DE')} Kacheln liegen offline bereit.`}{' '}
        Neue Ausschnitte lädst du auf der Karte über „Ausschnitt offline sichern“.
      </p>
      <div>
        <button
          type="button"
          className="btn btn--ghost btn--small"
          disabled={busy || !tiles}
          onClick={async () => {
            setBusy(true);
            await clearTileCache();
            setTiles(await tileCacheSize());
            setBusy(false);
          }}
        >
          Kachelspeicher leeren
        </button>
      </div>
    </div>
  );
}
