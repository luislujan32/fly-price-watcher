import { ManageFlightSearchesUseCase } from '../../../src/flight-searches/application/use-cases/manage-flight-searches.use-case';
import { FlightSearch, FlightSearchPausedReason } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { FlightSearchRepository } from '../../../src/flight-searches/domain/repositories/flight-search.repository';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';

describe('ManageFlightSearchesUseCase', () => {
  it('lists manageable searches scoped by telegramChatId', async () => {
    const { useCase, repository } = fixture();

    await useCase.listManageable('123');

    expect(repository.findManageable).toHaveBeenCalledWith('123');
  });

  it('pauses searches using the scoped display index', async () => {
    const { useCase, repository } = fixture([search()]);

    await useCase.pauseByDisplayIndex(1, '123');

    expect(repository.findManageable).toHaveBeenCalledWith('123');
    expect(repository.updateActiveById).toHaveBeenCalledWith('search-1', false, '123');
  });

  it('does not pause a search outside the scoped list', async () => {
    const { useCase, repository } = fixture([]);

    const result = await useCase.pauseByDisplayIndex(1, '123');

    expect(result).toBeNull();
    expect(repository.updateActiveById).not.toHaveBeenCalled();
  });

  it('soft deletes searches using the scoped display index', async () => {
    const { useCase, repository } = fixture([search()]);

    await useCase.softDeleteByDisplayIndex(1, '123');

    expect(repository.softDeleteById).toHaveBeenCalledWith('search-1', expect.any(Date), '123');
  });

  it('renews a paused search and resets renewal counters', async () => {
    const { useCase, repository } = fixture([search({ isActive: false, requiresRenewal: true, notificationCountSinceRenewal: 5 })]);

    await useCase.renewByDisplayIndex(1, '123');

    expect(repository.updateLifecycleByIdForChat).toHaveBeenCalledWith('search-1', '123', {
      isActive: true,
      notificationCountSinceRenewal: 0,
      requiresRenewal: false,
      renewalRequestedAt: null,
      pausedReason: null,
    });
  });

  it('marks a search as renewal required when the notification limit is reached', async () => {
    const { useCase, repository } = fixture([search({ notificationCountSinceRenewal: 4 })]);
    const at = new Date('2026-06-07T12:00:00.000Z');

    await useCase.recordAutomaticNotification(search({ notificationCountSinceRenewal: 4 }), 5, at);

    expect(repository.updateLifecycleById).toHaveBeenCalledWith('search-1', {
      notificationCountSinceRenewal: 5,
      renewalLimit: 5,
      isActive: false,
      requiresRenewal: true,
      renewalRequestedAt: at,
      pausedReason: FlightSearchPausedReason.RENEWAL_REQUIRED,
    });
  });
});

function fixture(searches: FlightSearch[] = []): {
  useCase: ManageFlightSearchesUseCase;
  repository: jest.Mocked<FlightSearchRepository>;
} {
  const repository = {
    create: jest.fn(),
    upsertByName: jest.fn(),
    updateActiveByName: jest.fn(),
    updateActiveById: jest.fn(async (id: string, isActive: boolean) => {
      const item = searches.find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive }) : null;
    }),
    updateLifecycleById: jest.fn(async (id: string, updates: object) => {
      const item = searches.find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), ...updates }) : null;
    }),
    updateLifecycleByIdForChat: jest.fn(async (id: string, _chatId: string, updates: object) => {
      const item = searches.find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), ...updates }) : null;
    }),
    softDeleteById: jest.fn(async (id: string, deletedAt: Date) => {
      const item = searches.find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive: false, deletedAt }) : null;
    }),
    findActive: jest.fn(),
    findManageable: jest.fn(async () => searches),
    findWithoutTelegramChatId: jest.fn(),
    setTelegramChatIdForIds: jest.fn(),
    findById: jest.fn(),
    findByIdForChat: jest.fn(),
    findByName: jest.fn(),
  } as unknown as jest.Mocked<FlightSearchRepository>;

  return {
    useCase: new ManageFlightSearchesUseCase(repository),
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
