import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { IconLogo } from '../components/Icons';

interface AuthConfig {
  devLogin: boolean;
  issuer: string;
}

export function LoginPrompt() {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Schlägt der Aufruf fehl, bleibt es beim normalen Anmeldeknopf.
    api<AuthConfig>('/auth/config')
      .then(setConfig)
      .catch(() => setConfig(null));
  }, []);

  const login = () => {
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const devLogin = async () => {
    setBusy(true);
    try {
      await api('/auth/dev-login', { method: 'POST' });
      window.location.reload();
    } finally {
      setBusy(false);
    }
  };

  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="page" style={{ maxWidth: '26rem', paddingTop: '4rem' }}>
      <div className="card stack" style={{ textAlign: 'center' }}>
        <IconLogo className="login__logo" />
        <h1>OurSpots</h1>
        <p className="muted">
          Reisen planen, Stellplätze sammeln und wiederfinden. Die Anmeldung läuft über deinen
          eigenen Authelia-Zugang.
        </p>

        {error && (
          <div className="alert alert--error" role="alert">
            Die Anmeldung wurde abgebrochen ({error}).
          </div>
        )}

        <button type="button" className="btn btn--block" onClick={login}>
          Mit Authelia anmelden
        </button>

        {config?.devLogin && (
          <>
            <hr style={{ border: 0, borderTop: '1px solid var(--border)', width: '100%' }} />
            <button
              type="button"
              className="btn btn--ghost btn--block"
              onClick={() => void devLogin()}
              disabled={busy}
            >
              {busy ? 'Wird angemeldet …' : 'Lokal anmelden (Entwicklung)'}
            </button>
            <p className="field__hint" style={{ textAlign: 'center' }}>
              Diese Abkürzung gibt es nur, weil <code>DEV_LOGIN</code> gesetzt ist. Im Betrieb
              verweigert der Server damit den Start.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
