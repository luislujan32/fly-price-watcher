import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type TelegramBotUpdate = {
  update_id: number;
  message?: {
    chat: {
      id: number | string;
    };
    from?: TelegramBotUser;
    text?: string;
  };
  callback_query?: {
    id: string;
    data?: string;
    from?: TelegramBotUser;
    message?: {
      chat: {
        id: number | string;
      };
    };
  };
};

export type TelegramBotUser = {
  id: number | string;
  first_name?: string;
  last_name?: string;
  username?: string;
};

export type TelegramInlineKeyboardMarkup = {
  inline_keyboard: Array<Array<{
    text: string;
    callback_data: string;
  }>>;
};

export class TelegramApiError extends Error {
  constructor(
    message: string,
    readonly method: string,
    readonly status?: number,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

@Injectable()
export class TelegramBotClient {
  private readonly logger = new Logger(TelegramBotClient.name);

  constructor(private readonly config: ConfigService) {}

  async getUpdates(offset?: number): Promise<TelegramBotUpdate[]> {
    const token = this.token();
    const params = new URLSearchParams();
    if (offset !== undefined) {
      params.set('offset', String(offset));
    }
    const query = params.toString();
    const response = await this.request('getUpdates', `https://api.telegram.org/bot${token}/getUpdates${query ? `?${query}` : ''}`);
    const body = await response.json() as { ok?: boolean; result?: TelegramBotUpdate[]; description?: string };
    if (!body.ok) {
      throw new TelegramApiError(`Telegram getUpdates error: ${body.description ?? 'unknown error'}`, 'getUpdates');
    }
    return body.result ?? [];
  }

  async sendMessage(chatId: string, text: string, options?: { replyMarkup?: TelegramInlineKeyboardMarkup }): Promise<void> {
    const token = this.token();
    await this.request('sendMessage', `https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        ...(options?.replyMarkup ? { reply_markup: options.replyMarkup } : {}),
      }),
    }, chatId);
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<void> {
    const token = this.token();
    await this.request('answerCallbackQuery', `https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callback_query_id: callbackQueryId,
        ...(text ? { text } : {}),
      }),
    });
  }

  private token(): string {
    const token = this.config.get<string>('telegramBotToken');
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN is required to run telegram bot polling.');
    }
    return token;
  }

  private async request(method: string, url: string, init?: RequestInit, chatId?: string): Promise<Response> {
    const maxAttempts = this.retries() + 1;
    let lastError: unknown;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.fetchWithTimeout(url, init);
        if (response.ok) {
          return response;
        }
        const bodyText = await response.text();
        const retryAfter = this.retryAfterSeconds(bodyText);
        const error = new TelegramApiError(
          `Telegram ${method} error: ${response.status} ${bodyText}`,
          method,
          response.status,
          retryAfter,
        );
        if (!this.shouldRetry(error) || attempt === maxAttempts) {
          throw error;
        }
        this.logRetry(method, attempt, chatId, error);
        await this.delay(this.retryDelayMs(error));
        continue;
      } catch (error) {
        lastError = error;
        if (!this.shouldRetry(error) || attempt === maxAttempts) {
          this.logger.error(`Telegram request failed permanently method=${method}${chatId ? ` chatId=${this.mask(chatId)}` : ''}: ${this.errorMessage(error)}`);
          throw error instanceof TelegramApiError
            ? error
            : new TelegramApiError(`Telegram ${method} failed: ${this.errorMessage(error)}`, method);
        }
        this.logRetry(method, attempt, chatId, error);
        await this.delay(this.retryDelayMs(error));
      }
    }
    throw new TelegramApiError(`Telegram ${method} failed: ${this.errorMessage(lastError)}`, method);
  }

  private async fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs());
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (error instanceof TelegramApiError) {
      return error.status === 429 || (error.status !== undefined && error.status >= 500);
    }
    if (error instanceof Error) {
      return error.name === 'AbortError'
        || error.message.includes('fetch failed')
        || error.message.includes('Connect Timeout')
        || error.message.includes('UND_ERR_CONNECT_TIMEOUT');
    }
    return false;
  }

  private logRetry(method: string, attempt: number, chatId: string | undefined, error: unknown): void {
    this.logger.warn(
      `Telegram request failed method=${method}${chatId ? ` chatId=${this.mask(chatId)}` : ''}: ${this.errorMessage(error)}. Telegram request retrying attempt=${attempt}.`,
    );
  }

  private retryAfterSeconds(bodyText: string): number | undefined {
    try {
      const body = JSON.parse(bodyText) as { parameters?: { retry_after?: number } };
      return body.parameters?.retry_after;
    } catch {
      return undefined;
    }
  }

  private retryDelayMs(error: unknown): number {
    if (error instanceof TelegramApiError && error.retryAfterSeconds !== undefined) {
      return error.retryAfterSeconds * 1000;
    }
    return 250;
  }

  private timeoutMs(): number {
    const value = this.config.get<number>('telegramHttpTimeoutMs') ?? 10000;
    return Number.isFinite(value) && value > 0 ? value : 10000;
  }

  private retries(): number {
    const value = this.config.get<number>('telegramHttpRetries') ?? 1;
    return Number.isFinite(value) && value >= 0 ? value : 1;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private mask(value: string): string {
    return value.length <= 4 ? '****' : `${value.slice(0, 2)}***${value.slice(-2)}`;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }
}
