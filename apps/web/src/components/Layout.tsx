import { NavLink, Outlet } from 'react-router-dom';
import { api } from '../api/client';
import { useMe } from '../api/hooks';
import { IconList, IconLogo, IconMap, IconPlus, IconRoute } from './Icons';

export function Layout() {
  const me = useMe();

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

      <main className="app__main">
        <Outlet />
      </main>
    </div>
  );
}
