import { useRef, useState } from 'react';
import { useEigeneMusik, useLoescheMusik, useLadeMusikHoch } from '../../api/hooks';

/**
 * Eine eigene Tonspur je Reise.
 *
 * Der Weg fuer alles, was man selbst lizenziert hat -- etwa ein Stueck aus
 * einem Abo. Die Datei landet im Volume der Videos, nicht im Repository, und
 * verlaesst den Server nur als Teil des fertigen Videos.
 */
export function MusikUpload({ tripId, vorhanden }: { tripId: string; vorhanden: boolean }) {
  const feld = useRef<HTMLInputElement>(null);
  const hochladen = useLadeMusikHoch(tripId);
  const loeschen = useLoescheMusik(tripId);
  const [fehler, setFehler] = useState<string | null>(null);

  return (
    <span className="row">
      <input
        ref={feld}
        type="file"
        accept="audio/mpeg,audio/mp4,audio/aac,audio/ogg,audio/wav,.mp3,.m4a,.aac,.ogg,.wav"
        style={{ display: 'none' }}
        onChange={(e) => {
          const datei = e.target.files?.[0];
          e.target.value = '';
          if (!datei) return;
          setFehler(null);
          hochladen.mutate(datei, {
            onError: (err) => setFehler(err instanceof Error ? err.message : 'Fehlgeschlagen'),
          });
        }}
      />
      <button
        type="button"
        className="btn btn--small btn--ghost"
        disabled={hochladen.isPending}
        onClick={() => feld.current?.click()}
      >
        {vorhanden ? 'Eigene Datei ersetzen' : 'Eigene Datei hochladen'}
      </button>
      {vorhanden && (
        <button
          type="button"
          className="btn btn--small btn--danger"
          disabled={loeschen.isPending}
          onClick={() => loeschen.mutate()}
        >
          Entfernen
        </button>
      )}
      {fehler && <span className="field__error">{fehler}</span>}
    </span>
  );
}

/** Nur damit die Oberflaeche den Stand kennt, ohne ihn selbst zu halten. */
export function useMusikStand(tripId: string) {
  return useEigeneMusik(tripId);
}
