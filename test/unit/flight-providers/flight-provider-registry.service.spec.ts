import { FlightProviderRegistry } from '../../../src/flight-providers/application/services/flight-provider-registry.service';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightProviderPort } from '../../../src/flight-providers/domain/ports/flight-provider.port';

describe('FlightProviderRegistry', () => {
  const fakeProvider: FlightProviderPort = {
    code: FlightProviderCode.FAKE,
    search: jest.fn(),
  };

  it('returns enabled providers', () => {
    const registry = new FlightProviderRegistry([fakeProvider]);

    expect(registry.getEnabledProviders()).toEqual([fakeProvider]);
  });

  it('returns provider by code', () => {
    const registry = new FlightProviderRegistry([fakeProvider]);

    expect(registry.getByCode(FlightProviderCode.FAKE)).toBe(fakeProvider);
  });

  it('throws when provider is not registered', () => {
    const registry = new FlightProviderRegistry([]);

    expect(() => registry.getByCode(FlightProviderCode.FLYBONDI)).toThrow(
      'Flight provider not registered: FLYBONDI',
    );
  });
});
