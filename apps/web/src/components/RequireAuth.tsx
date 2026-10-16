import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useMe } from '../api/hooks';
import { UnauthorizedError } from '../api/client';
import { Loading } from './States';
import { LoginPrompt } from '../pages/LoginPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const ort = useLocation();

  if (me.isPending) return <Loading label="Anmeldung wird geprüft …" />;

  if (me.error) {
    if (me.error instanceof UnauthorizedError) {
      // Wer unangemeldet die Startseite aufruft, soll nicht vor einem
      // Anmeldefenster stehen, sondern sehen, was es hier gibt. Die Anmeldung
      // ist von dort ein Schritt weiter. Bei jeder anderen Adresse hat der
      // Besucher ein Ziel vor Augen -- da waere eine Umleitung nur im Weg.
      if (ort.pathname === '/') return <Navigate to="/entdecken" replace />;
      return <LoginPrompt />;
    }
    return (
      <div className="page">
        <div className="alert alert--error">
          Die Anmeldung konnte nicht geprüft werden: {me.error.message}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
