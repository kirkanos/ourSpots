import { IconLogo } from '../components/Icons';

export function LoginPrompt() {
  const login = () => {
    // Nach dem Login dorthin zurück, wo der Nutzer hinwollte.
    const returnTo = `${window.location.pathname}${window.location.search}`;
    window.location.href = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const error = new URLSearchParams(window.location.search).get('error');

  return (
    <div className="page" style={{ maxWidth: '26rem', paddingTop: '4rem' }}>
      <div className="card stack" style={{ textAlign: 'center' }}>
        <IconLogo className="" />
        <h1>WoMoPlaner</h1>
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
      </div>
    </div>
  );
}
