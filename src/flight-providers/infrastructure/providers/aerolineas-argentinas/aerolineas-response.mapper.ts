import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Currency } from '../../../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuoteRankingService } from '../../../application/services/flight-quote-ranking.service';
import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { FlightLegOption, FlightQuote, FlightQuoteSegment } from '../../../domain/models/flight-quote.model';
import {
  AerolineasDiscardReason,
  AerolineasFlightOffersResponse,
  AerolineasLeg,
  AerolineasMappingDiagnostics,
  AerolineasMappingResult,
  AerolineasOffer,
  AerolineasOfferGroup,
  AerolineasSegment,
} from './aerolineas.types';

type Direction = 'outbound' | 'inbound';

type Candidate = {
  bucketKey: string;
  direction: Direction;
  group: AerolineasOfferGroup;
  leg: AerolineasLeg;
  offer: AerolineasOffer;
  totalPrice?: number;
  fareName: string;
  segments: AerolineasSegment[];
  actualOrigin?: string;
  actualDestination?: string;
  departureDate?: string;
  hasStops: boolean;
  seatsAvailable?: number;
};

type LegGroup = {
  candidate: Candidate;
  option: FlightLegOption;
};

@Injectable()
export class AerolineasResponseMapper {
  constructor(
    private readonly ranking: FlightQuoteRankingService = new FlightQuoteRankingService(),
    private readonly config?: ConfigService,
  ) {}

  toFlightQuotes(params: {
    searchId: string;
    response: AerolineasFlightOffersResponse;
    query?: FlightQuery;
    capturedAt?: Date;
  }): FlightQuote[] {
    return this.toFlightQuotesWithDiagnostics(params).quotes;
  }

  toFlightQuotesWithDiagnostics(params: {
    searchId: string;
    response: AerolineasFlightOffersResponse;
    query?: FlightQuery;
    capturedAt?: Date;
  }): AerolineasMappingResult {
    const currency = this.mapCurrency(params.response.searchMetadata?.currency);
    const diagnostics = this.emptyDiagnostics();
    const candidates = this.extractCandidates(params.response);
    diagnostics.rawCandidates = candidates.length;

    const validCandidates = params.query
      ? candidates.filter((candidate) => this.isValidCandidate(candidate, params.query as FlightQuery, diagnostics))
      : candidates;
    diagnostics.validCandidates = validCandidates.length;

    const quotes = params.query?.tripType === TripType.ROUND_TRIP
      ? this.buildRoundTripQuote({
        searchId: params.searchId,
        currency,
        capturedAt: params.capturedAt,
        candidates: validCandidates,
        diagnostics,
      })
      : this.buildOneWayQuote({
        searchId: params.searchId,
        currency,
        capturedAt: params.capturedAt,
        candidates: validCandidates,
        diagnostics,
      });

    const rankedQuotes = this.ranking.rank(quotes);
    return {
      quotes: rankedQuotes.slice(0, this.maxQuotesPerSearch()),
      diagnostics,
    };
  }

  private extractCandidates(response: AerolineasFlightOffersResponse): Candidate[] {
    const buckets = Object.entries(response.brandedOffers ?? {})
      .sort(([left], [right]) => Number(left) - Number(right));

    return buckets.flatMap(([bucketKey, groups], bucketIndex) => {
      const direction: Direction = bucketIndex === 1 ? 'inbound' : 'outbound';
      return groups.flatMap((group) => {
        const leg = group.legs?.[0];
        const segments = leg?.segments ?? [];
        return (group.offers ?? [])
          .map((offer) => {
            const firstSegment = segments[0];
            const lastSegment = segments[segments.length - 1];
            return {
              bucketKey,
              direction,
              group,
              leg: leg ?? {},
              offer,
              totalPrice: offer.fare?.total,
              fareName: offer.brand?.name ?? offer.fareBasis ?? 'fare',
              segments,
              actualOrigin: firstSegment?.origin,
              actualDestination: lastSegment?.destination,
              departureDate: firstSegment?.departure?.slice(0, 10),
              hasStops: segments.length !== 1 || (leg?.stops ?? 0) > 0,
              seatsAvailable: offer.seatAvailability?.seats,
            } satisfies Candidate;
          });
      });
    });
  }

  private isValidCandidate(
    candidate: Candidate,
    query: FlightQuery,
    diagnostics: AerolineasMappingDiagnostics,
  ): boolean {
    const expectedOrigin = candidate.direction === 'outbound' ? query.origin : query.destination;
    const expectedDestination = candidate.direction === 'outbound' ? query.destination : query.origin;
    const expectedDate = candidate.direction === 'outbound'
      ? this.dateKey(query.departureDate)
      : query.returnDate ? this.dateKey(query.returnDate) : undefined;

    if (typeof candidate.totalPrice !== 'number') {
      this.discard(diagnostics, candidate, 'MISSING_PRICE', 'offer.fare.total is missing');
      return false;
    }

    if (candidate.hasStops) {
      this.discard(diagnostics, candidate, 'HAS_STOPS', `segments=${candidate.segments.length} stops=${candidate.leg.stops ?? 0}`);
      return false;
    }

    if (candidate.actualOrigin !== expectedOrigin || candidate.actualDestination !== expectedDestination) {
      this.discard(
        diagnostics,
        candidate,
        'AIRPORT_MISMATCH',
        `expected=${expectedOrigin}-${expectedDestination} actual=${candidate.actualOrigin ?? '?'}-${candidate.actualDestination ?? '?'}`,
      );
      return false;
    }

    if (expectedDate && candidate.departureDate !== expectedDate) {
      this.discard(
        diagnostics,
        candidate,
        'DATE_MISMATCH',
        `expected=${expectedDate} actual=${candidate.departureDate ?? '?'}`,
      );
      return false;
    }

    return true;
  }

  private buildOneWayQuote(params: {
    searchId: string;
    currency: Currency;
    capturedAt?: Date;
    candidates: Candidate[];
    diagnostics: AerolineasMappingDiagnostics;
  }): FlightQuote[] {
    const outboundGroups = this.toLegGroups(
      params.candidates.filter((candidate) => candidate.direction === 'outbound'),
      params.currency,
      'outbound',
    );
    const outboundOptions = outboundGroups.map((group) => group.option);
    return outboundGroups
      .map((group) => this.buildQuote({
        searchId: params.searchId,
        currency: params.currency,
        capturedAt: params.capturedAt,
        outbound: group.candidate,
        outboundOptions,
        diagnostics: params.diagnostics,
      }));
  }

  private buildRoundTripQuote(params: {
    searchId: string;
    currency: Currency;
    capturedAt?: Date;
    candidates: Candidate[];
    diagnostics: AerolineasMappingDiagnostics;
  }): FlightQuote[] {
    const outboundGroups = this.toLegGroups(
      params.candidates.filter((candidate) => candidate.direction === 'outbound'),
      params.currency,
      'outbound',
    );
    const inboundGroups = this.toLegGroups(
      params.candidates.filter((candidate) => candidate.direction === 'inbound'),
      params.currency,
      'inbound',
    );
    const outboundOptions = outboundGroups.map((group) => group.option);
    const inboundOptions = inboundGroups.map((group) => group.option);

    return outboundGroups.flatMap((outbound) =>
      inboundGroups.map((inbound) => this.buildQuote({
        searchId: params.searchId,
        currency: params.currency,
        capturedAt: params.capturedAt,
        outbound: outbound.candidate,
        inbound: inbound.candidate,
        outboundOptions,
        inboundOptions,
        diagnostics: params.diagnostics,
      })),
    );
  }

  private buildQuote(params: {
    searchId: string;
    currency: Currency;
    capturedAt?: Date;
    outbound: Candidate;
    inbound?: Candidate;
    outboundOptions?: FlightLegOption[];
    inboundOptions?: FlightLegOption[];
    diagnostics: AerolineasMappingDiagnostics;
  }): FlightQuote {
    const metadata = this.buildMetadata({
      outbound: params.outbound,
      inbound: params.inbound,
      outboundOptions: params.outboundOptions ?? this.toLegOptions([params.outbound], params.currency, 'outbound'),
      inboundOptions: params.inboundOptions,
      diagnostics: params.diagnostics,
    });
    const outboundPrice = this.price(params.outbound);
    const inboundPrice = params.inbound ? this.price(params.inbound) : undefined;
    return {
      searchId: params.searchId,
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      outboundPrice,
      inboundPrice,
      totalPrice: outboundPrice + (inboundPrice ?? 0),
      currency: params.currency,
      capturedAt: params.capturedAt ?? new Date(),
      itinerarySummary: this.buildSummary([params.outbound, params.inbound].filter(Boolean) as Candidate[]),
      pricingSource: params.inbound ? 'sum_of_bounds' : 'provider_total',
      outboundSegments: metadata?.outboundSegments,
      inboundSegments: metadata?.inboundSegments,
      outboundOptions: metadata?.outboundOptions,
      inboundOptions: metadata?.inboundOptions,
      outboundDepartureTime: metadata?.outboundDepartureTime,
      inboundDepartureTime: metadata?.inboundDepartureTime,
      fareName: metadata?.fareName,
      outboundFareName: metadata?.outboundFareName,
      inboundFareName: metadata?.inboundFareName,
      seatsAvailable: metadata?.seatsAvailable,
      hasStops: metadata?.hasStops,
      metadata,
    };
  }

  private buildMetadata(params: {
    outbound: Candidate;
    inbound?: Candidate;
    outboundOptions?: FlightLegOption[];
    inboundOptions?: FlightLegOption[];
    diagnostics: AerolineasMappingDiagnostics;
  }): FlightQuote['metadata'] {
    const outboundSegments = this.toQuoteSegments(params.outbound.segments);
    const inboundSegments = this.toQuoteSegments(params.inbound?.segments ?? []);
    const totalSegments = outboundSegments.length + inboundSegments.length;
    return {
      outboundPrice: this.price(params.outbound),
      inboundPrice: params.inbound ? this.price(params.inbound) : undefined,
      pricingSource: params.inbound ? 'sum_of_bounds' : 'provider_total',
      outboundSegments,
      inboundSegments: inboundSegments.length ? inboundSegments : undefined,
      outboundOptions: params.outboundOptions,
      inboundOptions: params.inboundOptions?.length ? params.inboundOptions : undefined,
      outboundDepartureTime: outboundSegments[0]?.departureDateTime,
      inboundDepartureTime: inboundSegments[0]?.departureDateTime,
      totalSegments,
      hasStops: totalSegments > (params.inbound ? 2 : 1),
      actualOutboundOrigin: params.outbound.actualOrigin,
      actualOutboundDestination: params.outbound.actualDestination,
      actualInboundOrigin: params.inbound?.actualOrigin,
      actualInboundDestination: params.inbound?.actualDestination,
      fareName: params.outbound.fareName,
      outboundFareName: params.outbound.fareName,
      inboundFareName: params.inbound?.fareName,
      seatsAvailable: this.minSeats(params.outbound, params.inbound),
      discardedDiagnostics: {
        rawCandidates: params.diagnostics.rawCandidates,
        discardedByAirport: params.diagnostics.discardedByAirport,
        discardedByStops: params.diagnostics.discardedByStops,
        discardedByDate: params.diagnostics.discardedByDate,
        discardedByMissingPrice: params.diagnostics.discardedByMissingPrice,
        validCandidates: params.diagnostics.validCandidates,
        discardedReasons: params.diagnostics.discardedReasons.map((reason) => `${reason.reason}: ${reason.details}`),
      },
    };
  }

  private toQuoteSegments(segments: AerolineasSegment[]): FlightQuoteSegment[] {
    return segments.map((segment) => ({
      flightNumber: segment.airline && segment.flightNumber ? `${segment.airline}${segment.flightNumber}` : undefined,
      airline: segment.airline,
      origin: segment.origin,
      destination: segment.destination,
      departureDateTime: segment.departure,
      arrivalDateTime: segment.arrival,
    }));
  }

  private toLegOptions(candidates: Candidate[], currency: Currency, legType: Direction): FlightLegOption[] {
    return this.toLegGroups(candidates, currency, legType).map((group) => group.option);
  }

  private toLegGroups(candidates: Candidate[], currency: Currency, legType: Direction): LegGroup[] {
    const groups = new Map<string, Candidate[]>();
    for (const candidate of candidates.filter((item) => typeof item.totalPrice === 'number')) {
      const key = this.flightKey(candidate);
      groups.set(key, [...(groups.get(key) ?? []), candidate]);
    }

    const legGroups = [...groups.values()].map((items) => {
      const sortedFares = [...items].sort((left, right) => this.price(left) - this.price(right));
      const cheapestCandidate = sortedFares[0] as Candidate;
      const segments = this.toQuoteSegments(cheapestCandidate.segments);
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const fares = sortedFares.map((candidate) => ({
        fareName: candidate.fareName,
        price: this.price(candidate),
        currency,
        seatsAvailable: candidate.seatsAvailable,
        rawBrandCode: candidate.offer.brand?.id,
      }));
      const cheapestFare = fares[0];
      return {
        candidate: cheapestCandidate,
        option: {
          legType,
          flightNumber: firstSegment?.flightNumber,
          origin: firstSegment?.origin,
          destination: lastSegment?.destination,
          departureDateTime: firstSegment?.departureDateTime,
          arrivalDateTime: lastSegment?.arrivalDateTime,
          duration: cheapestCandidate.leg.totalDuration,
          currency,
          cheapestPrice: cheapestFare?.price ?? this.price(cheapestCandidate),
          cheapestFareName: cheapestFare?.fareName,
          fares,
          price: cheapestFare?.price ?? this.price(cheapestCandidate),
          fareName: cheapestFare?.fareName,
          seatsAvailable: this.minSeats(...sortedFares),
          hasStops: cheapestCandidate.hasStops,
          stopsCount: cheapestCandidate.leg.stops ?? 0,
        },
      } satisfies LegGroup;
    });

    const cheapestPrice = legGroups.length
      ? Math.min(...legGroups.map((group) => this.legOptionPrice(group.option)))
      : undefined;

    return legGroups
      .map((group) => ({
        ...group,
        option: {
          ...group.option,
          isCheapest: cheapestPrice !== undefined && this.legOptionPrice(group.option) === cheapestPrice,
        },
      }))
      .sort((left, right) =>
        this.legOptionPrice(left.option) - this.legOptionPrice(right.option)
        || String(left.option.departureDateTime ?? '').localeCompare(String(right.option.departureDateTime ?? '')),
      );
  }

  private flightKey(candidate: Candidate): string {
    const segments = this.toQuoteSegments(candidate.segments);
    const firstSegment = segments[0];
    const lastSegment = segments[segments.length - 1];
    return [
      firstSegment?.flightNumber,
      firstSegment?.origin,
      lastSegment?.destination,
      firstSegment?.departureDateTime,
      lastSegment?.arrivalDateTime,
    ].join('|');
  }

  private buildSummary(candidates: Candidate[]): string {
    const segments = candidates
      .flatMap((candidate) => candidate.segments)
      .map((segment) => {
        const flightNumber = segment.airline && segment.flightNumber
          ? `${segment.airline}${segment.flightNumber}`
          : 'flight';
        const route = segment.origin && segment.destination
          ? `${segment.origin}-${segment.destination}`
          : 'route unavailable';
        const time = segment.departure ? ` ${segment.departure}` : '';
        return `${flightNumber} ${route}${time}`;
      });
    const fareName = candidates[0]?.fareName ?? 'fare';
    const seats = this.minSeats(...candidates);
    const seatText = Number.isFinite(seats) ? ` seats=${seats}` : '';

    return `${segments.join(' / ')} | ${fareName}${seatText}`.trim();
  }

  private discard(
    diagnostics: AerolineasMappingDiagnostics,
    candidate: Candidate,
    reason: AerolineasDiscardReason['reason'],
    details: string,
  ): void {
    if (reason === 'AIRPORT_MISMATCH') {
      diagnostics.discardedByAirport += 1;
    }
    if (reason === 'HAS_STOPS') {
      diagnostics.discardedByStops += 1;
    }
    if (reason === 'DATE_MISMATCH') {
      diagnostics.discardedByDate += 1;
    }
    if (reason === 'MISSING_PRICE') {
      diagnostics.discardedByMissingPrice += 1;
    }
    diagnostics.discardedReasons.push({
      bucketKey: candidate.bucketKey,
      fareName: candidate.fareName,
      reason,
      details,
    });
  }

  private emptyDiagnostics(): AerolineasMappingDiagnostics {
    return {
      rawCandidates: 0,
      discardedByAirport: 0,
      discardedByStops: 0,
      discardedByDate: 0,
      discardedByMissingPrice: 0,
      validCandidates: 0,
      discardedReasons: [],
    };
  }

  private minSeats(...candidates: Array<Candidate | undefined>): number | undefined {
    const seats = candidates
      .map((candidate) => candidate?.seatsAvailable)
      .filter((value): value is number => typeof value === 'number');
    return seats.length ? Math.min(...seats) : undefined;
  }

  private dateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private price(candidate: Candidate): number {
    return candidate.totalPrice ?? Number.POSITIVE_INFINITY;
  }

  private legOptionPrice(option: FlightLegOption): number {
    return option.cheapestPrice ?? option.price ?? Number.POSITIVE_INFINITY;
  }

  private mapCurrency(currency?: string): Currency {
    if (currency === Currency.USD) {
      return Currency.USD;
    }
    return Currency.ARS;
  }

  private maxQuotesPerSearch(): number {
    const value = this.config?.get<number>('maxQuotesPerSearch') ?? Number(process.env.MAX_QUOTES_PER_SEARCH ?? 5);
    return Number.isFinite(value) && value > 0 ? value : 5;
  }
}
