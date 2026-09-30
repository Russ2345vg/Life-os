import { useEffect, useRef, useState } from 'react';
import { EntityId } from '../../../domain';
import type { MemoryServices } from '../../../application/memory/MemoryServices';
import { useSyncContentChanged } from '../../sync/SyncStatusContext';
import { memoryError } from './memoryPresentation';

export function MemoryPhotoPreview({
  id,
  revision,
  queries,
}: {
  readonly id: string;
  readonly revision: number;
  readonly queries: MemoryServices['queries'];
}) {
  const element = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(() => typeof IntersectionObserver === 'undefined');
  const [refresh, setRefresh] = useState(0);
  const [image, setImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useSyncContentChanged('memoryEvents|sync_attachment_queue', () =>
    setRefresh((value) => value + 1),
  );
  useEffect(() => {
    const target = element.current;
    if (!target) return;
    if (typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(target);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!visible) return;
    let active = true;
    void queries
      .get(EntityId.create(id))
      .then((event) => {
        if (active) {
          setImage(event?.photo?.dataUrl ?? null);
          setError(null);
        }
      })
      .catch((error: unknown) => {
        if (active) setError(memoryError(error));
      });
    return () => {
      active = false;
    };
  }, [visible, id, revision, refresh, queries]);
  return (
    <div ref={element} className="memory-photo-slot">
      {image ? (
        <img className="memory-photo" src={image} alt="Фотография воспоминания" loading="lazy" />
      ) : error ? (
        <div className="memory-pending" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRefresh((value) => value + 1)}>
            Повторить загрузку фото
          </button>
        </div>
      ) : (
        <div className="memory-pending" role="status">
          Фотография загружается<small>История уже доступна</small>
        </div>
      )}
    </div>
  );
}
