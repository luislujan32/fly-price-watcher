import { Injectable } from '@nestjs/common';
import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { FlightQuote } from '../../../domain/models/flight-quote.model';
import { FlightProviderPort } from '../../../domain/ports/flight-provider.port';
import { AerolineasArgentinasApiClient } from './aerolineas-argentinas-api.client';
import { AerolineasQueryMapper } from './aerolineas-query.mapper';
import { AerolineasResponseMapper } from './aerolineas-response.mapper';

@Injectable()
export class AerolineasArgentinasProvider implements FlightProviderPort {
  readonly code = FlightProviderCode.AEROLINEAS_ARGENTINAS;

  constructor(
    private readonly queryMapper: AerolineasQueryMapper,
    private readonly apiClient: AerolineasArgentinasApiClient,
    private readonly responseMapper: AerolineasResponseMapper,
  ) {}

  async search(query: FlightQuery): Promise<FlightQuote[]> {
    const searchParams = this.queryMapper.toSearchParams(query);
    const response = await this.apiClient.searchOffers(searchParams);
    return this.responseMapper.toFlightQuotes({
      searchId: query.searchId,
      response,
      query,
    });
  }

  async searchWithDiagnostics(query: FlightQuery) {
    const searchParams = this.queryMapper.toSearchParams(query);
    const response = await this.apiClient.searchOffers(searchParams);
    return this.responseMapper.toFlightQuotesWithDiagnostics({
      searchId: query.searchId,
      response,
      query,
    });
  }
}
