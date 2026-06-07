import { Injectable } from '@nestjs/common';
import { Currency } from '../../../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuoteRankingService } from '../../../application/services/flight-quote-ranking.service';
import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { FlightLegOption, FlightQuote } from '../../../domain/models/flight-quote.model';
import { JetSmartAvailabilityItem, JetSmartAvailabilityResponse, JetSmartPriceByCurrency } from './jetsmart.types';

type JetSmartCandidate = {
  outbound: JetSmartAvailabilityItem;
  inbound?: NonNullable<JetSmartAvailabilityItem['rfb']>;
};

@Injectable()
export class JetSmartResponseMapper {
  constructor(private readonly ranking: FlightQuoteRankingService = new FlightQuoteRankingService()) {}

  toFlightQuotes(params: {
    searchId: string;
    response: JetSmartAvailabilityResponse;
    query: FlightQuery;
    capturedAt?: Date;
  }): FlightQuote[] {
    const candidates = (params.response.availability ?? [])
      .map((item) => this.toCandidate(item, params.query))
      .filter((item): item is JetSmartCandidate => Boolean(item));

    const outboundOptions = this.buildOutboundOptions(candidates, params.query.currency);
    const inboundOptions = this.buildInboundOptions(candidates, params.query.currency);

    const quotes = candidates
      .map((candidate) => this.toQuote({
        searchId: params.searchId,
        candidate,
        query: params.query,
        capturedAt: params.capturedAt,
        outboundOptions,
        inboundOptions,
      }))
      .filter((quote): quote is FlightQuote => Boolean(quote));

    return this.ranking.rank(quotes);
  }

  private toCandidate(item: JetSmartAvailabilityItem, query: FlightQuery): JetSmartCandidate | null {
    if (!this.matchesOutbound(item, query)) {
      return null;
    }

    if (query.tripType === TripType.ONE_WAY) {
      return { outbound: item };
    }

    const inbound = item.rfb;
    if (!inbound || !this.matchesInbound(inbound, query)) {
      return null;
    }

    return { outbound: item, inbound };
  }

  private toQuote(params: {
    searchId: string;
    candidate: JetSmartCandidate;
    query: FlightQuery;
    capturedAt?: Date;
    outboundOptions: FlightLegOption[];
    inboundOptions: FlightLegOption[];
  }): FlightQuote | null {
    const outboundPrice = this.selectPrice(params.candidate.outbound, params.query.currency);
    const inboundPrice = params.candidate.inbound
      ? this.selectPrice(params.candidate.inbound, params.query.currency)
      : undefined;

    if (typeof outboundPrice !== 'number' || Number.isNaN(outboundPrice)) {
      return null;
    }

    if (params.query.tripType === TripType.ROUND_TRIP && typeof inboundPrice !== 'number') {
      return null;
    }

    const outboundDateTime = this.toIsoDateTime(params.candidate.outbound.date);
    const inboundDateTime = this.toIsoDateTime(params.candidate.inbound?.date);
    const totalPrice = outboundPrice + (inboundPrice ?? 0);

    return {
      searchId: params.searchId,
      providerCode: FlightProviderCode.JETSMART,
      outboundPrice,
      inboundPrice,
      totalPrice,
      currency: params.query.currency,
      capturedAt: params.capturedAt ?? new Date(),
      itinerarySummary: this.summary(params.candidate),
      pricingSource: params.candidate.inbound ? 'sum_of_bounds' : 'provider_total',
      outboundDepartureTime: outboundDateTime,
      inboundDepartureTime: inboundDateTime,
      outboundOptions: params.outboundOptions,
      inboundOptions: params.query.tripType === TripType.ROUND_TRIP ? params.inboundOptions : undefined,
      outboundSegments: [
        {
          flightNumber: params.candidate.outbound.fn,
          origin: params.candidate.outbound.dep,
          destination: params.candidate.outbound.arr,
          departureDateTime: outboundDateTime,
        },
      ],
      inboundSegments: params.candidate.inbound
        ? [
          {
            flightNumber: params.candidate.inbound.fn,
            origin: params.candidate.inbound.dep,
            destination: params.candidate.inbound.arr,
            departureDateTime: inboundDateTime,
          },
        ]
        : undefined,
      fareName: 'JetSMART',
      outboundFareName: 'JetSMART',
      inboundFareName: params.candidate.inbound ? 'JetSMART' : undefined,
      hasStops: false,
      metadata: {
        outboundPrice,
        inboundPrice,
        pricingSource: params.candidate.inbound ? 'sum_of_bounds' : 'provider_total',
        outboundDepartureTime: outboundDateTime,
        inboundDepartureTime: inboundDateTime,
        outboundOptions: params.outboundOptions,
        inboundOptions: params.query.tripType === TripType.ROUND_TRIP ? params.inboundOptions : undefined,
        actualOutboundOrigin: params.candidate.outbound.dep,
        actualOutboundDestination: params.candidate.outbound.arr,
        actualInboundOrigin: params.candidate.inbound?.dep,
        actualInboundDestination: params.candidate.inbound?.arr,
        fareName: 'JetSMART',
      },
    };
  }

  private buildOutboundOptions(candidates: JetSmartCandidate[], currency: Currency): FlightLegOption[] {
    const options: FlightLegOption[] = [];
    for (const candidate of candidates) {
      const price = this.selectPrice(candidate.outbound, currency);
      if (typeof price !== 'number') {
        continue;
      }
      options.push({
        legType: 'outbound',
        flightNumber: candidate.outbound.fn,
        origin: candidate.outbound.dep,
        destination: candidate.outbound.arr,
        departureDateTime: this.toIsoDateTime(candidate.outbound.date),
        currency,
        cheapestPrice: price,
        fareName: 'JetSMART',
        cheapestFareName: 'JetSMART',
        hasStops: false,
        stopsCount: 0,
        fares: [
          {
            fareName: 'JetSMART',
            price,
            currency,
          },
        ],
      });
    }

    return this.uniqueLegOptions(options);
  }

  private buildInboundOptions(candidates: JetSmartCandidate[], currency: Currency): FlightLegOption[] {
    const options: FlightLegOption[] = [];
    for (const candidate of candidates) {
      if (!candidate.inbound) {
        continue;
      }
      const price = this.selectPrice(candidate.inbound, currency);
      if (typeof price !== 'number') {
        continue;
      }
      options.push({
        legType: 'inbound',
        flightNumber: candidate.inbound.fn,
        origin: candidate.inbound.dep,
        destination: candidate.inbound.arr,
        departureDateTime: this.toIsoDateTime(candidate.inbound.date),
        currency,
        cheapestPrice: price,
        fareName: 'JetSMART',
        cheapestFareName: 'JetSMART',
        hasStops: false,
        stopsCount: 0,
        fares: [
          {
            fareName: 'JetSMART',
            price,
            currency,
          },
        ],
      });
    }

    return this.uniqueLegOptions(options);
  }

  private uniqueLegOptions(options: FlightLegOption[]): FlightLegOption[] {
    const unique = new Map<string, FlightLegOption>();
    for (const option of options) {
      const key = [
        option.legType,
        option.flightNumber,
        option.origin,
        option.destination,
        option.departureDateTime,
      ].join('|');

      const current = unique.get(key);
      if (!current || (option.cheapestPrice ?? Number.POSITIVE_INFINITY) < (current.cheapestPrice ?? Number.POSITIVE_INFINITY)) {
        unique.set(key, option);
      }
    }
    return [...unique.values()];
  }

  private matchesOutbound(item: JetSmartAvailabilityItem, query: FlightQuery): boolean {
    return item.dep === query.origin
      && item.arr === query.destination
      && this.dateOnly(item.date) === this.dateOnly(query.departureDate.toISOString());
  }

  private matchesInbound(item: NonNullable<JetSmartAvailabilityItem['rfb']>, query: FlightQuery): boolean {
    if (!query.returnDate) {
      return false;
    }
    return item.dep === query.destination
      && item.arr === query.origin
      && this.dateOnly(item.date) === this.dateOnly(query.returnDate.toISOString());
  }

  private selectPrice(item: { p?: JetSmartPriceByCurrency; pi?: JetSmartPriceByCurrency; i?: JetSmartPriceByCurrency }, currency: Currency): number | undefined {
    const key = currency.toLowerCase();
    const value = item.p?.[key] ?? item.pi?.[key] ?? item.i?.[key];
    return typeof value === 'number' ? value : undefined;
  }

  private dateOnly(value?: string): string | undefined {
    return value?.slice(0, 10);
  }

  private toIsoDateTime(value?: string): string | undefined {
    if (!value) {
      return undefined;
    }
    const [date, time = '00:00:00'] = value.split(' ');
    if (!date) {
      return undefined;
    }
    return `${date}T${time}`;
  }

  toConnectingQuotes(params: {
    searchId: string;
    leg1Items: JetSmartAvailabilityItem[];
    leg2Items: JetSmartAvailabilityItem[];
    hub: string;
    origin: string;
    destination: string;
    query: FlightQuery;
    capturedAt?: Date;
  }): FlightQuote[] {
    const { searchId, leg1Items, leg2Items, hub, origin, destination, query, capturedAt } = params;
    const MIN_CONNECTION_MS = 150 * 60 * 1000; // 150 minutes departure gap
    const quotes: FlightQuote[] = [];

    for (const leg1 of leg1Items) {
      for (const leg2 of leg2Items) {
        const leg1DT = this.toIsoDateTime(leg1.date);
        const leg2DT = this.toIsoDateTime(leg2.date);
        if (!leg1DT || !leg2DT) continue;

        const leg1Time = new Date(leg1DT);
        const leg2Time = new Date(leg2DT);
        if (leg2Time.getTime() - leg1Time.getTime() < MIN_CONNECTION_MS) continue;

        const leg1Price = this.selectPrice(leg1, query.currency);
        const leg2Price = this.selectPrice(leg2, query.currency);
        if (leg1Price == null || leg2Price == null) continue;

        const totalPrice = leg1Price + leg2Price;

        quotes.push({
          searchId,
          providerCode: FlightProviderCode.JETSMART,
          totalPrice,
          currency: query.currency,
          capturedAt: capturedAt ?? new Date(),
          itinerarySummary: `JetSMART ${origin}-${hub}-${destination} ${leg1DT}`.trim(),
          pricingSource: 'sum_of_bounds',
          outboundDepartureTime: leg1DT,
          outboundSegments: [
            { flightNumber: leg1.fn, origin, destination: hub, departureDateTime: leg1DT },
            { flightNumber: leg2.fn, origin: hub, destination, departureDateTime: leg2DT },
          ],
          outboundOptions: [
            {
              legType: 'outbound',
              origin,
              destination,
              departureDateTime: leg1DT,
              currency: query.currency,
              cheapestPrice: totalPrice,
              fareName: 'JetSMART',
              cheapestFareName: 'JetSMART',
              hasStops: true,
              stopsCount: 1,
              fares: [{ fareName: 'JetSMART', price: totalPrice, currency: query.currency }],
            },
          ],
          hasStops: true,
          fareName: 'JetSMART',
          outboundFareName: 'JetSMART',
          metadata: {
            outboundPrice: totalPrice,
            pricingSource: 'sum_of_bounds',
            outboundDepartureTime: leg1DT,
            outboundOptions: [],
            actualOutboundOrigin: origin,
            actualOutboundDestination: destination,
            fareName: 'JetSMART',
            outboundFareName: 'JetSMART',
          },
        });
      }
    }

    return quotes;
  }

  private summary(candidate: JetSmartCandidate): string {
    const outbound = `${candidate.outbound.dep ?? '?'}-${candidate.outbound.arr ?? '?'} ${this.toIsoDateTime(candidate.outbound.date) ?? ''}`.trim();
    if (!candidate.inbound) {
      return `JetSMART ${outbound}`;
    }
    const inbound = `${candidate.inbound.dep ?? '?'}-${candidate.inbound.arr ?? '?'} ${this.toIsoDateTime(candidate.inbound.date) ?? ''}`.trim();
    return `JetSMART ${outbound} | ${inbound}`;
  }
}
