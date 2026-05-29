import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';
import { FlightProviderPort } from '../../../domain/ports/flight-provider.port';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { FlightQuote } from '../../../domain/models/flight-quote.model';
import { FakeProviderScenario } from './fake-provider-scenario.enum';

@Injectable()
export class FakeFlightProvider implements FlightProviderPort {
  readonly code = FlightProviderCode.FAKE;

  constructor(private readonly config: ConfigService) {}

  async search(query: FlightQuery): Promise<FlightQuote[]> {
    const scenario = this.getScenario();
    const basePrice = this.priceForScenario(scenario);
    const adultMultiplier = Math.max(query.adults, 1);

    return [
      {
        searchId: query.searchId,
        providerCode: this.code,
        totalPrice: basePrice * adultMultiplier,
        currency: query.currency,
        capturedAt: new Date(),
        itinerarySummary: `${query.origin} -> ${query.destination} (${query.tripType}, ${query.cabinClass}, fake:${scenario})`,
      },
    ];
  }

  private getScenario(): FakeProviderScenario {
    const configured = this.config.get<string>('fakeProviderScenario') ?? FakeProviderScenario.NORMAL;
    if (Object.values(FakeProviderScenario).includes(configured as FakeProviderScenario)) {
      return configured as FakeProviderScenario;
    }
    return FakeProviderScenario.NORMAL;
  }

  private priceForScenario(scenario: FakeProviderScenario): number {
    const prices: Record<FakeProviderScenario, number> = {
      [FakeProviderScenario.NORMAL]: 180_000,
      [FakeProviderScenario.PRICE_DROP]: 130_000,
      [FakeProviderScenario.TARGET_REACHED]: 145_000,
      [FakeProviderScenario.LOWEST_HISTORICAL]: 90_000,
      [FakeProviderScenario.NO_CHANGE]: 180_000,
    };

    return prices[scenario];
  }
}
