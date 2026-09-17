import type { ReactNode } from 'react';
import { useMe } from '../api/hooks';
import { UnauthorizedError } from '../api/client';
import { Loading } from './States';
import { LoginPrompt } from '../pages/LoginPage';

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();

  if (me.isPending) return <Loading label="Anmeldung wird geprüft …" />;

  if (me.error) {
    if (me.error instanceof UnauthorizedError) return <LoginPrompt />;
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
