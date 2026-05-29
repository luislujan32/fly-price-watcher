import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuoteRankingService } from '../../../application/services/flight-quote-ranking.service';
import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { FlightQuote } from '../../../domain/models/flight-quote.model';
import { FlightProviderPort } from '../../../domain/ports/flight-provider.port';
import { JetSmartApiClient } from './jetsmart-api.client';
import { JetSmartQueryMapper } from './jetsmart-query.mapper';
import { JetSmartResponseMapper } from './jetsmart-response.mapper';

@Injectable()
export class JetSmartProvider implements FlightProviderPort {
  readonly code = FlightProviderCode.JETSMART;

  constructor(
    private readonly config: ConfigService,
    private readonly queryMapper: JetSmartQueryMapper,
    private readonly apiClient: JetSmartApiClient,
    private readonly responseMapper: JetSmartResponseMapper,
    private readonly ranking: FlightQuoteRankingService,
  ) {}

  async search(query: FlightQuery): Promise<FlightQuote[]> {
    if (query.tripType === TripType.ONE_WAY) {
      return this.searchOneLeg(query.origin, query.destination, query.departureDate, query);
    }

    if (!query.returnDate) {
      throw new Error('JetSMART round-trip search requires returnDate.');
    }

    const [oneWayOutbound, oneWayInbound] = await Promise.all([
      this.searchOneLeg(query.origin, query.destination, query.departureDate, query),
      this.searchOneLeg(query.destination, query.origin, query.returnDate, query),
    ]);

    if (!oneWayOutbound.length || !oneWayInbound.length) {
      return [];
    }

    const outboundOptions = oneWayOutbound[0]?.outboundOptions;
    const inboundOptions = this.asInboundOptions(oneWayInbound[0]?.outboundOptions);

    const combined = oneWayOutbound.flatMap((outbound) =>
      oneWayInbound.map((inbound) => ({
        searchId: query.searchId,
        providerCode: FlightProviderCode.JETSMART,
        outboundPrice: outbound.totalPrice,
        inboundPrice: inbound.totalPrice,
        totalPrice: outbound.totalPrice + inbound.totalPrice,
        currency: query.currency,
        capturedAt: new Date(),
        itinerarySummary: `${outbound.itinerarySummary} | ${inbound.itinerarySummary}`,
        pricingSource: 'sum_of_bounds' as const,
        outboundSegments: outbound.outboundSegments,
        inboundSegments: inbound.outboundSegments,
        outboundOptions,
        inboundOptions,
        outboundDepartureTime: outbound.outboundDepartureTime,
        inboundDepartureTime: inbound.outboundDepartureTime,
        fareName: outbound.fareName,
        outboundFareName: outbound.outboundFareName,
        inboundFareName: inbound.outboundFareName,
        hasStops: Boolean(outbound.hasStops || inbound.hasStops),
        metadata: {
          outboundPrice: outbound.totalPrice,
          inboundPrice: inbound.totalPrice,
          pricingSource: 'sum_of_bounds' as const,
          outboundSegments: outbound.outboundSegments,
          inboundSegments: inbound.outboundSegments,
          outboundOptions,
          inboundOptions,
          outboundDepartureTime: outbound.outboundDepartureTime,
          inboundDepartureTime: inbound.outboundDepartureTime,
          actualOutboundOrigin: query.origin,
          actualOutboundDestination: query.destination,
          actualInboundOrigin: query.destination,
          actualInboundDestination: query.origin,
          fareName: outbound.fareName,
          outboundFareName: outbound.outboundFareName,
          inboundFareName: inbound.outboundFareName,
          hasStops: Boolean(outbound.hasStops || inbound.hasStops),
        },
      })),
    );

    return this.ranking.rank(combined);
  }

  private async searchOneLeg(origin: string, destination: string, date: Date, query: FlightQuery): Promise<FlightQuote[]> {
    const pointOfSaleCountry = this.config.get<string>('jetsmartPointOfSaleCountry') ?? 'AR';
    const oneWayQuery: FlightQuery = { ...query, origin, destination, departureDate: date, returnDate: undefined, tripType: TripType.ONE_WAY };

    const directParams = this.queryMapper.toSearchParamsForLeg({ origin, destination, date, pointOfSaleCountry });
    const directResponse = await this.apiClient.searchAvailability(directParams);
    const directQuotes = this.responseMapper.toFlightQuotes({ searchId: query.searchId, response: directResponse, query: oneWayQuery });

    if (directQuotes.length > 0 || query.allowStops === false) {
      return directQuotes;
    }

    return this.searchConnecting(origin, destination, date, oneWayQuery, pointOfSaleCountry);
  }

  private async searchConnecting(origin: string, destination: string, date: Date, query: FlightQuery, pointOfSaleCountry: string): Promise<FlightQuote[]> {
    const fromOriginParams = this.queryMapper.toSearchParamsFromOrigin({ origin, date, pointOfSaleCountry });
    const fromOriginResponse = await this.apiClient.searchAvailability(fromOriginParams);

    const leg1Items = (fromOriginResponse.availability ?? []).filter(
      (item) => item.dep === origin && item.arr !== destination,
    );
    const hubs = [...new Set(leg1Items.map((item) => item.arr).filter((arr): arr is string => Boolean(arr)))];
    if (hubs.length === 0) return [];

    const hubResults = await Promise.all(
      hubs.map(async (hub) => {
        const hubParams = this.queryMapper.toSearchParamsForLeg({ origin: hub, destination, date, pointOfSaleCountry });
        const hubResponse = await this.apiClient.searchAvailability(hubParams);
        return {
          hub,
          items: (hubResponse.availability ?? []).filter((item) => item.dep === hub && item.arr === destination),
        };
      }),
    );

    const capturedAt = new Date();
    const quotes: FlightQuote[] = [];

    for (const { hub, items: leg2Items } of hubResults) {
      const leg1ForHub = leg1Items.filter((item) => item.arr === hub);
      quotes.push(
        ...this.responseMapper.toConnectingQuotes({
          searchId: query.searchId,
          leg1Items: leg1ForHub,
          leg2Items,
          hub,
          origin,
          destination,
          query,
          capturedAt,
        }),
      );
    }

    return this.ranking.rank(quotes);
  }

  private asInboundOptions(options: FlightQuote['outboundOptions']): FlightQuote['inboundOptions'] {
    return options?.map((option) => ({
      ...option,
      legType: 'inbound' as const,
    }));
  }
}
