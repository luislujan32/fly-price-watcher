import { AlertMatcherService } from '../../../src/flight-alerts/domain/services/alert-matcher.service';
import { FlightAlertType } from '../../../src/flight-alerts/domain/enums/flight-alert-type.enum';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { FlightWatchRun } from '../../../src/flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';

describe('AlertMatcherService', () => {
  const service = new AlertMatcherService();

  it('matches price drop cheapest, target, historical low and daily summary using runs', () => {
    const alerts = service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 110_000 }),
      previousSuccessfulRun: run({ cheapestPrice: 130_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 125_000, ranAt: '2026-05-22T09:00:00.000Z' }),
    });

    expect(alerts.map((alert) => alert.alertType)).toEqual([
      FlightAlertType.PRICE_DROP_CHEAPEST,
      FlightAlertType.PRICE_DROP_RECOMMENDED,
      FlightAlertType.TARGET_PRICE_REACHED,
      FlightAlertType.LOWEST_HISTORICAL_PRICE,
      FlightAlertType.DAILY_SUMMARY,
    ]);
  });

  it('matches price drop recommended independently from cheapest', () => {
    const alerts = service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 300_000, recommendedPrice: 330_000 }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000, recommendedPrice: 350_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 290_000, ranAt: '2026-05-22T09:00:00.000Z' }),
    });

    expect(alerts.map((alert) => alert.alertType)).toEqual([
      FlightAlertType.PRICE_DROP_RECOMMENDED,
      FlightAlertType.DAILY_SUMMARY,
    ]);
  });

  it('does not match price drop when current run is equal or higher', () => {
    const alerts = service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 320_000, recommendedPrice: 360_000 }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000, recommendedPrice: 350_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 300_000, ranAt: '2026-05-22T09:00:00.000Z' }),
    });

    expect(alerts.map((alert) => alert.alertType)).toEqual([FlightAlertType.DAILY_SUMMARY]);
  });

  it('matches lowest historical price from previous run cheapest prices', () => {
    const alerts = service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 280_000, recommendedPrice: 330_000 }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000, recommendedPrice: 350_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 290_000, ranAt: '2026-05-21T10:00:00.000Z' }),
    });

    expect(alerts.map((alert) => alert.alertType)).toContain(FlightAlertType.LOWEST_HISTORICAL_PRICE);
  });

  it('does not compare against secondary snapshot prices', () => {
    const alerts = service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 320_000, recommendedPrice: 360_000 }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000, recommendedPrice: 350_000, ranAt: '2026-05-22T10:00:00.000Z' }),
      lowestCheapestRun: run({ cheapestPrice: 300_000, ranAt: '2026-05-21T10:00:00.000Z' }),
    });

    expect(alerts.map((alert) => alert.alertType)).not.toContain(FlightAlertType.PRICE_DROP_CHEAPEST);
    expect(alerts.map((alert) => alert.alertType)).not.toContain(FlightAlertType.PRICE_DROP_RECOMMENDED);
  });

  it('does not generate alerts for NO_RESULTS', () => {
    expect(service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 0, status: FlightWatchRunStatus.NO_RESULTS }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000 }),
      lowestCheapestRun: run({ cheapestPrice: 300_000 }),
    })).toEqual([]);
  });

  it('does not generate alerts for FAILED', () => {
    expect(service.match({
      search: search(),
      currentRun: run({ cheapestPrice: 0, status: FlightWatchRunStatus.FAILED }),
      previousSuccessfulRun: run({ cheapestPrice: 300_000 }),
      lowestCheapestRun: run({ cheapestPrice: 300_000 }),
    })).toEqual([]);
  });
});

function search(): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'AEP to MDZ',
    origin: 'AEP',
    destination: 'MDZ',
    departureDate: new Date('2026-07-15T00:00:00.000Z'),
    tripType: TripType.ONE_WAY,
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
    providerCode: FlightProviderCode.FAKE,
    ranAt: new Date(params.ranAt ?? '2026-05-23T10:00:00.000Z'),
    status: params.status ?? FlightWatchRunStatus.SUCCESS,
    route: 'AEP-MDZ',
    departureDate: new Date('2026-07-15T00:00:00.000Z'),
    validOptionsCount: params.status === FlightWatchRunStatus.SUCCESS || params.status === undefined ? 1 : 0,
    currency: Currency.ARS,
    cheapestPrice: params.status === FlightWatchRunStatus.SUCCESS || params.status === undefined ? cheapestPrice : undefined,
    recommendedPrice: params.status === FlightWatchRunStatus.SUCCESS || params.status === undefined ? recommendedPrice : undefined,
    topOptions: [],
    cheapestOptionCount: 1,
    recommendedOption: {
      price: recommendedPrice,
      currency: Currency.ARS,
      outboundSummary: 'AR1910 AEP-MDZ 2026-07-15T13:30:00',
      tags: ['GOOD_TIME', 'RECOMMENDED'],
    },
  });
}
