import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MigrateLegacyTelegramChatIdUseCase } from './application/use-cases/migrate-legacy-telegram-chat-id.use-case';
import { FlightSearchesModule } from './flight-searches.module';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { DatabaseModule } from '../shared/database/database.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
    FlightSearchesModule,
  ],
})
class MigrateTelegramChatIdRunnerModule {}

async function run(): Promise<void> {
  const logger = new Logger('MigrateTelegramChatId');
  const app = await NestFactory.createApplicationContext(MigrateTelegramChatIdRunnerModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const config = app.get(ConfigService);
    const chatId = (process.env.MIGRATE_TELEGRAM_CHAT_ID ?? config.get<string>('telegramAllowedChatId') ?? '').trim();
    if (!chatId) {
      throw new Error('Missing chat id. Set MIGRATE_TELEGRAM_CHAT_ID or TELEGRAM_ALLOWED_CHAT_ID.');
    }

    const result = await app.get(MigrateLegacyTelegramChatIdUseCase).execute(chatId);
    logger.log(`Legacy searches found: ${result.foundCount}.`);
    logger.log(`Legacy searches updated: ${result.updatedCount}.`);

    if (result.updatedNames.length) {
      logger.log(`Updated searches: ${result.updatedNames.join(', ')}.`);
    } else {
      logger.log('No legacy searches to update.');
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
