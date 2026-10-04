import { useState } from 'react';
import type { DiaryService } from '../../../application/diary/DiaryService';
import { createDiaryDraft, diaryPeriod, DayDate, type DiaryDayPayload } from '../../../domain';
import type { Walk } from '../../../domain/walk/Walk';
import type { PlannerRoute } from '../PlannerNavigation';
import { walkError } from './useWalkState';
import { formatWalkReflectionSummary } from '../../../application/walk/WalkReflectionSummary';

export function WalkDiaryTransfer({
  walk,
  diary,
  onNavigate,
}: {
  walk: Walk;
  diary: DiaryService;
  onNavigate: (route: PlannerRoute) => void;
}) {
  const [preview, setPreview] = useState<{
    payload: DiaryDayPayload;
    version: number | null;
    completed: boolean;
  } | null>(null);
  const summary = formatWalkReflectionSummary(walk);
  const [text, setText] = useState(summary);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  if (!summary || walk.deletedAt) return null;
  const date = DayDate.create(walk.date.toString());
  const open = async () => {
    setBusy(true);
    setError('');
    try {
      const entry = await diary.get('day', date);
      const base =
        entry?.kind === 'day' ? entry : createDiaryDraft(diaryPeriod('day', date), new Date());
      setPreview({
        payload: base.payload,
        version: entry?.version ?? null,
        completed: entry?.status === 'completed',
      });
      setText(summary);
    } catch (failure: unknown) {
      setError(walkError(failure));
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!preview || !text.trim()) return;
    setBusy(true);
    setError('');
    try {
      const original = preview.payload.note?.trim() ?? '';
      const addition = text.trim();
      const note = original.includes(addition)
        ? original
        : [original, addition].filter(Boolean).join('\n\n');
      await diary.saveDraft({
        kind: 'day',
        anchor: date,
        expectedVersion: preview.version,
        payload: { ...preview.payload, note },
      });
      setSaved(true);
      setPreview(null);
    } catch (failure: unknown) {
      setError(walkError(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="walk-panel walk-diary-transfer">
      <h2>Итог в дневнике</h2>
      {saved ? (
        <>
          <p role="status">Итог добавлен в заметку дня.</p>
          <button
            onClick={() => onNavigate({ view: 'diary', period: 'day', date: date.toString() })}
          >
            Открыть дневник
          </button>
        </>
      ) : preview ? (
        <>
          <p>Запись за {date.toString()}. Текст добавится после существующей заметки.</p>
          {preview.completed && (
            <p>День уже завершён. Сохранение откроет его для редактирования.</p>
          )}
          {preview.payload.note && (
            <details>
              <summary>Текущая заметка</summary>
              <p>{preview.payload.note}</p>
            </details>
          )}
          <label>
            Текст для переноса
            <textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} />
          </label>
          <div className="walk-start-actions">
            <button
              className="planner-primary"
              disabled={busy || !text.trim()}
              onClick={() => void save()}
            >
              Добавить в заметку дня
            </button>
            <button disabled={busy} onClick={() => setPreview(null)}>
              Отмена
            </button>
          </div>
        </>
      ) : (
        <button disabled={busy} onClick={() => void open()}>
          Посмотреть перед переносом
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
