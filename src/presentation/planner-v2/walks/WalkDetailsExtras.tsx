import { useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { Walk } from '../../../domain/walk/Walk';
import type { WalkCapture } from '../../../domain/walk-capture/WalkCapture';
import { MAX_WALK_PHOTO_BYTES } from '../../../domain/walk/WalkPhoto';
import { useWalkMutation, walkError } from './useWalkState';
export function WalkDetailsExtras({
  services,
  walk,
  captures,
  onChanged,
}: {
  services: WalkServices;
  walk: Walk;
  captures: readonly WalkCapture[];
  onChanged: () => void;
}) {
  const mutation = useWalkMutation();
  const [photoError, setPhotoError] = useState('');
  const target = (requestId: string) => ({
    requestId,
    walkId: walk.id.toString(),
    expectedVersion: walk.version,
  });
  return (
    <section className="walk-recent">
      <h2>Сохранённые мысли</h2>
      {captures.length ? (
        captures.map((capture) => (
          <article className="walk-saved-note" key={capture.id.toString()}>
            <p>{capture.content}</p>
          </article>
        ))
      ) : (
        <p>Во время этой прогулки нет записанных мыслей.</p>
      )}
      {walk.photo && <img className="walk-photo" src={walk.photo.dataUrl} alt="Фото прогулки" />}
      {walk.status === 'completed' && !walk.deletedAt && (
        <div className="walk-form">
          <label>
            Фото прогулки — JPEG, PNG, WebP до 5 МБ
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={mutation.busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                event.target.value = '';
                setPhotoError('');
                if (file.size > MAX_WALK_PHOTO_BYTES) {
                  setPhotoError('Выберите фотографию до 5 МБ.');
                  return;
                }
                void mutation
                  .perform(
                    `photo:${walk.id}:${walk.version}:${file.name}:${file.lastModified}`,
                    async (requestId) => {
                      const photo = await services.photoReader.read({
                        bytes: new Uint8Array(await file.arrayBuffer()),
                        mimeType: file.type,
                      });
                      return services.commands.updatePhoto({ ...target(requestId), photo });
                    },
                    onChanged,
                  )
                  .catch((error: unknown) => setPhotoError(walkError(error)));
              }}
            />
          </label>
          {walk.photo && (
            <button
              disabled={mutation.busy}
              onClick={() =>
                void mutation.perform(
                  `removePhoto:${walk.id}:${walk.version}`,
                  (requestId) =>
                    services.commands.updatePhoto({ ...target(requestId), photo: null }),
                  onChanged,
                )
              }
            >
              Удалить фото
            </button>
          )}
        </div>
      )}
      {photoError && <p role="alert">{photoError}</p>}
      {mutation.error && <p role="alert">{mutation.error}</p>}
      {walk.deletedAt ? (
        <>
          <p>Прогулка удалена. История и мысли сохранены.</p>
          <button
            disabled={mutation.busy}
            onClick={() =>
              void mutation.perform(
                `restore:${walk.id}:${walk.version}`,
                (requestId) => services.commands.restore(target(requestId)),
                onChanged,
              )
            }
          >
            Восстановить прогулку
          </button>
        </>
      ) : (
        <details className="walk-guidance">
          <summary>Управление записью</summary>
          <p>
            Удалённую прогулку можно восстановить из истории. Мысли останутся в разделе «Мысли».
          </p>
          <button
            disabled={mutation.busy}
            onClick={() =>
              void mutation.perform(
                `remove:${walk.id}:${walk.version}`,
                (requestId) => services.commands.remove(target(requestId)),
                onChanged,
              )
            }
          >
            Удалить прогулку
          </button>
        </details>
      )}
    </section>
  );
}
