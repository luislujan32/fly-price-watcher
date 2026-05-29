import { AerolineasQueryMapper } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-query.mapper';
import { CabinClass } from '../../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../src/flight-searches/domain/enums/trip-type.enum';

describe('AerolineasQueryMapper', () => {
  const mapper = new AerolineasQueryMapper();

  it('maps one-way flight query to Aerolíneas query params', () => {
    const params = mapper.toQueryParams({
      searchId: 'search-1',
      origin: 'AEP',
      destination: 'MDZ',
      departureDate: new Date('2026-07-15T12:00:00.000Z'),
      tripType: TripType.ONE_WAY,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: 2,
    });

    expect(params).toEqual({
      adt: '2',
      chd: '0',
      inf: '0',
      flexDates: 'false',
      cabinClass: 'Economy',
      flightType: 'ONE_WAY',
      leg: ['AEP-MDZ-20260715'],
    });
  });

  it('maps round-trip query with two legs', () => {
    const params = mapper.toQueryParams({
      searchId: 'search-1',
      origin: 'AEP',
      destination: 'MDZ',
      departureDate: new Date('2026-07-15T12:00:00.000Z'),
      returnDate: new Date('2026-07-22T12:00:00.000Z'),
      tripType: TripType.ROUND_TRIP,
      cabinClass: CabinClass.PREMIUM_ECONOMY,
      currency: Currency.ARS,
      adults: 1,
      children: 1,
      infants: 1,
    });

    expect(params.cabinClass).toBe('PremiumEconomy');
    expect(params.flightType).toBe('ROUND_TRIP');
    expect(params.leg).toEqual(['AEP-MDZ-20260715', 'MDZ-AEP-20260722']);
    expect(params.chd).toBe('1');
    expect(params.inf).toBe('1');
  });

  it('requires returnDate for round-trip query', () => {
    expect(() =>
      mapper.toQueryParams({
        searchId: 'search-1',
        origin: 'AEP',
        destination: 'MDZ',
        departureDate: new Date('2026-07-15T12:00:00.000Z'),
        tripType: TripType.ROUND_TRIP,
        cabinClass: CabinClass.ECONOMY,
        currency: Currency.ARS,
        adults: 1,
      }),
    ).toThrow('Aerolíneas round-trip search requires returnDate.');
  });
});
