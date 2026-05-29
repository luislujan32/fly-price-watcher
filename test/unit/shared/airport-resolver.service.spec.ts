import { AirportResolverService } from '../../../src/shared/airports/airport-resolver.service';

describe('AirportResolverService', () => {
  const resolver = new AirportResolverService();

  it('resolves by city, alias, airport name and IATA code', () => {
    expect(singleCode(resolver.resolve('jujuy'))).toBe('JUJ');
    expect(singleCode(resolver.resolve('JUJ'))).toBe('JUJ');
    expect(singleCode(resolver.resolve('aeroparque'))).toBe('AEP');
    expect(singleCode(resolver.resolve('ezeiza'))).toBe('EZE');
  });

  it('returns multiple options for Buenos Aires', () => {
    const result = resolver.resolve('buenos aires');

    expect(result).toMatchObject({
      type: 'multiple',
      airports: expect.arrayContaining([
        expect.objectContaining({ code: 'AEP' }),
        expect.objectContaining({ code: 'EZE' }),
      ]),
    });
  });

  it('normalizes accents and partial text', () => {
    expect(singleCode(resolver.resolve('cordoba'))).toBe('COR');
    expect(singleCode(resolver.resolve('matienzo'))).toBe('TUC');
  });
});

function singleCode(result: ReturnType<AirportResolverService['resolve']>): string | undefined {
  return result.type === 'single' ? result.airport.code : undefined;
}
