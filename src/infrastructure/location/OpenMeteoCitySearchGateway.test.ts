import { describe, expect, it } from 'vitest';
import { OpenMeteoCitySearchGateway } from './OpenMeteoCitySearchGateway';

describe('city search gateway', () => {
  it('keeps identical city names with different regions and zones distinct', async () => {
    const gateway = new OpenMeteoCitySearchGateway(async (input, init) => {
      expect(String(input)).toContain('language=ru');
      expect(init?.signal).toBeDefined();
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 2026126,
              name: 'Борзя',
              admin1: 'Забайкальский край',
              country: 'Россия',
              latitude: 50.39138,
              longitude: 116.53355,
              timezone: 'Asia/Chita',
            },
            {
              id: 6779633,
              name: 'Борзя',
              admin1: 'Амурская область',
              country: 'Россия',
              latitude: 49.33054,
              longitude: 129.84111,
              timezone: 'Asia/Yakutsk',
            },
          ],
        }),
      );
    });
    expect((await gateway.search('Борзя')).map((c) => [c.id, c.region])).toEqual([
      ['2026126', 'Забайкальский край'],
      ['6779633', 'Амурская область'],
    ]);
  });
  it('does not query partial names and rejects malformed answers', async () => {
    const gateway = new OpenMeteoCitySearchGateway(async () => new Response('{"results":42}'));
    expect(await gateway.search('Бо')).toEqual([]);
    await expect(gateway.search('Борзя')).rejects.toThrow();
  });
  it('preserves cancellation and transport failures', async () => {
    const controller = new AbortController();
    controller.abort();
    const gateway = new OpenMeteoCitySearchGateway(async (_input, init) => {
      init?.signal?.throwIfAborted();
      return new Response('{}');
    });
    await expect(gateway.search('Борзя', controller.signal)).rejects.toThrow();
    await expect(
      new OpenMeteoCitySearchGateway(async () => new Response('', { status: 503 })).search('Борзя'),
    ).rejects.toThrow();
  });
});
