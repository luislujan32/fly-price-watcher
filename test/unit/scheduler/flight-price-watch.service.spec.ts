import { FlightPriceWatchService } from '../../../src/scheduler/application/services/flight-price-watch.service';
import { ConfigService } from '@nestjs/config';
import { AlertMessageFormatter } from '../../../src/flight-alerts/domain/services/alert-message.formatter';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightProviderRegistry } from '../../../src/flight-providers/application/services/flight-provider-registry.service';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { FlightPriceSnapshot } from '../../../src/flight-prices/domain/entities/flight-price-snapshot.entity';
import { FlightAlert } from '../../../src/flight-alerts/domain/entities/flight-alert.entity';
import { FlightAlertType } from '../../../src/flight-alerts/domain/enums/flight-alert-type.enum';
import { ListActiveFlightSearchesUseCase } from '../../../src/flight-searches/application/use-cases/list-active-flight-searches.use-case';
import { FindFlightSearchByIdUseCase } from '../../../src/flight-searches/application/use-cases/find-flight-search-by-id.use-case';
import { SaveFlightPriceSnapshotUseCase } from '../../../src/flight-prices/application/use-cases/save-flight-price-snapshot.use-case';
import { EvaluateFlightAlertsUseCase } from '../../../src/flight-alerts/application/use-cases/evaluate-flight-alerts.use-case';
import { NotificationService } from '../../../src/notifications/application/services/notification.service';
import { SaveFlightWatchRunUseCase } from '../../../src/flight-watch-runs/application/use-cases/save-flight-watch-run.use-case';
import { FlightWatchRun } from '../../../src/flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { Logger } from '@nestjs/common';

describe('FlightPriceWatchService', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  function createFixture(params: {
    persistPriceSnapshots?: boolean;
    enableVerboseWatchLogs?: boolean;
    alertTypes?: FlightAlertType[];
  } = {}) {
    const persistPriceSnapshots = params.persistPriceSnapshots ?? false;
    const enableVerboseWatchLogs = params.enableVerboseWatchLogs ?? false;
    const alertTypes = params.alertTypes ?? [FlightAlertType.DAILY_SUMMARY];
    const search = new FlightSearch({
      id: 'search-1',
      name: 'AEP to MDZ',
      origin: 'AEP',
      destination: 'MDZ',
      departureDate: new Date('2026-07-15T00:00:00.000Z'),
      tripType: TripType.ONE_WAY,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: 1,
      notifyOnPriceDrop: true,
      notifyAlways: true,
      isActive: true,
    });
    const quote = {
      searchId: 'search-1',
      providerCode: FlightProviderCode.FAKE,
      totalPrice: 100_000,
      currency: Currency.ARS,
      capturedAt: new Date('2026-05-21T12:00:00.000Z'),
      itinerarySummary: 'AEP -> MDZ',
    };
    const snapshot = new FlightPriceSnapshot(quote);
    const alerts = alertTypes.map((alertType) => new FlightAlert({
      searchId: 'search-1',
      providerCode: FlightProviderCode.FAKE,
      alertType,
      alertDate: '2026-05-21',
      message: alertType,
    }));
    const provider = {
      code: FlightProviderCode.FAKE,
      search: jest.fn().mockResolvedValue([quote]),
    };
    const watchRun = new FlightWatchRun({
      id: 'run-1',
      searchId: 'search-1',
      providerCode: FlightProviderCode.FAKE,
      ranAt: new Date('2026-05-21T12:00:00.000Z'),
      status: FlightWatchRunStatus.SUCCESS,
      route: 'AEP-MDZ',
      departureDate: new Date('2026-07-15T00:00:00.000Z'),
      validOptionsCount: 1,
      currency: Currency.ARS,
      cheapestPrice: 100_000,
      recommendedPrice: 100_000,
      cheapestOptionCount: 1,
      topOptions: [],
      recommendedOption: {
        price: 100_000,
        currency: Currency.ARS,
        fareName: 'Base',
        seatsAvailable: 2,
        outboundSummary: 'AR1234 AEP-MDZ 2026-07-15T12:00:00',
        tags: ['CHEAPEST', 'GOOD_TIME', 'RECOMMENDED'],
      },
    });
    const saveSnapshot = { execute: jest.fn().mockResolvedValue(snapshot) };
    const evaluateAlerts = { execute: jest.fn().mockResolvedValue(alerts) };
    const saveWatchRun = {
      execute: jest.fn().mockResolvedValue(watchRun),
      updateAlertsGenerated: jest.fn().mockResolvedValue(watchRun),
    };
    const notifications = { send: jest.fn().mockResolvedValue({ attempts: 1, successes: 1, failures: 0 }) };
    const service = new FlightPriceWatchService(
      { execute: jest.fn().mockResolvedValue([search]) } as unknown as ListActiveFlightSearchesUseCase,
      { execute: jest.fn().mockResolvedValue(search) } as unknown as FindFlightSearchByIdUseCase,
      new FlightProviderRegistry([provider]),
      saveSnapshot as unknown as SaveFlightPriceSnapshotUseCase,
      evaluateAlerts as unknown as EvaluateFlightAlertsUseCase,
      saveWatchRun as unknown as SaveFlightWatchRunUseCase,
      notifications as unknown as NotificationService,
      new AlertMessageFormatter(),
      {
        get: jest.fn((key: string) => {
          if (key === 'persistPriceSnapshots') {
            return persistPriceSnapshots;
          }
          if (key === 'enableVerboseWatchLogs') {
            return enableVerboseWatchLogs;
          }
          return undefined;
        }),
      } as unknown as ConfigService,
    );

    return { service, provider, saveSnapshot, evaluateAlerts, saveWatchRun, notifications };
  }

  it('runs the watcher once and reports execution counters when snapshot persistence is enabled', async () => {
    const { service, provider, saveSnapshot, evaluateAlerts, saveWatchRun } = createFixture({ persistPriceSnapshots: true });

    const result = await service.runOnce();

    expect(provider.search).toHaveBeenCalled();
    expect(saveSnapshot.execute).toHaveBeenCalledTimes(1);
    expect(saveWatchRun.execute).toHaveBeenCalledTimes(1);
    expect(evaluateAlerts.execute).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      activeSearches: 1,
      providerCodes: [FlightProviderCode.FAKE],
      snapshotsSaved: 1,
      alertsGenerated: 1,
      watchRunsSaved: 1,
      notificationsSent: 1,
      notificationAttempts: 1,
      notificationSuccesses: 1,
      notificationFailures: 0,
      errors: 0,
      noResultsRuns: 0,
      validOptionsFound: 1,
      status: FlightWatchRunStatus.SUCCESS,
    });
  });

  it('does not save price snapshots when snapshot persistence is disabled', async () => {
    const { service, saveSnapshot, evaluateAlerts, saveWatchRun } = createFixture({ persistPriceSnapshots: false });

    const result = await service.runOnce();

    expect(saveSnapshot.execute).not.toHaveBeenCalled();
    expect(saveWatchRun.execute).toHaveBeenCalledTimes(1);
    expect(evaluateAlerts.execute).toHaveBeenCalledTimes(1);
    expect(result.snapshotsSaved).toBe(0);
    expect(result.watchRunsSaved).toBe(1);
    expect(result.alertsGenerated).toBe(1);
  });

  it('runs the watcher for a single search by id', async () => {
    const { service, provider } = createFixture();

    const result = await service.runOnceForSearch('search-1');

    expect(provider.search).toHaveBeenCalledTimes(1);
    expect(result.activeSearches).toBe(1);
    expect(result.validOptionsFound).toBe(1);
    expect(result.bestQuote?.totalPrice).toBe(100_000);
    expect(result.latestSuccessfulRun?.recommendedPrice).toBe(100_000);
  });

  it('sends initial summary for a single search even when no alerts are generated', async () => {
    const { service, notifications } = createFixture({ alertTypes: [] });

    const result = await service.runOnceForSearch('search-1', { sendInitialSummary: true });

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      title: 'INITIAL_SUMMARY',
      body: expect.stringContaining('🔎 Resultado inicial'),
      metadata: expect.objectContaining({ notificationType: 'INITIAL_SUMMARY' }),
    }));
    expect(result.alertsGenerated).toBe(0);
    expect(result.notificationAttempts).toBe(1);
    expect(result.bestQuote?.totalPrice).toBe(100_000);
    expect(result.latestSuccessfulRun?.status).toBe(FlightWatchRunStatus.SUCCESS);
  });

  it('does not duplicate alert notification when initial summary is requested', async () => {
    const { service, notifications } = createFixture({
      alertTypes: [FlightAlertType.LOWEST_HISTORICAL_PRICE],
    });

    const result = await service.runOnceForSearch('search-1', { sendInitialSummary: true });

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      title: 'INITIAL_SUMMARY',
      body: expect.stringContaining('🔎 Resultado inicial'),
    }));
    expect(result.alertsGenerated).toBe(1);
    expect(result.notificationAttempts).toBe(1);
  });

  it('sends one consolidated notification for LOWEST_HISTORICAL_PRICE and DAILY_SUMMARY', async () => {
    const { service, notifications } = createFixture({
      alertTypes: [FlightAlertType.LOWEST_HISTORICAL_PRICE, FlightAlertType.DAILY_SUMMARY],
    });

    const result = await service.runOnce();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('🚨 Nuevo mínimo histórico'),
    }));
    expect(result.alertsGenerated).toBe(2);
    expect(result.notificationAttempts).toBe(1);
  });

  it('sends one consolidated notification for both price drops and DAILY_SUMMARY', async () => {
    const { service, notifications } = createFixture({
      alertTypes: [
        FlightAlertType.PRICE_DROP_CHEAPEST,
        FlightAlertType.PRICE_DROP_RECOMMENDED,
        FlightAlertType.DAILY_SUMMARY,
      ],
    });

    const result = await service.runOnce();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    const body = (notifications.send as jest.Mock).mock.calls[0][0].body as string;
    expect(body).toContain('📉 Bajó el precio más barato');
    expect(body).toContain('⭐ Bajó la opción recomendada');
    expect(body).toContain('✈️ AEP to MDZ');
    expect(result.alertsGenerated).toBe(3);
    expect(result.notificationAttempts).toBe(1);
  });

  it('sends one notification when there is only DAILY_SUMMARY', async () => {
    const { service, notifications } = createFixture({
      alertTypes: [FlightAlertType.DAILY_SUMMARY],
    });

    await service.runOnce();

    expect(notifications.send).toHaveBeenCalledTimes(1);
    expect(notifications.send).toHaveBeenCalledWith(expect.objectContaining({
      body: expect.stringContaining('✈️ AEP to MDZ'),
    }));
  });

  it('does not send notifications when there are no alerts', async () => {
    const { service, notifications } = createFixture({ alertTypes: [] });

    const result = await service.runOnce();

    expect(notifications.send).not.toHaveBeenCalled();
    expect(result.alertsGenerated).toBe(0);
    expect(result.notificationAttempts).toBe(0);
  });

  it('omits per-price verbose logs when verbose watch logs are disabled', async () => {
    const { service } = createFixture({ persistPriceSnapshots: true, enableVerboseWatchLogs: false });

    await service.runOnce();

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Watch summary: search="AEP to MDZ"');
    expect(output).not.toContain('Price found:');
    expect(output).not.toContain('Snapshot saved:');
  });

  it('keeps per-price logs when verbose watch logs are enabled', async () => {
    const { service } = createFixture({ persistPriceSnapshots: true, enableVerboseWatchLogs: true });

    await service.runOnce();

    const output = logSpy.mock.calls.map((call) => String(call[0])).join('\n');
    expect(output).toContain('Price found:');
    expect(output).toContain('Snapshot saved:');
  });
});
