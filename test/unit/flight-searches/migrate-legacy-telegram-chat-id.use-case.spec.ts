import { MigrateLegacyTelegramChatIdUseCase } from '../../../src/flight-searches/application/use-cases/migrate-legacy-telegram-chat-id.use-case';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { FlightSearchRepository } from '../../../src/flight-searches/domain/repositories/flight-search.repository';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';

describe('MigrateLegacyTelegramChatIdUseCase', () => {
  it('updates legacy searches without telegramChatId', async () => {
    const { useCase, repository } = fixture([
      search({ id: 'search-1', name: 'Viaje Octubre' }),
      search({ id: 'search-2', name: 'Viaje Diciembre' }),
    ]);

    const result = await useCase.execute('123');

    expect(repository.findWithoutTelegramChatId).toHaveBeenCalledTimes(1);
    expect(repository.setTelegramChatIdForIds).toHaveBeenCalledWith(['search-1', 'search-2'], '123');
    expect(result).toEqual({
      foundCount: 2,
      updatedCount: 2,
      updatedNames: ['Viaje Octubre', 'Viaje Diciembre'],
    });
  });

  it('does not update anything when there are no legacy searches', async () => {
    const { useCase, repository } = fixture([]);

    const result = await useCase.execute('123');

    expect(repository.setTelegramChatIdForIds).not.toHaveBeenCalled();
    expect(result).toEqual({
      foundCount: 0,
      updatedCount: 0,
      updatedNames: [],
    });
  });

  it('rejects an empty chat id', async () => {
    const { useCase, repository } = fixture([]);

    await expect(useCase.execute('   ')).rejects.toThrow('telegramChatId is required.');
    expect(repository.findWithoutTelegramChatId).not.toHaveBeenCalled();
  });

  it('ignores legacy records without id defensively', async () => {
    const { useCase, repository } = fixture([search({ id: undefined, name: 'Legacy sin id' })]);

    const result = await useCase.execute('123');

    expect(repository.setTelegramChatIdForIds).not.toHaveBeenCalled();
    expect(result).toEqual({
      foundCount: 1,
      updatedCount: 0,
      updatedNames: ['Legacy sin id'],
    });
  });
});

function fixture(legacySearches: FlightSearch[]): {
  useCase: MigrateLegacyTelegramChatIdUseCase;
  repository: jest.Mocked<FlightSearchRepository>;
} {
  const repository = {
    create: jest.fn(),
    upsertByName: jest.fn(),
    updateActiveByName: jest.fn(),
    updateActiveById: jest.fn(),
    softDeleteById: jest.fn(),
    findActive: jest.fn(),
    findManageable: jest.fn(),
    findWithoutTelegramChatId: jest.fn(async () => legacySearches),
    setTelegramChatIdForIds: jest.fn(async (ids: string[]) => ids.length),
    findByName: jest.fn(),
  } as unknown as jest.Mocked<FlightSearchRepository>;

  return {
    useCase: new MigrateLegacyTelegramChatIdUseCase(repository),
    repository,
  };
}

function search(overrides: Partial<ReturnType<FlightSearch['toPrimitives']>> = {}): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'Viaje Octubre',
    origin: 'JUJ',
    destination: 'AEP',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    returnDate: new Date('2026-10-15T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
    ...overrides,
  });
}
