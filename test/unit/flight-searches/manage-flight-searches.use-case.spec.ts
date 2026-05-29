import { ManageFlightSearchesUseCase } from '../../../src/flight-searches/application/use-cases/manage-flight-searches.use-case';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
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
    softDeleteById: jest.fn(async (id: string, deletedAt: Date) => {
      const item = searches.find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive: false, deletedAt }) : null;
    }),
    findActive: jest.fn(),
    findManageable: jest.fn(async () => searches),
    findWithoutTelegramChatId: jest.fn(),
    setTelegramChatIdForIds: jest.fn(),
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
