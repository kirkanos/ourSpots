import { useState } from 'react';
import { useAdminUsers, useBeanspruchen, useEinrichtung, useMe, useSetzeRolle } from '../api/hooks';
import { ErrorState, Loading } from './States';
import { formatDate } from '../lib/format';

/**
 * Rollen und Rechte der Nutzer – nur fuer Administratoren.
 *
 * Enthaelt auch die Einrichtung einer frischen Installation: Solange es
 * keinen Administrator gibt, schreibt die API bei jedem Start ein Token ins
 * Log. Wer das Log lesen kann, betreibt den Server -- so wird nicht der erste
 * Anmeldende zum Administrator, sondern derjenige mit Zugriff auf die
 * Maschine.
 */
export function Benutzerverwaltung() {
  const me = useMe();
  const istAdmin = me.data?.role === 'admin';
  const einrichtung = useEinrichtung();
  const users = useAdminUsers(istAdmin);
  const setzeRolle = useSetzeRolle();
  const beanspruchen = useBeanspruchen();
  const [token, setToken] = useState('');

  if (einrichtung.data?.offen && !istAdmin) {
    return (
      <div className="card stack">
        <h2>Diese Installation einrichten</h2>
        <p className="muted small">
          Es gibt noch keinen Administrator. Im Log des Servers steht ein Token – gib es
          hier ein, um die Verwaltung zu übernehmen. Wer das Log lesen kann, betreibt
          den Server; so kann sich niemand anderes die Rechte schnappen.
        </p>
        <div className="field">
          <label htmlFor="einrichtung-token">Einrichtungstoken</label>
          <input
            id="einrichtung-token"
            value={token}
            autoComplete="off"
            onChange={(e) => setToken(e.target.value)}
            placeholder="aus dem Serverlog"
          />
        </div>
        {beanspruchen.error && <ErrorState error={beanspruchen.error} />}
        <div>
          <button
            type="button"
            className="btn"
            disabled={token.trim().length < 8 || beanspruchen.isPending}
            onClick={() => beanspruchen.mutate(token.trim())}
          >
            Administrator werden
          </button>
        </div>
      </div>
    );
  }

  if (!istAdmin) return null;

  return (
    <div className="card stack">
      <h2>Benutzer</h2>
      <p className="muted small">
        Ein Administrator darf alles anlegen, ändern und löschen und vergibt die Rollen.
        Was jemand innerhalb einer Reise darf, steht weiterhin an der Reise selbst.
      </p>

      {users.isPending && <Loading />}
      {users.error && <ErrorState error={users.error} />}
      {setzeRolle.error && <ErrorState error={setzeRolle.error} />}

      {users.data?.map((user) => (
        <div className="card card--flach stack" key={user.id}>
          <div className="row row--between">
            <span className="truncate">
              <strong>{user.displayName}</strong>{' '}
              <span className="small muted">{user.email ?? 'ohne Adresse'}</span>
            </span>
            <span className="small muted">
              {user.ownedTrips} Reisen · seit {formatDate(user.createdAt)}
            </span>
          </div>
          <div className="row">
            <select
              aria-label={`Rolle von ${user.displayName}`}
              value={user.role}
              onChange={(e) =>
                setzeRolle.mutate({
                  userId: user.id,
                  role: e.target.value as 'admin' | 'user',
                  canRenderVideo: user.canRenderVideo,
                })
              }
            >
              <option value="user">Benutzer</option>
              <option value="admin">Administrator</option>
            </select>
            <button
              type="button"
              className="chip"
              aria-pressed={user.canRenderVideo}
              // Ein Administrator darf ohnehin rendern; der Schalter waere
              // dort nur eine Einladung zu einem widerspruechlichen Zustand.
              disabled={user.role === 'admin'}
              onClick={() =>
                setzeRolle.mutate({
                  userId: user.id,
                  role: user.role,
                  canRenderVideo: !user.canRenderVideo,
                })
              }
            >
              Darf Videos erzeugen
            </button>
            {user.id === me.data?.id && <span className="badge">das bist du</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
