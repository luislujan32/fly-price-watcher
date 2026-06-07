import 'reflect-metadata';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { Logger, Module } from '@nestjs/common';
import { appConfig } from '../../../../shared/config/app.config';
import { resolveNestLogLevels } from '../../../../shared/config/logger.config';
import { CabinClass } from '../../../../flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuoteRankingService } from '../../../application/services/flight-quote-ranking.service';
import { JetSmartApiClient } from './jetsmart-api.client';
import { JetSmartProvider } from './jetsmart.provider';
import { JetSmartQueryMapper } from './jetsmart-query.mapper';
import { JetSmartResponseMapper } from './jetsmart-response.mapper';

function defaultFutureDateIso(daysAhead = 30): string {
  const date = new Date();
  date.setUTCHours(12, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + daysAhead);
  return date.toISOString();
}

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
  providers: [
    FlightQuoteRankingService,
    JetSmartQueryMapper,
    JetSmartApiClient,
    JetSmartResponseMapper,
    JetSmartProvider,
  ],
})
class JetSmartTestModule {}

async function run(): Promise<void> {
  const logger = new Logger('JetSmartTest');
  const app = await NestFactory.createApplicationContext(JetSmartTestModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const provider = app.get(JetSmartProvider);
    const quotes = await provider.search({
      searchId: 'jetsmart-test',
      origin: process.env.JETSMART_TEST_ORIGIN ?? 'AEP',
      destination: process.env.JETSMART_TEST_DESTINATION ?? 'MDZ',
      departureDate: new Date(process.env.JETSMART_TEST_DEPARTURE ?? defaultFutureDateIso()),
      returnDate: process.env.JETSMART_TEST_RETURN ? new Date(process.env.JETSMART_TEST_RETURN) : undefined,
      tripType: process.env.JETSMART_TEST_RETURN ? TripType.ROUND_TRIP : TripType.ONE_WAY,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: 1,
    });

    logger.log(`JetSMART quotes: ${quotes.length}`);
    if (quotes[0]) {
      logger.log(JSON.stringify(quotes[0], null, 2));
    }
  } finally {
    await app.close();
  }
}

void run();
