import { ConfigService } from '@nestjs/config';
import { FlightQuoteRankingService } from '../../../../src/flight-providers/application/services/flight-quote-ranking.service';
import { FlightProviderCode } from '../../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { JetSmartApiClient } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart-api.client';
import { JetSmartProvider } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart.provider';
import { JetSmartQueryMapper } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart-query.mapper';
import { JetSmartResponseMapper } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart-response.mapper';
import { CabinClass } from '../../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../src/flight-searches/domain/enums/trip-type.enum';

describe('JetSmartProvider', () => {
  function baseQuery() {
    return {
      searchId: 'search-1',
      origin: 'AEP',
      destination: 'MDZ',
      departureDate: new Date('2026-10-10T12:00:00.000Z'),
      tripType: TripType.ONE_WAY,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: 1,
    };
  }

  function fixture() {
    const config = {
      get: jest.fn((key: string) => key === 'jetsmartPointOfSaleCountry' ? 'AR' : undefined),
    } as unknown as ConfigService;

    const queryMapper = {
      toSearchParamsForLeg: jest.fn(() => new URLSearchParams('dep=AEP&arr=MDZ')),
      toSearchParamsFromOrigin: jest.fn(() => new URLSearchParams('dep=AEP')),
    } as unknown as jest.Mocked<JetSmartQueryMapper>;

    const apiClient = {
      searchAvailability: jest.fn(),
    } as unknown as jest.Mocked<JetSmartApiClient>;

    const responseMapper = {
      toFlightQuotes: jest.fn(),
      toConnectingQuotes: jest.fn(),
    } as unknown as jest.Mocked<JetSmartResponseMapper>;

    const ranking = {
      rank: jest.fn((quotes) => quotes),
    } as unknown as jest.Mocked<FlightQuoteRankingService>;

    const provider = new JetSmartProvider(config, queryMapper, apiClient, responseMapper, ranking);
    return { provider, apiClient, responseMapper, ranking };
  }

  it('does not search connections when allowStops is false', async () => {
    const { provider, apiClient, responseMapper } = fixture();
    apiClient.searchAvailability.mockResolvedValue({ availability: [] } as never);
    responseMapper.toFlightQuotes.mockReturnValue([]);

    const quotes = await provider.search({ ...baseQuery(), allowStops: false });

    expect(quotes).toEqual([]);
    expect(apiClient.searchAvailability).toHaveBeenCalledTimes(1);
    expect(responseMapper.toConnectingQuotes).not.toHaveBeenCalled();
  });

  it('does not search connections when allowStops is undefined', async () => {
    const { provider, apiClient, responseMapper } = fixture();
    apiClient.searchAvailability.mockResolvedValue({ availability: [] } as never);
    responseMapper.toFlightQuotes.mockReturnValue([]);

    const quotes = await provider.search(baseQuery());

    expect(quotes).toEqual([]);
    expect(apiClient.searchAvailability).toHaveBeenCalledTimes(1);
    expect(responseMapper.toConnectingQuotes).not.toHaveBeenCalled();
  });

  it('searches connections only when allowStops is true', async () => {
    const { provider, apiClient, responseMapper, ranking } = fixture();

    apiClient.searchAvailability
      .mockResolvedValueOnce({ availability: [] } as never)
      .mockResolvedValueOnce({ availability: [{ dep: 'AEP', arr: 'COR' }] } as never)
      .mockResolvedValueOnce({ availability: [{ dep: 'COR', arr: 'MDZ' }] } as never);

    responseMapper.toFlightQuotes.mockReturnValue([]);
    responseMapper.toConnectingQuotes.mockReturnValue([
      {
        searchId: 'search-1',
        providerCode: FlightProviderCode.JETSMART,
        totalPrice: 100_000,
        currency: Currency.ARS,
        capturedAt: new Date('2026-05-21T12:00:00.000Z'),
        itinerarySummary: 'JetSMART AEP-COR-MDZ 2026-10-10T12:00:00',
        hasStops: true,
      },
    ] as never);

    const quotes = await provider.search({ ...baseQuery(), allowStops: true });

    expect(responseMapper.toConnectingQuotes).toHaveBeenCalledTimes(1);
    expect(ranking.rank).toHaveBeenCalledTimes(1);
    expect(quotes[0]?.hasStops).toBe(true);
  });

  it('combines round-trip quotes without reusing first quote options for all combinations', async () => {
    const { provider, responseMapper } = fixture();

    const outboundA = {
      searchId: 'search-1',
      providerCode: FlightProviderCode.JETSMART,
      totalPrice: 100_000,
      currency: Currency.ARS,
      capturedAt: new Date('2026-05-21T12:00:00.000Z'),
      itinerarySummary: 'A out',
      outboundSegments: [{ flightNumber: 'OUT-A', origin: 'AEP', destination: 'MDZ', departureDateTime: '2026-10-10T10:00:00' }],
      outboundOptions: [{ legType: 'outbound', flightNumber: 'OUT-A', origin: 'AEP', destination: 'MDZ', departureDateTime: '2026-10-10T10:00:00', currency: Currency.ARS, cheapestPrice: 100_000 }],
      outboundDepartureTime: '2026-10-10T10:00:00',
      outboundFareName: 'JetSMART',
      fareName: 'JetSMART',
      hasStops: false,
    };
    const outboundB = {
      ...outboundA,
      totalPrice: 110_000,
      outboundSegments: [{ flightNumber: 'OUT-B', origin: 'AEP', destination: 'MDZ', departureDateTime: '2026-10-10T18:00:00' }],
      outboundOptions: [{ legType: 'outbound', flightNumber: 'OUT-B', origin: 'AEP', destination: 'MDZ', departureDateTime: '2026-10-10T18:00:00', currency: Currency.ARS, cheapestPrice: 110_000 }],
      outboundDepartureTime: '2026-10-10T18:00:00',
    };
    const inboundA = {
      ...outboundA,
      totalPrice: 120_000,
      outboundSegments: [{ flightNumber: 'IN-A', origin: 'MDZ', destination: 'AEP', departureDateTime: '2026-10-15T10:00:00' }],
      outboundOptions: [{ legType: 'outbound', flightNumber: 'IN-A', origin: 'MDZ', destination: 'AEP', departureDateTime: '2026-10-15T10:00:00', currency: Currency.ARS, cheapestPrice: 120_000 }],
      outboundDepartureTime: '2026-10-15T10:00:00',
      hasStops: false,
    };
    const inboundB = {
      ...inboundA,
      totalPrice: 130_000,
      outboundSegments: [{ flightNumber: 'IN-B', origin: 'MDZ', destination: 'AEP', departureDateTime: '2026-10-15T18:00:00' }],
      outboundOptions: [{ legType: 'outbound', flightNumber: 'IN-B', origin: 'MDZ', destination: 'AEP', departureDateTime: '2026-10-15T18:00:00', currency: Currency.ARS, cheapestPrice: 130_000 }],
      outboundDepartureTime: '2026-10-15T18:00:00',
    };

    responseMapper.toFlightQuotes
      .mockReturnValueOnce([outboundA as never, outboundB as never])
      .mockReturnValueOnce([inboundA as never, inboundB as never]);

    const quotes = await provider.search({
      ...baseQuery(),
      tripType: TripType.ROUND_TRIP,
      returnDate: new Date('2026-10-15T12:00:00.000Z'),
      allowStops: false,
    });

    expect(quotes).toHaveLength(4);

    const combo = quotes.find((quote: any) => quote.outboundDepartureTime === '2026-10-10T18:00:00' && quote.inboundDepartureTime === '2026-10-15T18:00:00');
    expect(combo?.outboundOptions?.[0]?.flightNumber).toBe('OUT-B');
    expect(combo?.inboundOptions?.[0]?.flightNumber).toBe('IN-B');
    expect(combo?.inboundOptions?.[0]?.legType).toBe('inbound');
  });

  it('returns empty list for round-trip when one leg has no quotes', async () => {
    const { provider, responseMapper } = fixture();
    responseMapper.toFlightQuotes
      .mockReturnValueOnce([])
      .mockReturnValueOnce([{ totalPrice: 10 } as never]);

    const quotes = await provider.search({
      ...baseQuery(),
      tripType: TripType.ROUND_TRIP,
      returnDate: new Date('2026-10-15T12:00:00.000Z'),
      allowStops: false,
    });

    expect(quotes).toEqual([]);
  });
});
