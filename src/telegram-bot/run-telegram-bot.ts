import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FlightSearchesModule } from '../flight-searches/flight-searches.module';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { DatabaseModule } from '../shared/database/database.module';
import { TelegramBotService } from './application/telegram-bot.service';
import { TelegramBotModule } from './telegram-bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
    FlightSearchesModule,
    TelegramBotModule,
  ],
})
class TelegramBotRunnerModule {}

async function run(): Promise<void> {
  const logger = new Logger('TelegramBotRunner');
  const app = await NestFactory.createApplicationContext(TelegramBotRunnerModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const started = app.get(TelegramBotService).startPolling();
    if (!started) {
      await app.close();
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
    await app.close();
  }
}

void run();
