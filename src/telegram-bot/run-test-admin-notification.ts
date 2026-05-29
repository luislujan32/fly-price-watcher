import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';
import { maskValue } from '../shared/config/system-check.formatter';
import { sendTelegramAdminNotification } from './application/telegram-admin-notification';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
})
class TelegramTestAdminNotificationModule {}

async function run(): Promise<void> {
  const logger = new Logger('TelegramTestAdminNotification');
  const app = await NestFactory.createApplicationContext(TelegramTestAdminNotificationModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const config = app.get(ConfigService);
    const token = config.get<string>('telegramBotToken') ?? '';
    const adminChatIds = config.get<string[]>('telegramAdminChatIds') ?? [];

    if (!adminChatIds.length) {
      throw new Error('TELEGRAM_ADMIN_CHAT_IDS is required to test admin notifications.');
    }

    const result = await sendTelegramAdminNotification({
      token,
      adminChatIds,
      text: '✅ Test de notificación admin OK',
    });

    logger.log(`Admin notification attempts: ${result.attempts}.`);
    logger.log(`Admin notification successes: ${result.successes}.`);
    for (const failure of result.failures) {
      logger.error(`Admin notification failed for chatId=${maskValue(failure.chatId)}: ${failure.error}`);
    }
    if (result.successes === 0) {
      process.exitCode = 1;
      logger.error('No admin notifications were delivered.');
    }
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
