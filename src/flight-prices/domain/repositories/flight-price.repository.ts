import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightPriceSnapshot } from '../entities/flight-price-snapshot.entity';

export const FLIGHT_PRICE_REPOSITORY = Symbol('FLIGHT_PRICE_REPOSITORY');

export interface FlightPriceRepository {
  create(snapshot: FlightPriceSnapshot): Promise<FlightPriceSnapshot>;
  findBySearchAndProvider(
    searchId: string,
    providerCode: FlightProviderCode,
  ): Promise<FlightPriceSnapshot[]>;
  findLatestBySearchAndProvider(
    searchId: string,
    providerCode: FlightProviderCode,
  ): Promise<FlightPriceSnapshot | null>;
}
