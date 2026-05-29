import { AerolineasResponseMapper } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-response.mapper';
import { AerolineasFlightOffersResponse } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas.types';
import { FlightProviderCode } from '../../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuery } from '../../../../src/flight-providers/domain/models/flight-query.model';
import { CabinClass } from '../../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../src/flight-searches/domain/enums/trip-type.enum';

describe('AerolineasResponseMapper', () => {
  const mapper = new AerolineasResponseMapper();

  afterEach(() => {
    delete process.env.MAX_QUOTES_PER_SEARCH;
  });

  it('keeps a valid direct one-way quote', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1910, total: 84_979 })],
      ]),
      capturedAt: new Date('2026-05-21T12:00:00.000Z'),
    });

    expect(result.diagnostics).toMatchObject({
      rawCandidates: 1,
      discardedByAirport: 0,
      discardedByStops: 0,
      validCandidates: 1,
    });
    expect(result.quotes[0]).toMatchObject({
      searchId: 'search-1',
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      totalPrice: 84_979,
      currency: Currency.ARS,
      itinerarySummary: 'AR1910 AEP-MDZ 2026-07-15T13:30:00 | Base seats=1',
      metadata: {
        actualOutboundOrigin: 'AEP',
        actualOutboundDestination: 'MDZ',
        hasStops: false,
        fareName: 'Base',
        seatsAvailable: 1,
      },
    });
  });

  it('returns multiple valid one-way quotes ordered by price and ranked', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1910, total: 90_000, departure: '2026-07-15T10:00:00' }),
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1410, total: 80_000, departure: '2026-07-15T06:15:00' }),
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1710, total: 85_000, departure: '2026-07-15T13:30:00' }),
        ],
      ]),
    });

    expect(result.quotes.map((quote) => quote.totalPrice)).toEqual([80_000, 85_000, 90_000]);
    expect(result.quotes[0]?.tags).toEqual(expect.arrayContaining(['CHEAPEST', 'EARLY_MORNING']));
    expect(result.quotes[1]?.tags).toEqual(expect.arrayContaining(['GOOD_TIME', 'RECOMMENDED']));
    expect(result.quotes[0]?.tags).not.toContain('RECOMMENDED');
    expect(result.quotes[1]?.outboundDepartureTime).toBe('2026-07-15T13:30:00');
  });

  it('groups Base Plus and Flex fares from the same flight into one leg option', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [groupWithFares({
          origin: 'AEP',
          destination: 'MDZ',
          flightNumber: 1910,
          fares: [
            ['Plus', 110_000],
            ['Base', 90_000],
            ['Flex', 140_000],
          ],
        })],
      ]),
    });

    expect(result.quotes).toHaveLength(1);
    const option = result.quotes[0]?.outboundOptions?.[0];
    expect(option).toMatchObject({
      flightNumber: 'AR1910',
      cheapestPrice: 90_000,
      cheapestFareName: 'Base',
    });
    expect(option?.fares?.map((fare) => [fare.fareName, fare.price])).toEqual([
      ['Base', 90_000],
      ['Plus', 110_000],
      ['Flex', 140_000],
    ]);
  });

  it('limits valid quotes with MAX_QUOTES_PER_SEARCH', () => {
    process.env.MAX_QUOTES_PER_SEARCH = '2';

    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1910, total: 90_000 }),
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1410, total: 80_000 }),
          group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1710, total: 85_000 }),
        ],
      ]),
    });

    expect(result.quotes).toHaveLength(2);
    expect(result.quotes.map((quote) => quote.totalPrice)).toEqual([80_000, 85_000]);
  });

  it('discards one-way quote that arrives at a different airport', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [group({ origin: 'AEP', destination: 'EZE', flightNumber: 1910, total: 84_979 })],
      ]),
    });

    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.discardedByAirport).toBe(1);
    expect(result.diagnostics.discardedReasons[0]?.details).toBe('expected=AEP-MDZ actual=AEP-EZE');
  });

  it('discards one-way quote with a stop', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1910, total: 84_979, stops: 1 })],
      ]),
    });

    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.discardedByStops).toBe(1);
  });

  it('keeps a valid direct round-trip quote', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: roundTripQuery(),
      response: responseWithBuckets([
        [group({ origin: 'JUJ', destination: 'AEP', flightNumber: 1519, total: 50_000, departure: '2026-10-10T18:35:00' })],
        [group({ origin: 'AEP', destination: 'JUJ', flightNumber: 1518, total: 60_000, departure: '2026-10-15T08:00:00' })],
      ]),
    });

    expect(result.quotes).toHaveLength(1);
    expect(result.quotes[0]?.totalPrice).toBe(110_000);
    expect(result.quotes[0]).toMatchObject({
      outboundPrice: 50_000,
      inboundPrice: 60_000,
      pricingSource: 'sum_of_bounds',
      outboundFareName: 'Base',
      inboundFareName: 'Base',
    });
    expect(result.quotes[0]?.metadata).toMatchObject({
      outboundPrice: 50_000,
      inboundPrice: 60_000,
      pricingSource: 'sum_of_bounds',
      actualOutboundOrigin: 'JUJ',
      actualOutboundDestination: 'AEP',
      actualInboundOrigin: 'AEP',
      actualInboundDestination: 'JUJ',
      hasStops: false,
    });
  });

  it('returns multiple valid round-trip quote combinations ordered by total price', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: roundTripQuery(),
      response: responseWithBuckets([
        [
          group({ origin: 'JUJ', destination: 'AEP', flightNumber: 1519, total: 50_000, departure: '2026-10-10T18:35:00' }),
          group({ origin: 'JUJ', destination: 'AEP', flightNumber: 1565, total: 45_000, departure: '2026-10-10T06:00:00' }),
        ],
        [
          group({ origin: 'AEP', destination: 'JUJ', flightNumber: 1518, total: 60_000, departure: '2026-10-15T08:00:00' }),
          group({ origin: 'AEP', destination: 'JUJ', flightNumber: 1564, total: 65_000, departure: '2026-10-15T19:00:00' }),
        ],
      ]),
    });

    expect(result.quotes.map((quote) => quote.totalPrice)).toEqual([105_000, 110_000, 110_000, 115_000]);
    expect(result.quotes[0]?.tags).toEqual(expect.arrayContaining(['CHEAPEST', 'EARLY_MORNING']));
    const recommended = result.quotes.find((quote) => quote.tags?.includes('RECOMMENDED'));
    expect(recommended?.tags).toEqual(expect.arrayContaining(['RECOMMENDED', 'GOOD_TIME']));
    expect(recommended?.inboundDepartureTime).toBe('2026-10-15T08:00:00');
    expect(recommended?.outboundOptions).toHaveLength(2);
    expect(recommended?.inboundOptions).toHaveLength(2);
    expect(recommended?.outboundOptions?.find((option) => option.isCheapest)?.flightNumber).toBe('AR1565');
    expect(recommended?.outboundOptions?.find((option) => option.isRecommended)?.flightNumber).toBe('AR1519');
    expect(recommended?.inboundOptions?.find((option) => option.isRecommended)?.flightNumber).toBe('AR1518');
  });

  it('discards round-trip when outbound arrives at EZE instead of AEP', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: roundTripQuery(),
      response: responseWithBuckets([
        [group({ origin: 'JUJ', destination: 'EZE', flightNumber: 1519, total: 50_000, departure: '2026-10-10T18:35:00' })],
        [group({ origin: 'AEP', destination: 'JUJ', flightNumber: 1518, total: 60_000, departure: '2026-10-15T08:00:00' })],
      ]),
    });

    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.discardedByAirport).toBe(1);
    expect(result.diagnostics.validCandidates).toBe(1);
  });

  it('discards round-trip with a stop', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: roundTripQuery(),
      response: responseWithBuckets([
        [group({ origin: 'JUJ', destination: 'AEP', flightNumber: 1519, total: 50_000, departure: '2026-10-10T18:35:00', stops: 1 })],
        [group({ origin: 'AEP', destination: 'JUJ', flightNumber: 1518, total: 60_000, departure: '2026-10-15T08:00:00' })],
      ]),
    });

    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.discardedByStops).toBe(1);
  });

  it('returns no quotes when offers are missing', () => {
    expect(mapper.toFlightQuotes({ searchId: 'search-1', response: {} })).toEqual([]);
  });

  it('diagnoses offers discarded by missing price', () => {
    const result = mapper.toFlightQuotesWithDiagnostics({
      searchId: 'search-1',
      query: oneWayQuery(),
      response: responseWithBuckets([
        [group({ origin: 'AEP', destination: 'MDZ', flightNumber: 1910, total: undefined })],
      ]),
    });

    expect(result.quotes).toEqual([]);
    expect(result.diagnostics.rawCandidates).toBe(1);
    expect(result.diagnostics.discardedByMissingPrice).toBe(1);
    expect(result.diagnostics.discardedReasons[0]?.reason).toBe('MISSING_PRICE');
  });
});

function oneWayQuery(): FlightQuery {
  return {
    searchId: 'search-1',
    origin: 'AEP',
    destination: 'MDZ',
    departureDate: new Date('2026-07-15T12:00:00.000Z'),
    tripType: TripType.ONE_WAY,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
  };
}

function roundTripQuery(): FlightQuery {
  return {
    searchId: 'search-1',
    origin: 'JUJ',
    destination: 'AEP',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    returnDate: new Date('2026-10-15T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
  };
}

function responseWithBuckets(buckets: Array<ReturnType<typeof group>[]>): AerolineasFlightOffersResponse {
  return {
    searchMetadata: {
      currency: 'ARS',
      flightType: buckets.length > 1 ? 'ROUND_TRIP' : 'ONE_WAY',
    },
    brandedOffers: Object.fromEntries(buckets.map((groups, index) => [String(index), groups])),
  };
}

function group(params: {
  origin: string;
  destination: string;
  flightNumber: number;
  total?: number;
  departure?: string;
  stops?: number;
}) {
  const departure = params.departure ?? '2026-07-15T13:30:00';
  return {
    legs: [
      {
        segments: params.stops
          ? [
            {
              flightNumber: params.flightNumber,
              airline: 'AR',
              departure,
              arrival: departure,
              origin: params.origin,
              destination: 'COR',
            },
            {
              flightNumber: params.flightNumber + 1,
              airline: 'AR',
              departure,
              arrival: departure,
              origin: 'COR',
              destination: params.destination,
            },
          ]
          : [
            {
              flightNumber: params.flightNumber,
              airline: 'AR',
              departure,
              arrival: departure,
              origin: params.origin,
              destination: params.destination,
            },
          ],
        stops: params.stops ?? 0,
        totalDuration: 120,
      },
    ],
    offers: [
      {
        brand: { id: 'EB', name: 'Base' },
        seatAvailability: { seats: 1 },
        fare: params.total === undefined ? {} : { total: params.total },
      },
    ],
  };
}

function groupWithFares(params: {
  origin: string;
  destination: string;
  flightNumber: number;
  fares: Array<[string, number]>;
  departure?: string;
}) {
  const departure = params.departure ?? '2026-07-15T13:30:00';
  return {
    legs: [
      {
        segments: [
          {
            flightNumber: params.flightNumber,
            airline: 'AR',
            departure,
            arrival: departure,
            origin: params.origin,
            destination: params.destination,
          },
        ],
        stops: 0,
        totalDuration: 120,
      },
    ],
    offers: params.fares.map(([name, total]) => ({
      brand: { id: name.toUpperCase(), name },
      seatAvailability: { seats: 3 },
      fare: { total },
    })),
  };
}
