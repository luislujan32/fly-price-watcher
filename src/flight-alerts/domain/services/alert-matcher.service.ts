import { Injectable } from '@nestjs/common';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { FlightWatchRun } from '../../../flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { FlightAlertType } from '../enums/flight-alert-type.enum';
import { AlertMessageFormatter } from './alert-message.formatter';

export type AlertCandidate = {
  alertType: FlightAlertType;
  message: string;
};

@Injectable()
export class AlertMatcherService {
  constructor(private readonly formatter: AlertMessageFormatter = new AlertMessageFormatter()) {}

  match(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
    previousSuccessfulRun: FlightWatchRun | null;
    lowestCheapestRun: FlightWatchRun | null;
  }): AlertCandidate[] {
    const { search, currentRun, previousSuccessfulRun, lowestCheapestRun } = params;
    const alerts: AlertCandidate[] = [];

    if (currentRun.status !== FlightWatchRunStatus.SUCCESS || currentRun.cheapestPrice === undefined) {
      return alerts;
    }

    if (search.notifyOnPriceDrop && previousSuccessfulRun) {
      alerts.push(...this.matchPriceDrops({ search, currentRun, previousSuccessfulRun }));
    }

    if (search.targetPrice !== undefined && currentRun.cheapestPrice <= search.targetPrice) {
      alerts.push({
        alertType: FlightAlertType.TARGET_PRICE_REACHED,
        message: this.formatter.targetReached({ search, currentRun, targetPrice: search.targetPrice }),
      });
    }

    if (
      !lowestCheapestRun
      || lowestCheapestRun.cheapestPrice === undefined
      || currentRun.cheapestPrice < lowestCheapestRun.cheapestPrice
    ) {
      alerts.push({
        alertType: FlightAlertType.LOWEST_HISTORICAL_PRICE,
        message: this.formatter.historicalLow({ search, currentRun }),
      });
    }

    if (search.notifyAlways) {
      alerts.push({
        alertType: FlightAlertType.DAILY_SUMMARY,
        message: this.formatter.dailySummary(search, currentRun),
      });
    }

    return alerts;
  }

  private matchPriceDrops(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
    previousSuccessfulRun: FlightWatchRun;
  }): AlertCandidate[] {
    const alerts: AlertCandidate[] = [];
    const currentCheapest = params.currentRun.cheapestPrice;
    const previousCheapest = params.previousSuccessfulRun.cheapestPrice;
    const currentRecommended = params.currentRun.recommendedPrice;
    const previousRecommended = params.previousSuccessfulRun.recommendedPrice;

    if (
      currentCheapest !== undefined
      && previousCheapest !== undefined
      && currentCheapest < previousCheapest
    ) {
      alerts.push({
        alertType: FlightAlertType.PRICE_DROP_CHEAPEST,
        message: this.formatter.priceDrop({
          search: params.search,
          currentRun: params.currentRun,
          previousPrice: previousCheapest,
          currentPrice: currentCheapest,
          label: 'cheapest',
        }),
      });
    }

    if (
      currentRecommended !== undefined
      && previousRecommended !== undefined
      && currentRecommended < previousRecommended
    ) {
      alerts.push({
        alertType: FlightAlertType.PRICE_DROP_RECOMMENDED,
        message: this.formatter.priceDrop({
          search: params.search,
          currentRun: params.currentRun,
          previousPrice: previousRecommended,
          currentPrice: currentRecommended,
          label: 'recommended',
        }),
      });
    }

    return alerts;
  }
}
