import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Connection } from 'mongoose';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { buildSystemCheckLines, buildSystemCheckStatus } from '../shared/config/system-check.formatter';
import { DatabaseModule } from '../shared/database/database.module';
import { getTelegramBotMe } from '../telegram-bot/application/telegram-bot-commands';
import { localTelegramAccessWarnings } from './telegram-access-local-check';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
  ],
})
class LocalCheckModule {}

async function run(): Promise<void> {
  const logger = new Logger('LocalCheck');
  const errors: string[] = [];
  const warnings: string[] = [];
  const app = await NestFactory.createApplicationContext(LocalCheckModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const config = app.get(ConfigService);
    requireEnv('MONGODB_URI', errors);
    requireEnv('ENABLED_FLIGHT_PROVIDERS', errors);
    requireEnv('NOTIFICATION_CHANNELS', errors);

    const enableTelegramBot = config.get<boolean>('enableTelegramBot') === true;
    const enableScheduler = config.get<boolean>('enableScheduler') === true;
    const notificationChannels = config.get<string[]>('notificationChannels') ?? [];
    const allowedChatCount = (config.get<string[]>('telegramAllowedChatIds') ?? []).length;
    const adminChatCount = (config.get<string[]>('telegramAdminChatIds') ?? []).length;
    const accessMode = config.get<string>('telegramAccessMode') ?? 'approval';

    if (enableScheduler) {
      if (!config.get<string>('dailyCron')) {
        errors.push('DAILY_RUN_TIME must use HH:mm format or DAILY_CRON must be configured.');
      }
    }

    const token = config.get<string>('telegramBotToken');
    if (notificationChannels.includes('telegram')) {
      if (!token) {
        errors.push('TELEGRAM_BOT_TOKEN is required when NOTIFICATION_CHANNELS includes telegram.');
      }
      if (!config.get<string>('telegramChatId')) {
        warnings.push('TELEGRAM_CHAT_ID is not configured. Watcher notifications will need a per-search telegramChatId.');
      }
    }
    if (enableTelegramBot) {
      if (!token) {
        errors.push('TELEGRAM_BOT_TOKEN is required when ENABLE_TELEGRAM_BOT=true.');
      }
      warnings.push(...localTelegramAccessWarnings({
        enableTelegramBot,
        accessMode,
        adminChatCount,
        allowedChatCount,
        legacyAllowedChatConfigured: Boolean(config.get<string>('telegramAllowedChatId')),
      }));
    }

    const connection = app.get<Connection>(getConnectionToken());
    let mongoStatus = 'not connected';
    if (connection.readyState !== 1) {
      errors.push(`Mongo connection is not ready. readyState=${connection.readyState}.`);
    } else {
      mongoStatus = 'connected';
    }

    let telegramBotUsername: string | undefined;
    if (token) {
      try {
        const me = await getTelegramBotMe(token);
        telegramBotUsername = me.username ? `@${me.username}` : me.first_name;
      } catch (error) {
        warnings.push(`Telegram getMe failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const line of buildSystemCheckLines(buildSystemCheckStatus(config, mongoStatus, telegramBotUsername))) {
      logger.log(line);
    }
    for (const warning of warnings) {
      logger.warn(warning);
    }
    if (errors.length) {
      for (const error of errors) {
        logger.error(error);
      }
      process.exitCode = 1;
      logger.error('❌ System check failed');
      return;
    }
    logger.log('✅ System check passed');
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
    logger.error('❌ System check failed');
  } finally {
    await app.close();
  }
}

function requireEnv(name: string, errors: string[]): void {
  if (!process.env[name]?.trim()) {
    errors.push(`${name} is required.`);
  }
}

void run();
