import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { getConnectionToken } from '@nestjs/mongoose';
import { NestFactory } from '@nestjs/core';
import { Connection } from 'mongoose';
import { appConfig } from '../shared/config/app.config';
import { timezoneValidationErrors } from '../shared/config/cron.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { buildSystemCheckLines, buildSystemCheckStatus } from '../shared/config/system-check.formatter';
import { DatabaseModule } from '../shared/database/database.module';
import { getTelegramBotCommands, getTelegramBotMe } from '../telegram-bot/application/telegram-bot-commands';
import { productionTelegramAccessWarnings, validateProductionTelegramAccessConfig } from './telegram-access-prod-check';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    DatabaseModule,
  ],
})
class ProdCheckModule {}

async function run(): Promise<void> {
  const logger = new Logger('ProdCheck');
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];
  const app = await NestFactory.createApplicationContext(ProdCheckModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const config = app.get(ConfigService);
    requireEnv('MONGODB_URI', errors);
    requireEnv('ENABLED_FLIGHT_PROVIDERS', errors);
    requireEnv('NOTIFICATION_CHANNELS', errors);

    const enableTelegramBot = config.get<boolean>('enableTelegramBot') === true;
    const notificationChannels = config.get<string[]>('notificationChannels') ?? [];
    const allowedChatCount = (config.get<string[]>('telegramAllowedChatIds') ?? []).length;
    const adminChatCount = (config.get<string[]>('telegramAdminChatIds') ?? []).length;
    const accessMode = config.get<string>('telegramAccessMode') ?? 'approval';
    const appTimezone = config.get<string>('appTimezone') ?? 'America/Argentina/Buenos_Aires';
    const token = config.get<string>('telegramBotToken');
    errors.push(...timezoneValidationErrors(appTimezone));
    if (enableTelegramBot && !token) {
      errors.push('TELEGRAM_BOT_TOKEN is required when ENABLE_TELEGRAM_BOT=true.');
    }
    errors.push(...validateProductionTelegramAccessConfig({
      enableTelegramBot,
      accessMode,
      adminChatCount,
      allowedChatCount,
    }));
    warnings.push(...productionTelegramAccessWarnings({ enableTelegramBot, accessMode }));
    if (enableTelegramBot && (allowedChatCount > 0 || config.get<string>('telegramAllowedChatId'))) {
      warnings.push('Legacy allowlist configured. TELEGRAM_ALLOWED_CHAT_IDS/TELEGRAM_ALLOWED_CHAT_ID still work, but TELEGRAM_ADMIN_CHAT_IDS is required for approvals.');
    }
    if (notificationChannels.includes('telegram')) {
      if (!token) {
        errors.push('TELEGRAM_BOT_TOKEN is required when NOTIFICATION_CHANNELS includes telegram.');
      }
      if (!config.get<string>('telegramChatId')) {
        errors.push('TELEGRAM_CHAT_ID is required when NOTIFICATION_CHANNELS includes telegram.');
      }
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
      try {
        const commands = await getTelegramBotCommands(token);
        info.push(`Telegram commands registered: ${commands.map((item) => `/${item.command}`).join(', ') || 'none'}.`);
      } catch (error) {
        warnings.push(`Could not verify Telegram commands: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    for (const line of buildSystemCheckLines(buildSystemCheckStatus(config, mongoStatus, telegramBotUsername))) {
      logger.log(line);
    }
    for (const line of info) {
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
