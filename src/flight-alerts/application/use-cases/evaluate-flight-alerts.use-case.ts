import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { toDateKey } from '../../../shared/utils/date-key';
import { FlightWatchRun } from '../../../flight-watch-runs/domain/entities/flight-watch-run.entity';
import { DataRetentionService } from '../../../shared/retention/data-retention.service';
import {
  FLIGHT_WATCH_RUN_REPOSITORY,
  FlightWatchRunRepository,
} from '../../../flight-watch-runs/domain/repositories/flight-watch-run.repository';
import { FlightAlert } from '../../domain/entities/flight-alert.entity';
import { FlightAlertType } from '../../domain/enums/flight-alert-type.enum';
import {
  FLIGHT_ALERT_REPOSITORY,
  FlightAlertRepository,
} from '../../domain/repositories/flight-alert.repository';
import { AlertMatcherService } from '../../domain/services/alert-matcher.service';

@Injectable()
export class EvaluateFlightAlertsUseCase {
  private readonly logger = new Logger(EvaluateFlightAlertsUseCase.name);

  constructor(
    private readonly matcher: AlertMatcherService,
    @Inject(FLIGHT_ALERT_REPOSITORY)
    private readonly repository: FlightAlertRepository,
    @Inject(FLIGHT_WATCH_RUN_REPOSITORY)
    private readonly watchRunRepository: FlightWatchRunRepository,
    @Optional()
    private readonly config?: ConfigService,
    @Optional()
    private readonly retention?: DataRetentionService,
  ) {}

  async execute(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
  }): Promise<FlightAlert[]> {
    const previousSuccessfulRun = await this.watchRunRepository.findLatestSuccessfulBefore(
      params.currentRun.searchId,
      params.currentRun.providerCode,
      params.currentRun.ranAt,
    );
    const lowestCheapestRun = await this.watchRunRepository.findLowestCheapestBefore(
      params.currentRun.searchId,
      params.currentRun.providerCode,
      params.currentRun.ranAt,
    );
    const alertDate = toDateKey(params.currentRun.ranAt);
    const candidates = this.matcher.match({
      search: params.search,
      currentRun: params.currentRun,
      previousSuccessfulRun,
      lowestCheapestRun,
    });
    const createdAlerts: FlightAlert[] = [];
    const forceDailySummary = this.forceDailySummary();

    if (forceDailySummary) {
      this.logger.log('FORCE_DAILY_SUMMARY=true: DAILY_SUMMARY deduplication is bypassed for this run.');
    }

    for (const candidate of candidates) {
      const shouldBypassDeduplication = forceDailySummary && candidate.alertType === FlightAlertType.DAILY_SUMMARY;
      const exists = await this.repository.existsForDay({
        searchId: params.currentRun.searchId,
        providerCode: params.currentRun.providerCode,
        alertType: candidate.alertType,
        alertDate,
      });

      if (exists && shouldBypassDeduplication) {
        this.logger.warn(
          `FORCE_DAILY_SUMMARY=true: reusing existing DAILY_SUMMARY notification without inserting duplicate alert for search=${params.currentRun.searchId}, provider=${params.currentRun.providerCode}, alertDate=${alertDate}.`,
        );
        createdAlerts.push(this.buildTransientAlert(params.currentRun, candidate, alertDate));
        continue;
      }

      if (exists) {
        continue;
      }

      try {
        const alert = await this.repository.create(this.buildTransientAlert(params.currentRun, candidate, alertDate));
        createdAlerts.push(alert);
      } catch (error) {
        if (this.isDuplicateKeyError(error)) {
          this.logger.warn(
            `Duplicate alert skipped after Mongo unique index conflict for search=${params.currentRun.searchId}, provider=${params.currentRun.providerCode}, type=${candidate.alertType}, alertDate=${alertDate}.`,
          );
          if (shouldBypassDeduplication) {
            createdAlerts.push(this.buildTransientAlert(params.currentRun, candidate, alertDate));
          }
          continue;
        }
        throw error;
      }
    }

    return createdAlerts;
  }

  private forceDailySummary(): boolean {
    const value = this.config?.get<boolean>('forceDailySummary');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.FORCE_DAILY_SUMMARY === 'true';
  }

  private buildTransientAlert(
    currentRun: FlightWatchRun,
    candidate: { alertType: FlightAlertType; message: string },
    alertDate: string,
  ): FlightAlert {
    return new FlightAlert({
      searchId: currentRun.searchId,
      providerCode: currentRun.providerCode,
      alertType: candidate.alertType,
      alertDate,
      message: candidate.message,
      expiresAt: this.expiresAt(currentRun),
    });
  }

  private expiresAt(currentRun: FlightWatchRun): Date | undefined {
    const retention = this.retention ?? new DataRetentionService(this.config);
    return retention.expiresAtForTrip({
      departureDate: currentRun.departureDate,
      returnDate: currentRun.returnDate,
    });
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return Boolean(
      error
      && typeof error === 'object'
      && 'code' in error
      && (error as { code?: number }).code === 11000,
    );
  }
}
