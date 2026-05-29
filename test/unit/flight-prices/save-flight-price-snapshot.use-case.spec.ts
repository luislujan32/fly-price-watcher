import { ConfigService } from '@nestjs/config';
import { SaveFlightPriceSnapshotUseCase } from '../../../src/flight-prices/application/use-cases/save-flight-price-snapshot.use-case';
import { FlightPriceRepository } from '../../../src/flight-prices/domain/repositories/flight-price.repository';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { DataRetentionService } from '../../../src/shared/retention/data-retention.service';

describe('SaveFlightPriceSnapshotUseCase', () => {
  it('sets expiresAt when saving snapshots with search context', async () => {
    const repo = repository();
    const useCase = new SaveFlightPriceSnapshotUseCase(repo, retention(30));

    await useCase.execute({
      searchId: 'search-1',
      providerCode: FlightProviderCode.FAKE,
      totalPrice: 100_000,
      currency: Currency.ARS,
      capturedAt: new Date('2026-05-24T12:00:00.000Z'),
      itinerarySummary: 'AEP -> MDZ',
    }, search());

    expect((repo.create as jest.Mock).mock.calls[0][0].expiresAt).toEqual(new Date('2026-08-14T12:00:00.000Z'));
  });
});

function repository(): FlightPriceRepository {
  return {
    create: jest.fn(async (snapshot) => snapshot),
    findBySearchAndProvider: jest.fn(),
    findLatestBySearchAndProvider: jest.fn(),
  };
}

function retention(days: number): DataRetentionService {
  return new DataRetentionService({
    get: jest.fn((key: string) => key === 'dataRetentionDaysAfterTrip' ? days : undefined),
  } as unknown as ConfigService);
}

function search(): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'AEP to MDZ',
    origin: 'AEP',
    destination: 'MDZ',
    departureDate: new Date('2026-07-15T12:00:00.000Z'),
    tripType: TripType.ONE_WAY,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
  });
}
