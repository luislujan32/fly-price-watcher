import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EvaluateFlightAlertsUseCase } from '../../../flight-alerts/application/use-cases/evaluate-flight-alerts.use-case';
import { AlertMessageFormatter } from '../../../flight-alerts/domain/services/alert-message.formatter';
import { SaveFlightPriceSnapshotUseCase } from '../../../flight-prices/application/use-cases/save-flight-price-snapshot.use-case';
import { FlightProviderRegistry } from '../../../flight-providers/application/services/flight-provider-registry.service';
import { FlightQuery } from '../../../flight-providers/domain/models/flight-query.model';
import { FlightQuote, FlightQuoteSegment } from '../../../flight-providers/domain/models/flight-quote.model';
import { FindFlightSearchByIdUseCase } from '../../../flight-searches/application/use-cases/find-flight-search-by-id.use-case';
import { ListActiveFlightSearchesUseCase } from '../../../flight-searches/application/use-cases/list-active-flight-searches.use-case';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { SaveFlightWatchRunUseCase } from '../../../flight-watch-runs/application/use-cases/save-flight-watch-run.use-case';
import { FlightWatchRun } from '../../../flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { NotificationService } from '../../../notifications/application/services/notification.service';

export type FlightPriceWatchRunResult = {
  activeSearches: number;
  providerCodes: string[];
  snapshotsSaved: number;
  alertsGenerated: number;
  watchRunsSaved: number;
  notificationsSent: number;
  notificationAttempts: number;
  notificationSuccesses: number;
  notificationFailures: number;
  errors: number;
  noResultsRuns: number;
  validOptionsFound: number;
  status?: FlightWatchRunStatus;
  search?: FlightSearch;
  bestQuote?: FlightQuote;
  latestSuccessfulRun?: FlightWatchRun;
  error?: string;
};

export type RunOnceForSearchOptions = {
  sendInitialSummary?: boolean;
};

@Injectable()
export class FlightPriceWatchService {
  private readonly logger = new Logger(FlightPriceWatchService.name);

  constructor(
    private readonly listActiveSearches: ListActiveFlightSearchesUseCase,
    private readonly findSearchById: FindFlightSearchByIdUseCase,
    private readonly providerRegistry: FlightProviderRegistry,
    private readonly saveSnapshot: SaveFlightPriceSnapshotUseCase,
    private readonly evaluateAlerts: EvaluateFlightAlertsUseCase,
    private readonly saveWatchRun: SaveFlightWatchRunUseCase,
    private readonly notifications: NotificationService,
    private readonly alertMessages: AlertMessageFormatter,
    private readonly config: ConfigService,
  ) {}

  async runOnce(): Promise<FlightPriceWatchRunResult> {
    this.logger.log('Starting flight price watch run.');

    const searches = await this.listActiveSearches.execute();
    return this.runForSearches(searches);
  }

  async runOnceForSearch(searchId: string, options: RunOnceForSearchOptions = {}): Promise<FlightPriceWatchRunResult> {
    const search = await this.findSearchById.execute(searchId);
    if (!search) {
      throw new Error(`FlightSearch not found: ${searchId}.`);
    }

    this.logger.log(`Starting flight price watch run for search="${search.name}".`);
    return this.runForSearches([search], options);
  }

  private async runForSearches(
    searches: FlightSearch[],
    options: RunOnceForSearchOptions = {},
  ): Promise<FlightPriceWatchRunResult> {
    const providers = this.providerRegistry.getEnabledProviders();
    const result: FlightPriceWatchRunResult = {
      activeSearches: searches.length,
      providerCodes: providers.map((provider) => provider.code),
      snapshotsSaved: 0,
      alertsGenerated: 0,
      watchRunsSaved: 0,
      notificationsSent: 0,
      notificationAttempts: 0,
      notificationSuccesses: 0,
      notificationFailures: 0,
      errors: 0,
      noResultsRuns: 0,
      validOptionsFound: 0,
      status: undefined,
      search: searches.length === 1 ? searches[0] : undefined,
      latestSuccessfulRun: undefined,
    };

    this.logger.log(`Active searches: ${result.activeSearches}.`);
    this.logger.log(`Providers used: ${result.providerCodes.join(', ') || 'none'}.`);
    const persistPriceSnapshots = this.persistPriceSnapshots();
    const verboseLogs = this.enableVerboseWatchLogs();

    for (const search of searches) {
      if (!search.id) {
        this.logger.warn(`Skipping search without id: ${search.name}.`);
        continue;
      }

      const query: FlightQuery = {
        searchId: search.id,
        origin: search.origin,
        destination: search.destination,
        departureDate: search.departureDate,
        returnDate: search.returnDate,
        tripType: search.tripType,
        cabinClass: search.cabinClass,
        currency: search.currency,
        adults: search.adults,
        children: search.children,
        allowStops: search.allowStops,
      };

      const providersForSearch = search.providerCode
        ? providers.filter((provider) => provider.code === search.providerCode)
        : providers;

      if (search.providerCode && !providersForSearch.length) {
        this.logger.warn(`Skipping search="${search.name}" because provider=${search.providerCode} is not enabled.`);
        continue;
      }

      for (const provider of providersForSearch) {
        try {
          const quotes = this.withWatchSummary(search, await provider.search(query));
          let providerAlertsGenerated = 0;
          const cheapest = [...quotes].sort((left, right) => left.totalPrice - right.totalPrice)[0];
          const recommended = quotes.find((quote) => quote.tags?.includes('RECOMMENDED'));
          const cheapestOptionCount = cheapest
            ? quotes.filter((quote) => quote.totalPrice === cheapest.totalPrice).length
            : 0;
          if (cheapest) {
            result.bestQuote ??= cheapest;
            result.validOptionsFound += quotes.length;
            if (verboseLogs) {
              this.logger.log(
                [
                  `Options found: search="${search.name}"`,
                  `route=${search.origin}-${search.destination}`,
                  `provider=${provider.code}`,
                  `validOptions=${quotes.length}`,
                  `cheapest=${cheapest.totalPrice} ${cheapest.currency}`,
                  cheapestOptionCount > 1 ? `minimumOptions=${cheapestOptionCount}` : null,
                  recommended ? `recommended=${recommended.totalPrice} ${recommended.currency}` : null,
                  recommended?.tags?.length ? `recommendedTags=${recommended.tags.join(',')}` : null,
                ].filter(Boolean).join(', ') + '.',
              );
            }
          } else {
            const currentRun = await this.saveWatchRun.execute({
              search,
              providerCode: provider.code,
              quotes,
              status: FlightWatchRunStatus.NO_RESULTS,
              alertsGenerated: 0,
            });
            result.watchRunsSaved += 1;
            result.noResultsRuns += 1;
            result.status = FlightWatchRunStatus.NO_RESULTS;
            this.logRunSummary({
              search,
              providerCode: provider.code,
              status: FlightWatchRunStatus.NO_RESULTS,
              validOptions: 0,
              alertsGenerated: 0,
            });
          }

          const currentRun = quotes.length
            ? await this.saveWatchRun.execute({
              search,
              providerCode: provider.code,
              quotes,
              status: FlightWatchRunStatus.SUCCESS,
              alertsGenerated: 0,
            })
            : null;
          if (currentRun) {
            result.watchRunsSaved += 1;
            result.status = FlightWatchRunStatus.SUCCESS;
            result.latestSuccessfulRun = currentRun;
            if (verboseLogs) {
              this.logger.log(`Flight watch run saved: search="${search.name}", provider=${provider.code}, status=SUCCESS, options=${quotes.length}.`);
            }
          }

          if (!persistPriceSnapshots && quotes.length && verboseLogs) {
            this.logger.log(`Price snapshots persistence disabled: search="${search.name}", provider=${provider.code}, options=${quotes.length}.`);
          }

          for (const quote of quotes) {
            const route = `${search.origin}-${search.destination}`;
            if (verboseLogs) {
              this.logger.log(
                `Price found: search="${search.name}", route=${route}, provider=${quote.providerCode}, price=${quote.totalPrice} ${quote.currency}, tags=${quote.tags?.join(',') || 'none'}.`,
              );
            }
            if (persistPriceSnapshots) {
              await this.saveSnapshot.execute(quote, search);
              result.snapshotsSaved += 1;
              if (verboseLogs) {
                this.logger.log(
                  `Snapshot saved: search="${search.name}", route=${route}, provider=${quote.providerCode}, price=${quote.totalPrice} ${quote.currency}.`,
                );
              }
            }
          }

          if (currentRun) {
            const alerts = await this.evaluateAlerts.execute({ search, currentRun });
            result.alertsGenerated += alerts.length;
            providerAlertsGenerated += alerts.length;

            if (verboseLogs) {
              for (const alert of alerts) {
                this.logger.log(
                  `Alert generated: search="${search.name}", route=${search.origin}-${search.destination}, provider=${alert.providerCode}, type=${alert.alertType}.`,
                );
              }
            }

            if (alerts.length) {
              const notificationResult = await this.notifications.send({
                title: '',
                body: this.alertMessages.consolidated(search, currentRun, alerts),
                metadata: {
                  searchId: currentRun.searchId,
                  providerCode: currentRun.providerCode,
                  ...(currentRun.id ? { runId: currentRun.id } : {}),
                  ...(search.telegramChatId ? { telegramChatId: search.telegramChatId } : {}),
                  alertTypes: alerts.map((alert) => alert.alertType).join(','),
                },
              });
              result.notificationAttempts += notificationResult.attempts;
              result.notificationSuccesses += notificationResult.successes;
              result.notificationFailures += notificationResult.failures;
              result.notificationsSent = result.notificationSuccesses;
            }

            if (currentRun.id) {
              await this.saveWatchRun.updateAlertsGenerated(currentRun.id, providerAlertsGenerated);
            }

            this.logRunSummary({
              search,
              providerCode: provider.code,
              status: FlightWatchRunStatus.SUCCESS,
              validOptions: quotes.length,
              cheapestPrice: cheapest?.totalPrice,
              recommendedPrice: recommended?.totalPrice,
              currency: cheapest?.currency ?? recommended?.currency,
              alertsGenerated: providerAlertsGenerated,
            });
          }
        } catch (error) {
          result.errors += 1;
          try {
            await this.saveWatchRun.execute({
              search,
              providerCode: provider.code,
              quotes: [],
              status: FlightWatchRunStatus.FAILED,
              alertsGenerated: 0,
            });
            result.watchRunsSaved += 1;
            result.status = FlightWatchRunStatus.FAILED;
            this.logRunSummary({
              search,
              providerCode: provider.code,
              status: FlightWatchRunStatus.FAILED,
              validOptions: 0,
              alertsGenerated: 0,
            });
          } catch (saveError) {
            this.logger.error(`Failed to save FAILED flight watch run for search=${search.id}, provider=${provider.code}.`, saveError);
          }
          this.logger.error(
            `Flight watch failed for search=${search.id}, provider=${provider.code}.`,
            error,
          );
          result.error = error instanceof Error ? error.message : String(error);
        }
      }

      if (options.sendInitialSummary && result.latestSuccessfulRun) {
        const run = result.latestSuccessfulRun;
        const notificationResult = await this.notifications.send({
          title: 'INITIAL_SUMMARY',
          body: this.alertMessages.initialSummary(search, run),
          metadata: {
            searchId: run.searchId,
            providerCode: run.providerCode,
            ...(run.id ? { runId: run.id } : {}),
            ...(search.telegramChatId ? { telegramChatId: search.telegramChatId } : {}),
            notificationType: 'INITIAL_SUMMARY',
          },
        });
        result.notificationAttempts += notificationResult.attempts;
        result.notificationSuccesses += notificationResult.successes;
        result.notificationFailures += notificationResult.failures;
        result.notificationsSent = result.notificationSuccesses;
        this.logger.log(`Initial search result notification sent for search=${search.id}, provider=${run.providerCode}.`);
      }
    }

    this.logger.log(
      `Flight price watch finished: snapshots=${result.snapshotsSaved}, watchRuns=${result.watchRunsSaved}, alerts=${result.alertsGenerated}, notificationAttempts=${result.notificationAttempts}, notificationSuccesses=${result.notificationSuccesses}, notificationFailures=${result.notificationFailures}, errors=${result.errors}.`,
    );

    return result;
  }

  private withWatchSummary(search: FlightSearch, quotes: FlightQuote[]): FlightQuote[] {
    if (!quotes.length) {
      return quotes;
    }

    const sorted = [...quotes].sort((left, right) => left.totalPrice - right.totalPrice);
    const cheapest = sorted[0] as FlightQuote;
    const recommended = quotes.find((quote) => quote.tags?.includes('RECOMMENDED')) ?? cheapest;
    const cheapestOptionCount = quotes.filter((quote) => quote.totalPrice === cheapest.totalPrice).length;
    const summary = {
      searchName: search.name,
      route: `${search.origin}-${search.destination}`,
      departureDate: this.dateKey(search.departureDate),
      returnDate: search.returnDate ? this.dateKey(search.returnDate) : undefined,
      validOptions: quotes.length,
      cheapestPrice: cheapest.totalPrice,
      recommendedPrice: recommended.totalPrice,
      cheapestIsRecommended: recommended === cheapest,
      cheapestOptionCount,
      recommendedOutbound: this.formatSegments(recommended.outboundSegments ?? recommended.metadata?.outboundSegments ?? []),
      recommendedInbound: this.formatSegments(recommended.inboundSegments ?? recommended.metadata?.inboundSegments ?? []),
      fareName: recommended.fareName ?? recommended.metadata?.fareName,
      seatsAvailable: recommended.seatsAvailable ?? recommended.metadata?.seatsAvailable,
      tags: recommended.tags ?? recommended.metadata?.tags ?? [],
    };

    return quotes.map((quote) => ({
      ...quote,
      metadata: {
        ...quote.metadata,
        watchSummary: summary,
      },
    }));
  }

  private formatSegments(segments: FlightQuoteSegment[]): string {
    if (!segments.length) {
      return 'N/D';
    }
    return segments
      .map((segment) => `${segment.flightNumber ?? 'flight'} ${segment.origin ?? '?'}-${segment.destination ?? '?'} ${segment.departureDateTime ?? ''}`.trim())
      .join(' / ');
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private persistPriceSnapshots(): boolean {
    const value = this.config.get<boolean>('persistPriceSnapshots');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.PERSIST_PRICE_SNAPSHOTS === 'true';
  }

  private enableVerboseWatchLogs(): boolean {
    const value = this.config.get<boolean>('enableVerboseWatchLogs');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.ENABLE_VERBOSE_WATCH_LOGS === 'true';
  }

  private logRunSummary(params: {
    search: FlightSearch;
    providerCode: string;
    status: FlightWatchRunStatus;
    validOptions: number;
    cheapestPrice?: number;
    recommendedPrice?: number;
    currency?: string;
    alertsGenerated: number;
  }): void {
    this.logger.log(
      [
        `Watch summary: search="${params.search.name}"`,
        `route=${params.search.origin}-${params.search.destination}`,
        `provider=${params.providerCode}`,
        `status=${params.status}`,
        `validOptions=${params.validOptions}`,
        params.cheapestPrice !== undefined ? `cheapestPrice=${params.cheapestPrice}${params.currency ? ` ${params.currency}` : ''}` : null,
        params.recommendedPrice !== undefined ? `recommendedPrice=${params.recommendedPrice}${params.currency ? ` ${params.currency}` : ''}` : null,
        `alertsGenerated=${params.alertsGenerated}`,
      ].filter(Boolean).join(', ') + '.',
    );
  }
}
