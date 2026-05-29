import 'reflect-metadata';
import { Logger, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { setTelegramBotCommands, TELEGRAM_BOT_COMMANDS } from './application/telegram-bot-commands';
import { appConfig } from '../shared/config/app.config';
import { resolveNestLogLevels } from '../shared/config/logger.config';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true, load: [appConfig] })],
})
class TelegramSetCommandsModule {}

async function run(): Promise<void> {
  const logger = new Logger('TelegramSetCommands');
  const app = await NestFactory.createApplicationContext(TelegramSetCommandsModule, {
    logger: resolveNestLogLevels(),
  });

  try {
    const token = app.get(ConfigService).get<string>('telegramBotToken');
    await setTelegramBotCommands(token ?? '');
    logger.log(`Telegram bot commands registered: ${TELEGRAM_BOT_COMMANDS.map((item) => `/${item.command}`).join(', ')}.`);
  } catch (error) {
    process.exitCode = 1;
    logger.error(error instanceof Error ? error.message : String(error));
  } finally {
    await app.close();
  }
}

void run();
