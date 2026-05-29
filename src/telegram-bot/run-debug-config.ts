import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { maskList, maskValue } from '../shared/config/system-check.formatter';
import { getTelegramBotMe } from './application/telegram-bot-commands';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
})
class TelegramDebugConfigModule {}

async function run(): Promise<void> {
  const logger = new Logger('TelegramDebugConfig');
  const app = await NestFactory.createApplicationContext(TelegramDebugConfigModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const config = app.get(ConfigService);
    const token = config.get<string>('telegramBotToken') ?? '';
    const adminChatIds = config.get<string[]>('telegramAdminChatIds') ?? [];
    const allowedChatIds = config.get<string[]>('telegramAllowedChatIds') ?? [];
    const legacyAllowedChatId = config.get<string>('telegramAllowedChatId');
    const defaultChatId = config.get<string>('telegramChatId');

    logger.log('Telegram debug config');
    logger.log(`Bot enabled: ${config.get<boolean>('enableTelegramBot') === true ? 'yes' : 'no'}`);
    logger.log(`Access mode: ${config.get<string>('telegramAccessMode') ?? 'approval'}`);
    logger.log(`Admins configured: ${adminChatIds.length} (${maskList(adminChatIds)})`);
    logger.log(`Allowed chats legacy: ${allowedChatIds.length} (${maskList(allowedChatIds)})`);
    logger.log(`Single legacy allowed chat: ${maskValue(legacyAllowedChatId)}`);
    logger.log(`Default notification chat TELEGRAM_CHAT_ID: ${maskValue(defaultChatId)}`);
    logger.log(`Parse mode: ${config.get<string>('telegramParseMode') ?? 'none'}`);
    logger.log(`Polling interval ms: ${config.get<number>('telegramPollingIntervalMs') ?? 3000}`);
    logger.log(`Wizard TTL minutes: ${config.get<number>('telegramWizardTtlMinutes') ?? 15}`);
    logger.log(`Run watch after create: ${config.get<boolean>('runWatchAfterCreate') === true ? 'yes' : 'no'}`);
    logger.log(`Max searches per user: ${config.get<number>('maxSearchesPerUser') ?? 5}`);
    logger.log('Para conocer un chatId, escribí /mi_chat_id al bot desde ese chat.');

    if (!token.trim()) {
      logger.warn('TELEGRAM_BOT_TOKEN is not configured; cannot call getMe.');
      return;
    }

    const me = await getTelegramBotMe(token);
    logger.log(`Bot getMe: ${me.username ? `@${me.username}` : me.first_name}`);
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
