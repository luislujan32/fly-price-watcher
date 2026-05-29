import { ConfigService } from '@nestjs/config';
import { EvaluateFlightAlertsUseCase } from '../../../src/flight-alerts/application/use-cases/evaluate-flight-alerts.use-case';
import { FlightAlert } from '../../../src/flight-alerts/domain/entities/flight-alert.entity';
import { FlightAlertType } from '../../../src/flight-alerts/domain/enums/flight-alert-type.enum';
import { FlightAlertRepository } from '../../../src/flight-alerts/domain/repositories/flight-alert.repository';
import { AlertMatcherService } from '../../../src/flight-alerts/domain/services/alert-matcher.service';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { FlightWatchRun } from '../../../src/flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { FlightWatchRunRepository } from '../../../src/flight-watch-runs/domain/repositories/flight-watch-run.repository';
import { DataRetentionService } from '../../../src/shared/retention/data-retention.service';

describe('EvaluateFlightAlertsUseCase', () => {
  it('keeps normal daily summary deduplication when FORCE_DAILY_SUMMARY=false', async () => {
    const repository = repositoryWithExistingAlerts(true);
    const useCase = useCaseWith({ repository, forceDailySummary: false });

    const alerts = await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) });

    expect(alerts).toEqual([]);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows DAILY_SUMMARY notification when it already exists with FORCE_DAILY_SUMMARY=true', async () => {
    const repository = repositoryWithExistingAlerts(true);
    const useCase = useCaseWith({ repository, forceDailySummary: true });

    const alerts = await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) });

    expect(alerts.map((alert) => alert.alertType)).toEqual([FlightAlertType.DAILY_SUMMARY]);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not create duplicate DAILY_SUMMARY documents when FORCE_DAILY_SUMMARY=true', async () => {
    const repository = repositoryWithExistingAlerts(true);
    const useCase = useCaseWith({ repository, forceDailySummary: true });

    await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) });

    expect(repository.create).toHaveBeenCalledTimes(0);
  });

  it('keeps non-daily alert types deduplicated when FORCE_DAILY_SUMMARY=true', async () => {
    const repository = repositoryWithExistingAlerts(true);
    const useCase = useCaseWith({
      repository,
      forceDailySummary: true,
      previousSuccessfulRun: run({ cheapestPrice: 130_000, recommendedPrice: 130_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 125_000, ranAt: '2026-05-22T09:00:00.000Z' }),
    });

    const alerts = await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 110_000, recommendedPrice: 110_000 }) });

    expect(alerts.map((alert) => alert.alertType)).toEqual([FlightAlertType.DAILY_SUMMARY]);
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.existsForDay).toHaveBeenCalledWith(expect.objectContaining({
      alertType: FlightAlertType.PRICE_DROP_CHEAPEST,
    }));
    expect(repository.existsForDay).toHaveBeenCalledWith(expect.objectContaining({
      alertType: FlightAlertType.TARGET_PRICE_REACHED,
    }));
    expect(repository.existsForDay).toHaveBeenCalledWith(expect.objectContaining({
      alertType: FlightAlertType.LOWEST_HISTORICAL_PRICE,
    }));
  });

  it('does not throw E11000 duplicate key errors toward the watcher', async () => {
    const repository: FlightAlertRepository = {
      existsForDay: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockRejectedValue({ code: 11000, message: 'duplicate key error' }),
    };
    const useCase = useCaseWith({ repository, forceDailySummary: false });

    await expect(useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) })).resolves.toEqual([]);
  });

  it('returns a transient DAILY_SUMMARY if E11000 happens while FORCE_DAILY_SUMMARY=true', async () => {
    const repository: FlightAlertRepository = {
      existsForDay: jest.fn().mockResolvedValue(false),
      create: jest.fn().mockRejectedValue({ code: 11000, message: 'duplicate key error' }),
    };
    const useCase = useCaseWith({ repository, forceDailySummary: true });

    const alerts = await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) });

    expect(alerts.map((alert) => alert.alertType)).toEqual([FlightAlertType.DAILY_SUMMARY]);
  });

  it('sets expiresAt on created alerts using the current run trip dates', async () => {
    const repository = repositoryWithExistingAlerts(false);
    const useCase = useCaseWith({
      repository,
      forceDailySummary: false,
      retentionDays: 30,
    });

    await useCase.execute({ search: search(), currentRun: run({ cheapestPrice: 160_000 }) });

    expect((repository.create as jest.Mock).mock.calls[0][0].expiresAt).toEqual(new Date('2026-11-14T12:00:00.000Z'));
  });
});

function useCaseWith(params: {
  repository: FlightAlertRepository;
  forceDailySummary: boolean;
  previousSuccessfulRun?: FlightWatchRun | null;
  lowestCheapestRun?: FlightWatchRun | null;
  retentionDays?: number;
}): EvaluateFlightAlertsUseCase {
  const config = { get: jest.fn((key: string) => {
    if (key === 'forceDailySummary') {
      return params.forceDailySummary;
    }
    if (key === 'dataRetentionDaysAfterTrip') {
      return params.retentionDays;
    }
    return undefined;
  }) } as unknown as ConfigService;
  return new EvaluateFlightAlertsUseCase(
    new AlertMatcherService(),
    params.repository,
    {
      create: jest.fn(),
      updateAlertsGenerated: jest.fn(),
      findLatestSuccessfulBefore: jest.fn().mockResolvedValue(params.previousSuccessfulRun ?? null),
      findLowestCheapestBefore: jest.fn().mockResolvedValue(params.lowestCheapestRun ?? null),
      findLatestBySearchId: jest.fn(),
    } as unknown as FlightWatchRunRepository,
    config,
    new DataRetentionService(config),
  );
}

function repositoryWithExistingAlerts(exists: boolean): FlightAlertRepository {
  return {
    existsForDay: jest.fn().mockResolvedValue(exists),
    create: jest.fn(async (alert: FlightAlert) => alert),
  };
}

function search(): FlightSearch {
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
    targetPrice: 120_000,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
  });
}

function run(params: {
  cheapestPrice: number;
  recommendedPrice?: number;
  ranAt?: string;
  status?: FlightWatchRunStatus;
}): FlightWatchRun {
  const cheapestPrice = params.cheapestPrice;
  const recommendedPrice = params.recommendedPrice ?? cheapestPrice;
  return new FlightWatchRun({
    id: 'run-1',
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    ranAt: new Date(params.ranAt ?? '2026-05-23T10:00:00.000Z'),
    status: params.status ?? FlightWatchRunStatus.SUCCESS,
    route: 'JUJ-AEP',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    returnDate: new Date('2026-10-15T12:00:00.000Z'),
    validOptionsCount: 1,
    currency: Currency.ARS,
    cheapestPrice,
    recommendedPrice,
    topOptions: [],
    cheapestOptionCount: 1,
    recommendedOption: {
      price: recommendedPrice,
      currency: Currency.ARS,
      outboundSummary: 'AR1517 JUJ-AEP 2026-10-10T12:00:00',
      inboundSummary: 'AR1512 AEP-JUJ 2026-10-15T08:00:00',
      tags: ['RECOMMENDED'],
    },
  });
}
