import { JetSmartQueryMapper } from '../../../../src/flight-providers/infrastructure/providers/jetsmart/jetsmart-query.mapper';

describe('JetSmartQueryMapper', () => {
  const mapper = new JetSmartQueryMapper();

  it('builds query params for a specific leg', () => {
    const params = mapper.toSearchParamsForLeg({
      origin: 'AEP',
      destination: 'MDZ',
      date: new Date('2026-10-10T12:00:00.000Z'),
      pointOfSaleCountry: 'AR',
    });

    expect(params.getAll('bt_date')).toEqual(['2026-10-10 00:00:00', '2026-10-10 24:00:00']);
    expect(params.get('dep')).toBe('AEP');
    expect(params.get('arr')).toBe('MDZ');
    expect(params.get('pov_c')).toBe('AR');
    expect(params.get('_agg')).toBe('');
    expect(params.get('_meta')).toBe('');
  });

  it('builds query params from origin for connection discovery', () => {
    const params = mapper.toSearchParamsFromOrigin({
      origin: 'AEP',
      date: new Date('2026-10-10T12:00:00.000Z'),
      pointOfSaleCountry: 'AR',
    });

    expect(params.getAll('bt_date')).toEqual(['2026-10-10 00:00:00', '2026-10-10 24:00:00']);
    expect(params.get('dep')).toBe('AEP');
    expect(params.get('arr')).toBeNull();
    expect(params.get('pov_c')).toBe('AR');
  });
});
