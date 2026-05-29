import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { SeedFlightSearches } from './seed-flight-searches';

async function runSeed(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveNestLogLevels(),
  });
  await app.get(SeedFlightSearches).run();
  await app.close();
}

void runSeed();
