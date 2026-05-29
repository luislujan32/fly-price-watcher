import { Inject, Injectable } from '@nestjs/common';
import { FlightProviderCode } from '../../domain/enums/flight-provider-code.enum';
import {
  FLIGHT_PROVIDERS,
  FlightProviderPort,
} from '../../domain/ports/flight-provider.port';

@Injectable()
export class FlightProviderRegistry {
  private readonly providersByCode: Map<FlightProviderCode, FlightProviderPort>;

  constructor(
    @Inject(FLIGHT_PROVIDERS)
    private readonly providers: FlightProviderPort[],
  ) {
    this.providersByCode = new Map(providers.map((provider) => [provider.code, provider]));
  }

  getEnabledProviders(): FlightProviderPort[] {
    return [...this.providersByCode.values()];
  }

  getByCode(code: FlightProviderCode): FlightProviderPort {
    const provider = this.providersByCode.get(code);
    if (!provider) {
      throw new Error(`Flight provider not registered: ${code}`);
    }
    return provider;
  }
}
