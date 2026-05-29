import { ConfigService } from '@nestjs/config';
import { FakeFlightProvider } from '../../../src/flight-providers/infrastructure/providers/fake/fake-flight.provider';
import { FakeProviderScenario } from '../../../src/flight-providers/infrastructure/providers/fake/fake-provider-scenario.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';

describe('FakeFlightProvider', () => {
  const query = {
    searchId: 'search-1',
    origin: 'AEP',
    destination: 'MDZ',
    departureDate: new Date('2026-07-15T00:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
  };

  it.each([
    [FakeProviderScenario.NORMAL, 180_000],
    [FakeProviderScenario.NO_CHANGE, 180_000],
    [FakeProviderScenario.PRICE_DROP, 130_000],
    [FakeProviderScenario.TARGET_REACHED, 145_000],
    [FakeProviderScenario.LOWEST_HISTORICAL, 90_000],
  ])('returns %s scenario price', async (scenario, expectedPrice) => {
    const provider = new FakeFlightProvider({
      get: jest.fn().mockReturnValue(scenario),
    } as unknown as ConfigService);

    const [quote] = await provider.search(query);

    expect(quote.totalPrice).toBe(expectedPrice);
    expect(quote.itinerarySummary).toContain(`fake:${scenario}`);
  });

  it('falls back to normal scenario when the env value is unknown', async () => {
    const provider = new FakeFlightProvider({
      get: jest.fn().mockReturnValue('unexpected'),
    } as unknown as ConfigService);

    const [quote] = await provider.search(query);

    expect(quote.totalPrice).toBe(180_000);
    expect(quote.itinerarySummary).toContain('fake:normal');
  });
});
