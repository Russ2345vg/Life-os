import type { EveningReviewSnapshot, GetEveningReview } from '../../application';
import type { DayDate } from '../../domain';

export type EveningReviewLoadState =
  | Readonly<{ status: 'loading' }>
  | Readonly<{ status: 'error'; message: string }>
  | Readonly<{ status: 'ready'; snapshot: EveningReviewSnapshot }>;

export async function loadEveningReviewState(
  getEveningReview: Pick<GetEveningReview, 'execute'>,
  reviewDate?: DayDate,
): Promise<Exclude<EveningReviewLoadState, Readonly<{ status: 'loading' }>>> {
  try {
    return { status: 'ready', snapshot: await getEveningReview.execute(reviewDate) };
  } catch {
    return {
      status: 'error',
      message: 'Не удалось загрузить данные вечернего контроля',
    };
  }
}
