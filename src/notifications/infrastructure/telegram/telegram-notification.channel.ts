import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationMessage } from '../../domain/models/notification-message.model';
import { NotificationChannelPort } from '../../domain/ports/notification-channel.port';

type TelegramParseMode = 'none' | 'MarkdownV2' | 'HTML';

@Injectable()
export class TelegramNotificationChannel implements NotificationChannelPort {
  readonly channelName = 'telegram';
  private readonly logger = new Logger(TelegramNotificationChannel.name);

  constructor(private readonly config: ConfigService) {}

  isConfigured(): boolean {
    return Boolean(this.config.get<string>('telegramBotToken'));
  }

  async send(message: NotificationMessage): Promise<void> {
    const token = this.config.get<string>('telegramBotToken');
    const chatId = this.chatId(message);
    if (!token || !chatId) {
      this.logger.warn('Telegram notification skipped because TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is missing.');
      return;
    }

    const payload = this.buildPayload(chatId, message);
    const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Telegram API error: ${response.status} ${await response.text()}`);
    }
  }

  private buildPayload(chatId: string, message: NotificationMessage): {
    chat_id: string;
    text: string;
    parse_mode?: 'MarkdownV2' | 'HTML';
    reply_markup?: NotificationMessage['replyMarkup'];
  } {
    const parseMode = this.parseMode();
    const plainText = message.body;

    if (parseMode === 'MarkdownV2') {
      return {
        chat_id: chatId,
        text: this.escapeMarkdownV2(plainText),
        parse_mode: 'MarkdownV2',
        ...(message.replyMarkup ? { reply_markup: message.replyMarkup } : {}),
      };
    }

    if (parseMode === 'HTML') {
      return {
        chat_id: chatId,
        text: this.escapeHtml(plainText),
        parse_mode: 'HTML',
        ...(message.replyMarkup ? { reply_markup: message.replyMarkup } : {}),
      };
    }

    return {
      chat_id: chatId,
      text: plainText,
      ...(message.replyMarkup ? { reply_markup: message.replyMarkup } : {}),
    };
  }

  private parseMode(): TelegramParseMode {
    const value = this.config.get<string>('telegramParseMode') ?? 'none';
    if (value === 'MarkdownV2' || value === 'HTML') {
      return value;
    }
    return 'none';
  }

  private chatId(message: NotificationMessage): string | undefined {
    const metadataChatId = message.metadata?.telegramChatId;
    if (metadataChatId !== undefined && metadataChatId !== null && String(metadataChatId).trim()) {
      return String(metadataChatId);
    }
    return this.config.get<string>('telegramChatId');
  }

  private escapeMarkdownV2(value: string): string {
    return value.replace(/[_*[\]()~`>#+\-=|{}.!]/g, (character) => `\\${character}`);
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }
}
