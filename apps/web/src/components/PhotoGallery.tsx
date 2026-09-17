import { useRef, useState } from 'react';
import type { PhotoDto } from '@womo/shared';
import { photoUrl, useDeletePhoto, useUploadPhoto } from '../api/hooks';
import { IconCamera, IconTrash } from './Icons';

interface Props {
  spotId: string;
  photos: PhotoDto[];
  editable: boolean;
}

export function PhotoGallery({ spotId, photos, editable }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const upload = useUploadPhoto(spotId);
  const remove = useDeletePhoto(spotId);
  const [error, setError] = useState<string | null>(null);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    // Nacheinander hochladen: der Server skaliert jedes Bild, parallel würde
    // das auf einem kleinen Server nur die Warteschlange verschieben.
    for (const file of Array.from(files)) {
      try {
        await upload.mutateAsync(file);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload fehlgeschlagen');
        break;
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  return (
    <div className="stack">
      {error && <div className="alert alert--error">{error}</div>}

      {photos.length > 0 && (
        <div className="gallery">
          {photos.map((photo) => (
            <div className="gallery__item" key={photo.id}>
              <a href={photoUrl(photo.id, 'original')} target="_blank" rel="noreferrer">
                <img
                  src={photoUrl(photo.id, 'thumb')}
                  alt={photo.caption ?? 'Foto zum Stellplatz'}
                  loading="lazy"
                  width={photo.width}
                  height={photo.height}
                />
              </a>
              {editable && (
                <button
                  type="button"
                  className="gallery__remove"
                  aria-label="Foto löschen"
                  onClick={() => remove.mutate(photo.id)}
                >
                  <IconTrash />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editable && (
        <>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            // capture="environment" öffnet auf dem Handy direkt die Kamera.
            capture="environment"
            multiple
            className="sr-only"
            onChange={(e) => void handleFiles(e.target.files)}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => fileInput.current?.click()}
            disabled={upload.isPending}
          >
            <IconCamera />
            {upload.isPending ? 'Wird hochgeladen …' : 'Foto hinzufügen'}
          </button>
        </>
      )}

      {!editable && photos.length === 0 && <p className="muted small">Keine Fotos vorhanden.</p>}
    </div>
  );
}
