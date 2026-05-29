import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { resolveNestLogLevels } from './shared/config/logger.config';
import { TelegramBotService } from './telegram-bot/application/telegram-bot.service';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: resolveNestLogLevels(),
  });
  const config = app.get(ConfigService);

  if (config.get<boolean>('enableTelegramBot') === true) {
    app.get(TelegramBotService).startPolling();
  }
}

void bootstrap();
