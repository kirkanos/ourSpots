import { Link, NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { IconList, IconLogo, IconMap, IconPlus, IconRoute } from './Icons';
import { flushOutbox } from '../offline/outbox';
import { useOnline, useOutbox } from '../offline/useOutbox';

export function Layout() {
  const me = useMe();
  const online = useOnline();
  const outbox = useOutbox();

  const logout = async () => {
    const result = await api<{ endSessionUrl: string | null }>('/auth/logout', { method: 'POST' });
    // Wenn Authelia einen Abmelde-Endpunkt anbietet, dort weiterleiten – sonst
    // wäre man lokal abgemeldet, beim Identity Provider aber weiter aktiv.
    window.location.href = result.endSessionUrl ?? '/';
  };

  return (
    <div className="app">
      <header className="app__header">
        <NavLink to="/" className="app__brand">
          <IconLogo />
          WoMoPlaner
        </NavLink>
        <div className="app__spacer" />
        <Link to="/einstellungen" className="btn btn--ghost btn--small">
          Einstellungen
        </Link>
        {me.data && (
          <div className="row small">
            <span className="muted truncate" style={{ maxWidth: '10rem' }}>
              {me.data.displayName}
            </span>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => void logout()}>
              Abmelden
            </button>
          </div>
        )}
      </header>

      <nav className="nav" aria-label="Hauptnavigation">
        <NavLink to="/karte" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconMap />
          Karte
        </NavLink>
        <NavLink to="/stellplaetze" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconList />
          Plätze
        </NavLink>
        <NavLink to="/reisen" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconRoute />
          Reisen
        </NavLink>
        <NavLink to="/erfassen" className={({ isActive }) => (isActive ? 'is-active' : '')}>
          <IconPlus />
          Erfassen
        </NavLink>
      </nav>

      {(!online || outbox.pending > 0 || outbox.failed > 0) && (
        <div className="statusbar" role="status">
          {!online && <span>Kein Netz – Erfasstes wird gespeichert und später übertragen.</span>}
          {outbox.pending > 0 && (
            <span>
              {outbox.pending} {outbox.pending === 1 ? 'Änderung wartet' : 'Änderungen warten'} auf
              Übertragung.
            </span>
          )}
          {outbox.failed > 0 && (
            <Link to="/einstellungen">{outbox.failed} abgelehnt – ansehen</Link>
          )}
          {online && outbox.pending > 0 && (
            <button
              type="button"
              className="btn btn--ghost btn--small"
              onClick={() => void flushOutbox()}
              disabled={outbox.syncing}
            >
              {outbox.syncing ? 'Wird übertragen …' : 'Jetzt übertragen'}
            </button>
          )}
        </div>
      )}

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
