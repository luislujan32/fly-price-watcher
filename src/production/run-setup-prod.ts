import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getModelToken, MongooseModule } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Model } from 'mongoose';
import { FlightSearchModel, FlightSearchSchema } from '../flight-searches/infrastructure/mongoose/flight-search.schema';
import { SeedFlightSearches } from '../seed/seed-flight-searches';
import { SeedModule } from '../seed/seed.module';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { DatabaseModule } from '../shared/database/database.module';
import { setTelegramBotCommands } from '../telegram-bot/application/telegram-bot-commands';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
    MongooseModule.forFeature([{ name: FlightSearchModel.name, schema: FlightSearchSchema }]),
    SeedModule,
  ],
})
class ProdSetupModule {}

async function run(): Promise<void> {
  const logger = new Logger('ProdSetup');
  const app = await NestFactory.createApplicationContext(ProdSetupModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const model = app.get<Model<FlightSearchModel>>(getModelToken(FlightSearchModel.name));
    const droppedIndexes = await model.syncIndexes();
    logger.log(`FlightSearch indexes synced. Dropped: ${droppedIndexes.length ? droppedIndexes.join(', ') : 'none'}.`);

    const token = app.get(ConfigService).get<string>('telegramBotToken');
    await setTelegramBotCommands(token ?? '');
    logger.log('Telegram bot commands registered.');

    if (process.env.RUN_SEED_ON_SETUP === 'true') {
      await app.get(SeedFlightSearches).run();
      logger.log('Seed executed because RUN_SEED_ON_SETUP=true.');
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
