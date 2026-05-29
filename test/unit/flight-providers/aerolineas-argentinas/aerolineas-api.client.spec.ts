import { ConfigService } from '@nestjs/config';
import { AerolineasArgentinasApiClient } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-argentinas-api.client';
import { AerolineasHttpError } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-http.error';
import { AerolineasTokenProvider } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-token.provider';

describe('AerolineasArgentinasApiClient', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('throws AerolineasHttpError with status code when API rejects the request', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('{"errorMessage":"Unauthorized"}'),
    }) as unknown as typeof fetch;
    const client = new AerolineasArgentinasApiClient(
      configService(),
      { getToken: jest.fn().mockResolvedValue('token') } as unknown as AerolineasTokenProvider,
    );

    await expect(client.searchOffers(new URLSearchParams('adt=1'))).rejects.toMatchObject({
      name: 'AerolineasHttpError',
      statusCode: 401,
      responseBody: '{"errorMessage":"Unauthorized"}',
    } satisfies Partial<AerolineasHttpError>);
  });
});

function configService(): ConfigService {
  return {
    get: jest.fn((key: string) => {
      const values: Record<string, string | number> = {
        aerolineasApiBaseUrl: 'https://api.aerolineas.com.ar',
        aerolineasWebBaseUrl: 'https://www.aerolineas.com.ar',
        aerolineasHttpRetries: 0,
        aerolineasHttpTimeoutMs: 15000,
      };
      return values[key];
    }),
  } as unknown as ConfigService;
}
