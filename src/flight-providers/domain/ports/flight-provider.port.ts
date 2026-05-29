import { FlightProviderCode } from '../enums/flight-provider-code.enum';
import { FlightQuery } from '../models/flight-query.model';
import { FlightQuote } from '../models/flight-quote.model';

export const FLIGHT_PROVIDERS = Symbol('FLIGHT_PROVIDERS');

export interface FlightProviderPort {
  readonly code: FlightProviderCode;
  search(query: FlightQuery): Promise<FlightQuote[]>;
}
