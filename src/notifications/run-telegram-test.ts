import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
})
class TelegramDiagnosticModule {}

async function run(): Promise<void> {
  const logger = new Logger('TelegramDiagnostic');
  const app = await NestFactory.createApplicationContext(TelegramDiagnosticModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required to run telegram:test.');
    }
    if (!chatId) {
      throw new Error('TELEGRAM_CHAT_ID is required to run telegram:test.');
    }

    await sendTelegramTestMessage({ token, chatId });
    logger.log('Telegram test message sent.');
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

async function sendTelegramTestMessage(params: { token: string; chatId: string }): Promise<void> {
  const response = await fetch(`https://api.telegram.org/bot${params.token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: params.chatId,
      text: 'Flight Price Watcher: Telegram OK',
    }),
  });

  if (!response.ok) {
    throw new Error(`Telegram API error: ${response.status} ${await response.text()}`);
  }
}

void run();
