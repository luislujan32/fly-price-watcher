import { FlightQuoteRankingService } from '../../../../src/flight-providers/application/services/flight-quote-ranking.service';
import { JetSmartResponseMapper } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart-response.mapper';
import { CabinClass } from '../../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../src/flight-searches/domain/enums/trip-type.enum';

describe('JetSmartResponseMapper', () => {
  const mapper = new JetSmartResponseMapper(new FlightQuoteRankingService());

  it('maps a direct one-way quote', () => {
    const quotes = mapper.toFlightQuotes({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: {
        availability: [
          {
            dep: 'AEP',
            arr: 'MDZ',
            fn: 'JA1001',
            date: '2026-10-10 10:00:00',
            p: { ars: 100_000 },
          },
        ],
      },
    });

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      totalPrice: 100_000,
      pricingSource: 'provider_total',
      hasStops: false,
      itinerarySummary: 'JetSMART AEP-MDZ 2026-10-10T10:00:00',
    });
  });

  it('maps a round-trip quote and combines outbound + inbound prices', () => {
    const quotes = mapper.toFlightQuotes({
      searchId: 'search-1',
      query: roundTripQuery(),
      response: {
        availability: [
          {
            dep: 'AEP',
            arr: 'MDZ',
            fn: 'JA1001',
            date: '2026-10-10 10:00:00',
            p: { ars: 90_000 },
            rfb: {
              dep: 'MDZ',
              arr: 'AEP',
              fn: 'JA1002',
              date: '2026-10-15 20:00:00',
              p: { ars: 110_000 },
            },
          },
        ],
      },
    });

    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({
      outboundPrice: 90_000,
      inboundPrice: 110_000,
      totalPrice: 200_000,
      pricingSource: 'sum_of_bounds',
    });
  });

  it('returns empty array when there are no matching results', () => {
    const quotes = mapper.toFlightQuotes({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: { availability: [] },
    });

    expect(quotes).toEqual([]);
  });

  it('discards candidates with missing price', () => {
    const quotes = mapper.toFlightQuotes({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: {
        availability: [
          {
            dep: 'AEP',
            arr: 'MDZ',
            fn: 'JA1001',
            date: '2026-10-10 10:00:00',
          },
        ],
      },
    });

    expect(quotes).toEqual([]);
  });

  it('ranks and marks a recommended option', () => {
    const quotes = mapper.toFlightQuotes({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: {
        availability: [
          {
            dep: 'AEP',
            arr: 'MDZ',
            fn: 'JA1001',
            date: '2026-10-10 05:00:00',
            p: { ars: 80_000 },
          },
          {
            dep: 'AEP',
            arr: 'MDZ',
            fn: 'JA1002',
            date: '2026-10-10 10:00:00',
            p: { ars: 85_000 },
          },
        ],
      },
    });

    const recommended = quotes.find((quote: any) => quote.tags?.includes('RECOMMENDED'));
    expect(recommended?.outboundDepartureTime).toBe('2026-10-10T10:00:00');
  });
});

function oneWayQuery() {
  return {
    searchId: 'search-1',
    origin: 'AEP',
    destination: 'MDZ',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    tripType: TripType.ONE_WAY,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    allowStops: false,
  };
}

function roundTripQuery() {
  return {
    ...oneWayQuery(),
    returnDate: new Date('2026-10-15T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
  };
}
