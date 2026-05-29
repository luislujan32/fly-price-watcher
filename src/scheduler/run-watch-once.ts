import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { FlightPriceWatchService } from './application/services/flight-price-watch.service';

async function runWatchOnce(): Promise<void> {
  const logger = new Logger('WatchOnceRunner');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const result = await app.get(FlightPriceWatchService).runOnce();
    logger.log(
      `Manual watch completed: activeSearches=${result.activeSearches}, providers=${result.providerCodes.join(', ') || 'none'}, snapshots=${result.snapshotsSaved}, watchRuns=${result.watchRunsSaved}, alerts=${result.alertsGenerated}, notificationAttempts=${result.notificationAttempts}, notificationSuccesses=${result.notificationSuccesses}, notificationFailures=${result.notificationFailures}, errors=${result.errors}.`,
    );

    if (result.errors > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

void runWatchOnce();
