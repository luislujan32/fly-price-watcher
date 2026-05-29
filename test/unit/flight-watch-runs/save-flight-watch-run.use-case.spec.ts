import { ConfigService } from '@nestjs/config';
import { SaveFlightWatchRunUseCase } from '../../../src/flight-watch-runs/application/use-cases/save-flight-watch-run.use-case';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { FlightWatchRunRepository } from '../../../src/flight-watch-runs/domain/repositories/flight-watch-run.repository';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuote } from '../../../src/flight-providers/domain/models/flight-quote.model';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { DataRetentionService } from '../../../src/shared/retention/data-retention.service';

describe('SaveFlightWatchRunUseCase', () => {
  it('creates a compact SUCCESS summary from quotes', () => {
    const useCase = new SaveFlightWatchRunUseCase(repository());

    const run = useCase.toRun({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [quote({ price: 250_000 }), quote({ price: 230_000, tags: ['CHEAPEST'] })],
      ranAt: new Date('2026-05-23T12:00:00.000Z'),
      alertsGenerated: 2,
    }).toPrimitives();

    expect(run).toMatchObject({
      searchId: 'search-1',
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      status: FlightWatchRunStatus.SUCCESS,
      route: 'JUJ-AEP',
      validOptionsCount: 2,
      currency: Currency.ARS,
      cheapestPrice: 230_000,
      recommendedPrice: 250_000,
      cheapestOptionCount: 1,
      alertsGenerated: 2,
      diagnosticsSummary: {
        rawCandidates: 8,
        discardedByAirport: 1,
        discardedByStops: 2,
        discardedByDate: 0,
        validCandidates: 5,
      },
    });
    expect(run.topOptions).toHaveLength(2);
    expect(run.cheapestOption?.outboundSummary).toBe('AR1517 JUJ-AEP 2026-12-20T12:00:00');
    expect(run.recommendedOption?.tags).toEqual(['RECOMMENDED', 'GOOD_TIME']);
    expect(run.diagnosticsDetails).toBeUndefined();
    expect(run.expiresAt).toEqual(new Date('2027-01-27T12:00:00.000Z'));
  });

  it('does not persist discarded reasons when provider diagnostics persistence is disabled', () => {
    const useCase = new SaveFlightWatchRunUseCase(repository(), config(false));

    const run = useCase.toRun({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [quote({ price: 230_000 })],
    }).toPrimitives();

    expect(run.diagnosticsSummary).toEqual({
      rawCandidates: 8,
      discardedByAirport: 1,
      discardedByStops: 2,
      discardedByDate: 0,
      validCandidates: 5,
    });
    expect(run.diagnosticsDetails).toBeUndefined();
  });

  it('persists diagnosticsDetails when provider diagnostics persistence is enabled', () => {
    const useCase = new SaveFlightWatchRunUseCase(repository(), config(true));

    const run = useCase.toRun({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [quote({ price: 230_000 })],
    }).toPrimitives();

    expect(run.diagnosticsSummary).toEqual({
      rawCandidates: 8,
      discardedByAirport: 1,
      discardedByStops: 2,
      discardedByDate: 0,
      validCandidates: 5,
    });
    expect(run.diagnosticsDetails).toEqual({
      discardedReasons: ['not persisted in run summary'],
    });
  });

  it('creates a NO_RESULTS run without options', () => {
    const useCase = new SaveFlightWatchRunUseCase(repository());

    const run = useCase.toRun({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [],
      ranAt: new Date('2026-05-23T12:00:00.000Z'),
    }).toPrimitives();

    expect(run).toMatchObject({
      status: FlightWatchRunStatus.NO_RESULTS,
      validOptionsCount: 0,
      topOptions: [],
      cheapestPrice: undefined,
      recommendedPrice: undefined,
    });
  });

  it('persists the run through the repository', async () => {
    const repo = repository();
    const useCase = new SaveFlightWatchRunUseCase(repo);

    await useCase.execute({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [quote({ price: 230_000 })],
    });

    expect(repo.create).toHaveBeenCalledTimes(1);
    expect((repo.create as jest.Mock).mock.calls[0][0].toPrimitives()).toMatchObject({
      status: FlightWatchRunStatus.SUCCESS,
      validOptionsCount: 1,
    });
  });

  it('sets expiresAt using the retention policy', () => {
    const useCase = new SaveFlightWatchRunUseCase(repository(), config(false), retention(10));

    const run = useCase.toRun({
      search: search(),
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      quotes: [quote({ price: 230_000 })],
    }).toPrimitives();

    expect(run.expiresAt).toEqual(new Date('2027-01-07T12:00:00.000Z'));
  });
});

function repository(): FlightWatchRunRepository {
  return {
    create: jest.fn(async (run) => run),
    updateAlertsGenerated: jest.fn(),
    findLatestSuccessfulBefore: jest.fn(),
    findLowestCheapestBefore: jest.fn(),
    findLatestBySearchId: jest.fn(),
  };
}

function config(persistProviderDiagnostics: boolean): ConfigService {
  return {
    get: jest.fn((key: string) => key === 'persistProviderDiagnostics' ? persistProviderDiagnostics : undefined),
  } as unknown as ConfigService;
}

function retention(days: number): DataRetentionService {
  return new DataRetentionService({
    get: jest.fn((key: string) => key === 'dataRetentionDaysAfterTrip' ? days : undefined),
  } as unknown as ConfigService);
}

function search(): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'Viaje Diciembre',
    origin: 'JUJ',
    destination: 'AEP',
    departureDate: new Date('2026-12-20T12:00:00.000Z'),
    returnDate: new Date('2026-12-28T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
  });
}

function quote(params: { price: number; tags?: FlightQuote['tags'] }): FlightQuote {
  const tags = params.tags ?? ['RECOMMENDED', 'GOOD_TIME'];
  return {
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    totalPrice: params.price,
    currency: Currency.ARS,
    capturedAt: new Date('2026-05-23T12:00:00.000Z'),
    itinerarySummary: 'AR1517 JUJ-AEP / AR1512 AEP-JUJ',
    outboundSegments: [
      {
        flightNumber: 'AR1517',
        origin: 'JUJ',
        destination: 'AEP',
        departureDateTime: '2026-12-20T12:00:00',
      },
    ],
    inboundSegments: [
      {
        flightNumber: 'AR1512',
        origin: 'AEP',
        destination: 'JUJ',
        departureDateTime: '2026-12-28T08:00:00',
      },
    ],
    outboundDepartureTime: '2026-12-20T12:00:00',
    inboundDepartureTime: '2026-12-28T08:00:00',
    fareName: 'Base',
    seatsAvailable: 4,
    hasStops: false,
    tags,
    metadata: {
      discardedDiagnostics: {
        rawCandidates: 8,
        discardedByAirport: 1,
        discardedByStops: 2,
        discardedByDate: 0,
        validCandidates: 5,
        discardedReasons: ['not persisted in run summary'],
      },
    },
  };
}
