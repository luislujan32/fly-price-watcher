import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FlightProviderRegistry } from './application/services/flight-provider-registry.service';
import { FlightQuoteRankingService } from './application/services/flight-quote-ranking.service';
import { FlightProviderCode } from './domain/enums/flight-provider-code.enum';
import { FLIGHT_PROVIDERS } from './domain/ports/flight-provider.port';
import { AerolineasArgentinasApiClient } from './infrastructure/providers/aerolineas-argentinas/aerolineas-argentinas-api.client';
import { AerolineasArgentinasProvider } from './infrastructure/providers/aerolineas-argentinas/aerolineas-argentinas.provider';
import { AerolineasQueryMapper } from './infrastructure/providers/aerolineas-argentinas/aerolineas-query.mapper';
import { AerolineasResponseMapper } from './infrastructure/providers/aerolineas-argentinas/aerolineas-response.mapper';
import { AerolineasTokenProvider } from './infrastructure/providers/aerolineas-argentinas/aerolineas-token.provider';
import { FakeFlightProvider } from './infrastructure/providers/fake/fake-flight.provider';

@Module({
  providers: [
    FakeFlightProvider,
    FlightQuoteRankingService,
    AerolineasQueryMapper,
    AerolineasResponseMapper,
    AerolineasTokenProvider,
    AerolineasArgentinasApiClient,
    AerolineasArgentinasProvider,
    {
      provide: FLIGHT_PROVIDERS,
      useFactory: (
        config: ConfigService,
        fake: FakeFlightProvider,
        aerolineas: AerolineasArgentinasProvider,
      ) => {
        const enabled = config.get<string[]>('enabledFlightProviders') ?? [FlightProviderCode.FAKE];
        return [
          enabled.includes(FlightProviderCode.FAKE) ? fake : null,
          enabled.includes(FlightProviderCode.AEROLINEAS_ARGENTINAS) ? aerolineas : null,
        ].filter(Boolean);
      },
      inject: [ConfigService, FakeFlightProvider, AerolineasArgentinasProvider],
    },
    FlightProviderRegistry,
  ],
  exports: [FlightProviderRegistry],
})
export class FlightProvidersModule {}
