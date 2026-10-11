import type { CitySearchGateway } from '../../application/ports/CitySearchGateway';
import { validateWalkCity, type WalkCity } from '../../domain/walk/SunsetWalkSchedule';
import { DomainError } from '../../shared/errors/DomainError';

/** Open-Meteo/GeoNames CC-BY attribution shown with city search results. Personal/noncommercial use. */
export class OpenMeteoCitySearchGateway implements CitySearchGateway {
  public constructor(
    private readonly fetcher: typeof fetch = (...args) => globalThis.fetch(...args),
  ) {}
  public async search(query: string, signal?: AbortSignal): Promise<readonly WalkCity[]> {
    const name = query.trim();
    if (name.length < 3) return [];
    if (name.length > 200)
      throw new DomainError('walk.city_search_invalid', 'Введите название города до 200 символов.');
    const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
    url.search = new URLSearchParams({
      name,
      language: 'ru',
      count: '10',
      format: 'json',
    }).toString();
    const timeout = AbortSignal.timeout(10000);
    const response = await this.fetcher(url, {
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    if (!response.ok)
      throw new DomainError('walk.city_search_failed', 'Не удалось найти город. Повторите поиск.');
    const body: unknown = await response.json();
    if (typeof body !== 'object' || body === null)
      throw new DomainError('walk.city_search_failed', 'Ответ поиска повреждён.');
    const results = (body as Record<string, unknown>).results;
    if (results === undefined) return [];
    if (!Array.isArray(results) || results.length > 10)
      throw new DomainError('walk.city_search_failed', 'Ответ поиска повреждён.');
    return results.map((result: unknown) => {
      if (typeof result !== 'object' || result === null)
        throw new DomainError('walk.city_search_failed', 'Ответ поиска повреждён.');
      const item = result as Record<string, unknown>;
      if (typeof item.id !== 'number' || !Number.isSafeInteger(item.id))
        throw new DomainError('walk.city_search_failed', 'Ответ поиска повреждён.');
      return validateWalkCity({
        id: String(item.id),
        name: item.name,
        region: item.admin1 ?? '',
        country: item.country,
        latitude: item.latitude,
        longitude: item.longitude,
        timeZone: item.timezone,
      });
    });
  }
}
