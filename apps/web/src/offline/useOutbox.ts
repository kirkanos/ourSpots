import { useEffect, useState, useSyncExternalStore } from 'react';
import { outboxSnapshot, subscribeOutbox, type OutboxState } from './outbox';

export function useOutbox(): OutboxState {
  return useSyncExternalStore(subscribeOutbox, outboxSnapshot, outboxSnapshot);
}

/** Verbindungsstatus des Browsers, reaktiv. */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return online;
}
