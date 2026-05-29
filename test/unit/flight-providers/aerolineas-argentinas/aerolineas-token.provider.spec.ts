import { ConfigService } from '@nestjs/config';
import { AerolineasTokenProvider } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-token.provider';

describe('AerolineasTokenProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('extracts the access token from homepage HTML', () => {
    const provider = new AerolineasTokenProvider({ get: jest.fn() } as unknown as ConfigService);

    expect(provider.extractToken('<script>window.__ACCESS_TOKEN__ = "abc.def.ghi";</script>')).toBe('abc.def.ghi');
  });

  it('fetches and caches token using JWT exp', async () => {
    const futureExp = Math.floor(Date.now() / 1000) + 3600;
    const token = `header.${Buffer.from(JSON.stringify({ exp: futureExp })).toString('base64url')}.signature`;
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(`<script>window.__ACCESS_TOKEN__ = "${token}";</script>`),
    });
    global.fetch = fetchMock as unknown as typeof fetch;
    const provider = new AerolineasTokenProvider({
      get: jest.fn((key: string) => {
        const values: Record<string, string | number> = {
          aerolineasWebBaseUrl: 'https://www.aerolineas.com.ar',
          aerolineasTokenTtlSeconds: 900,
        };
        return values[key];
      }),
    } as unknown as ConfigService);

    await expect(provider.getToken()).resolves.toBe(token);
    await expect(provider.getToken()).resolves.toBe(token);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws a controlled error when the token is missing', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue('<html></html>'),
    }) as unknown as typeof fetch;
    const provider = new AerolineasTokenProvider({ get: jest.fn() } as unknown as ConfigService);

    await expect(provider.getToken()).rejects.toThrow(
      'Aerolíneas access token was not found in the homepage HTML.',
    );
  });
});
