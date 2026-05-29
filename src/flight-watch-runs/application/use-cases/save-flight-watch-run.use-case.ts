import { Inject, Injectable, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuote, FlightQuoteSegment } from '../../../flight-providers/domain/models/flight-quote.model';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { FlightOptionSummary, FlightWatchRun } from '../../domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../domain/enums/flight-watch-run-status.enum';
import {
  FLIGHT_WATCH_RUN_REPOSITORY,
  FlightWatchRunRepository,
} from '../../domain/repositories/flight-watch-run.repository';
import { DataRetentionService } from '../../../shared/retention/data-retention.service';

export type SaveFlightWatchRunInput = {
  search: FlightSearch;
  providerCode: FlightProviderCode;
  quotes: FlightQuote[];
  ranAt?: Date;
  status?: FlightWatchRunStatus;
  alertsGenerated?: number;
  errorMessage?: string;
};

@Injectable()
export class SaveFlightWatchRunUseCase {
  constructor(
    @Inject(FLIGHT_WATCH_RUN_REPOSITORY)
    private readonly repository: FlightWatchRunRepository,
    @Optional()
    private readonly config?: ConfigService,
    @Optional()
    private readonly retention?: DataRetentionService,
  ) {}

  execute(input: SaveFlightWatchRunInput): Promise<FlightWatchRun> {
    return this.repository.create(this.toRun(input));
  }

  updateAlertsGenerated(id: string, alertsGenerated: number): Promise<FlightWatchRun | null> {
    return this.repository.updateAlertsGenerated(id, alertsGenerated);
  }

  toRun(input: SaveFlightWatchRunInput): FlightWatchRun {
    const sortedQuotes = [...input.quotes].sort((left, right) => left.totalPrice - right.totalPrice);
    const cheapest = sortedQuotes[0];
    const recommended = input.quotes.find((quote) => quote.tags?.includes('RECOMMENDED')) ?? cheapest;
    const diagnostics = cheapest?.metadata?.discardedDiagnostics ?? input.quotes[0]?.metadata?.discardedDiagnostics;
    const status = input.status ?? (input.quotes.length ? FlightWatchRunStatus.SUCCESS : FlightWatchRunStatus.NO_RESULTS);
    const topOptions = sortedQuotes.map((quote) => this.toOptionSummary(quote));

    return new FlightWatchRun({
      searchId: input.search.id ?? input.search.name,
      providerCode: input.providerCode,
      ranAt: input.ranAt ?? new Date(),
      status,
      route: `${input.search.origin}-${input.search.destination}`,
      departureDate: input.search.departureDate,
      returnDate: input.search.returnDate,
      validOptionsCount: input.quotes.length,
      currency: cheapest?.currency,
      cheapestPrice: cheapest?.totalPrice,
      recommendedPrice: recommended?.totalPrice,
      cheapestOption: cheapest ? this.toOptionSummary(cheapest) : undefined,
      recommendedOption: recommended ? this.toOptionSummary(recommended) : undefined,
      topOptions,
      cheapestOptionCount: cheapest
        ? input.quotes.filter((quote) => quote.totalPrice === cheapest.totalPrice).length
        : undefined,
      diagnosticsSummary: diagnostics
        ? {
          rawCandidates: diagnostics.rawCandidates,
          discardedByAirport: diagnostics.discardedByAirport,
          discardedByStops: diagnostics.discardedByStops,
          discardedByDate: diagnostics.discardedByDate,
          discardedByMissingPrice: diagnostics.discardedByMissingPrice,
          validCandidates: diagnostics.validCandidates,
        }
        : undefined,
      diagnosticsDetails: diagnostics && this.persistProviderDiagnostics()
        ? {
          discardedReasons: diagnostics.discardedReasons,
        }
        : undefined,
      alertsGenerated: input.alertsGenerated,
      expiresAt: this.expiresAt(input.search),
    });
  }

  private toOptionSummary(quote: FlightQuote): FlightOptionSummary {
    const outboundSegments = quote.outboundSegments ?? quote.metadata?.outboundSegments ?? [];
    const inboundSegments = quote.inboundSegments ?? quote.metadata?.inboundSegments ?? [];
    return {
      price: quote.totalPrice,
      currency: quote.currency,
      outboundPrice: quote.outboundPrice ?? quote.metadata?.outboundPrice,
      inboundPrice: quote.inboundPrice ?? quote.metadata?.inboundPrice,
      pricingSource: quote.pricingSource ?? quote.metadata?.pricingSource,
      fareName: quote.fareName ?? quote.metadata?.fareName,
      outboundFareName: quote.outboundFareName ?? quote.metadata?.outboundFareName,
      inboundFareName: quote.inboundFareName ?? quote.metadata?.inboundFareName,
      seatsAvailable: quote.seatsAvailable ?? quote.metadata?.seatsAvailable,
      outboundSummary: this.formatSegments(outboundSegments),
      inboundSummary: inboundSegments.length ? this.formatSegments(inboundSegments) : undefined,
      outboundOptions: quote.outboundOptions ?? quote.metadata?.outboundOptions,
      inboundOptions: quote.inboundOptions ?? quote.metadata?.inboundOptions,
      outboundDepartureTime: quote.outboundDepartureTime ?? quote.metadata?.outboundDepartureTime,
      inboundDepartureTime: quote.inboundDepartureTime ?? quote.metadata?.inboundDepartureTime,
      tags: quote.tags ?? quote.metadata?.tags ?? [],
      hasStops: quote.hasStops ?? quote.metadata?.hasStops,
    };
  }

  private formatSegments(segments: FlightQuoteSegment[]): string {
    if (!segments.length) {
      return 'N/D';
    }
    return segments
      .map((segment) => `${segment.flightNumber ?? 'flight'} ${segment.origin ?? '?'}-${segment.destination ?? '?'} ${segment.departureDateTime ?? ''}`.trim())
      .join(' / ');
  }

  private persistProviderDiagnostics(): boolean {
    const value = this.config?.get<boolean>('persistProviderDiagnostics');
    if (typeof value === 'boolean') {
      return value;
    }
    return process.env.PERSIST_PROVIDER_DIAGNOSTICS === 'true';
  }

  private expiresAt(search: FlightSearch): Date {
    const retention = this.retention ?? new DataRetentionService(this.config);
    return retention.expiresAtForTrip({
      departureDate: search.departureDate,
      returnDate: search.returnDate,
    });
  }
}
