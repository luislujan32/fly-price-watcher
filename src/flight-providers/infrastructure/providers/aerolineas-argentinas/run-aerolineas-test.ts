import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { appConfig } from '../../../../shared/config/app.config';
import { resolveNestLogLevels } from '../../../../shared/config/logger.config';
import { CabinClass } from '../../../../flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuoteRankingService } from '../../../application/services/flight-quote-ranking.service';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { AerolineasArgentinasApiClient } from './aerolineas-argentinas-api.client';
import { AerolineasArgentinasProvider } from './aerolineas-argentinas.provider';
import { formatAerolineasDiagnosticOutput } from './aerolineas-diagnostic.formatter';
import { AerolineasHttpError } from './aerolineas-http.error';
import { AerolineasQueryMapper } from './aerolineas-query.mapper';
import { AerolineasResponseMapper } from './aerolineas-response.mapper';
import { AerolineasTokenProvider } from './aerolineas-token.provider';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
  providers: [
    FlightQuoteRankingService,
    AerolineasQueryMapper,
    AerolineasResponseMapper,
    AerolineasTokenProvider,
    AerolineasArgentinasApiClient,
    AerolineasArgentinasProvider,
  ],
})
class AerolineasDiagnosticModule {}

async function run(): Promise<void> {
  const logger = new Logger('AerolineasDiagnostic');
  const app = await NestFactory.createApplicationContext(AerolineasDiagnosticModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const queryMapper = app.get(AerolineasQueryMapper);
    const provider = app.get(AerolineasArgentinasProvider);
    const query = buildQueryFromEnv();
    const searchParams = queryMapper.toSearchParams(query);

    logger.log('Aerolíneas diagnostic run started.');
    logger.log(`Generated query params: ${searchParams.toString()}`);

    const { quotes, diagnostics } = await provider.searchWithDiagnostics(query);
    const sortedQuotes = [...quotes].sort((a, b) => a.totalPrice - b.totalPrice);
    const cheapest = sortedQuotes[0];

    for (const line of formatAerolineasDiagnosticOutput({ quotes, diagnostics })) {
      logger.log(line);
    }

    logger.log(`Quotes received: ${quotes.length}.`);
    if (!cheapest) {
      logger.warn('No valid direct quotes were returned for this search after strict route filtering.');
      return;
    }

    logger.log(`Minimum price: ${cheapest.totalPrice} ${cheapest.currency}.`);
    logger.log(`Currency: ${cheapest.currency}.`);
    logger.log(`Recommended option: ${sortedQuotes.findIndex((quote) => quote.tags?.includes('RECOMMENDED')) + 1 || 'none'}.`);

    for (const [index, quote] of sortedQuotes.entries()) {
      const metadata = quote.metadata;
      const tags = quote.tags ?? metadata?.tags ?? [];
      logger.log(
        [
          `Option ${index + 1}`,
          `price=${quote.totalPrice} ${quote.currency}`,
          `fare=${quote.fareName ?? metadata?.fareName ?? 'unknown'}`,
          `seats=${quote.seatsAvailable ?? metadata?.seatsAvailable ?? 'unknown'}`,
          `tags=${tags.length ? tags.join(',') : 'none'}`,
          `cheapest=${tags.includes('CHEAPEST') ? 'yes' : 'no'}`,
          `recommended=${tags.includes('RECOMMENDED') ? 'yes' : 'no'}`,
          `hasStops=${quote.hasStops ?? metadata?.hasStops ?? 'unknown'}`,
          `actualOutbound=${metadata?.actualOutboundOrigin ?? '?'}-${metadata?.actualOutboundDestination ?? '?'}`,
          metadata?.actualInboundOrigin
            ? `actualInbound=${metadata.actualInboundOrigin}-${metadata.actualInboundDestination ?? '?'}`
            : null,
          `outbound=${formatSegments(quote.outboundSegments ?? metadata?.outboundSegments ?? [])}`,
          (quote.inboundSegments ?? metadata?.inboundSegments) ? `inbound=${formatSegments(quote.inboundSegments ?? metadata?.inboundSegments)}` : null,
          quote.outboundPrice ? `outboundPrice=${quote.outboundPrice}` : null,
          quote.inboundPrice ? `inboundPrice=${quote.inboundPrice}` : null,
          quote.pricingSource ? `pricingSource=${quote.pricingSource}` : null,
          `details="${quote.itinerarySummary}"`,
        ].join(' | '),
      );
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error(formatDiagnosticError(error));
  } finally {
    await app.close();
  }
}

function buildQueryFromEnv(): FlightQuery {
  const tripType = readEnum('TRIP_TYPE', TripType, TripType.ONE_WAY);
  const returnDate = process.env.RETURN_DATE ? parseDate('RETURN_DATE', process.env.RETURN_DATE) : undefined;

  if (tripType === TripType.ROUND_TRIP && !returnDate) {
    throw new Error('RETURN_DATE is required when TRIP_TYPE=ROUND_TRIP.');
  }

  return {
    searchId: 'aerolineas-diagnostic',
    origin: readRequired('ORIGIN').toUpperCase(),
    destination: readRequired('DESTINATION').toUpperCase(),
    departureDate: parseDate('DEPARTURE_DATE', readRequired('DEPARTURE_DATE')),
    returnDate,
    tripType,
    cabinClass: readEnum('CABIN_CLASS', CabinClass, CabinClass.ECONOMY),
    currency: Currency.ARS,
    adults: Number(process.env.ADULTS ?? 1),
    children: Number(process.env.CHILDREN ?? 0),
    infants: Number(process.env.INFANTS ?? 0),
  };
}

function readRequired(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function parseDate(name: string, value: string): Date {
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`${name} must use YYYY-MM-DD format.`);
  }
  return date;
}

function readEnum<T extends Record<string, string>>(name: string, values: T, fallback: T[keyof T]): T[keyof T] {
  const value = process.env[name] ?? fallback;
  if (!Object.values(values).includes(value)) {
    throw new Error(`${name} must be one of: ${Object.values(values).join(', ')}.`);
  }
  return value as T[keyof T];
}

function formatDiagnosticError(error: unknown): string {
  if (error instanceof AerolineasHttpError) {
    const hints: Record<number, string> = {
      401: 'Unauthorized. Hypothesis: token missing, expired, or rejected by the API.',
      403: 'Forbidden. Hypothesis: request blocked by gateway, headers, origin, or rate limiting.',
    };
    return [
      error.message,
      error.statusCode ? `Status code: ${error.statusCode}.` : null,
      error.responseBody ? `Response body: ${error.responseBody}` : null,
      error.statusCode ? hints[error.statusCode] : null,
    ].filter(Boolean).join(' ');
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function formatSegments(segments: NonNullable<import('../../../domain/models/flight-quote.model').FlightQuote['metadata']>['outboundSegments']): string {
  if (!segments?.length) {
    return 'none';
  }
  return segments
    .map((segment) => `${segment.flightNumber ?? 'flight'} ${segment.origin ?? '?'}-${segment.destination ?? '?'} ${segment.departureDateTime ?? ''}`.trim())
    .join(' / ');
}

void run();
