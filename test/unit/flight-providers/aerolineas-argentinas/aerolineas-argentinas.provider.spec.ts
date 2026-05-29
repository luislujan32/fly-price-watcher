import { AerolineasArgentinasProvider } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-argentinas.provider';
import { AerolineasArgentinasApiClient } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-argentinas-api.client';
import { AerolineasQueryMapper } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-query.mapper';
import { AerolineasResponseMapper } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-response.mapper';
import { CabinClass } from '../../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../src/flight-searches/domain/enums/trip-type.enum';

const fixture = require('../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/fixtures/one-way-aep-mdz.json');

describe('AerolineasArgentinasProvider', () => {
  it('delegates API call and maps response to quotes', async () => {
    const apiClient = {
      searchOffers: jest.fn().mockResolvedValue(fixture),
    };
    const provider = new AerolineasArgentinasProvider(
      new AerolineasQueryMapper(),
      apiClient as unknown as AerolineasArgentinasApiClient,
      new AerolineasResponseMapper(),
    );

    const quotes = await provider.search({
      searchId: 'search-1',
      origin: 'AEP',
      destination: 'MDZ',
      departureDate: new Date('2026-07-15T12:00:00.000Z'),
      tripType: TripType.ONE_WAY,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: 1,
    });

    expect(apiClient.searchOffers).toHaveBeenCalledWith(expect.any(URLSearchParams));
    expect(quotes.length).toBeGreaterThanOrEqual(1);
    expect(quotes[0]?.totalPrice).toBe(84979);
    expect(quotes[0]?.outboundOptions?.[0]?.fares?.length).toBeGreaterThanOrEqual(2);
    expect(quotes[0]?.tags).toEqual(expect.arrayContaining(['CHEAPEST', 'RECOMMENDED']));
  });
});
