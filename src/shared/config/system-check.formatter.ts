import { ConfigService } from '@nestjs/config';

export type SystemCheckStatus = {
  mongoStatus: string;
  enableTelegramBot: boolean;
  telegramBotUsername?: string;
  telegramAccessMode: string;
  telegramAdminChatCount: number;
  telegramAllowedChatCount: number;
  telegramLegacyAllowedChatConfigured: boolean;
  telegramDefaultChatConfigured: boolean;
  enableScheduler: boolean;
  dailyRunTime?: string;
  dailyCron?: string;
  enabledFlightProviders: string[];
  notificationChannels: string[];
  forceDailySummary: boolean;
  runWatchAfterCreate: boolean;
  maxSearchesPerUser: number;
};

export function buildSystemCheckLines(status: SystemCheckStatus): string[] {
  return [
    'System check summary',
    `Mongo: ${status.mongoStatus}`,
    `Telegram bot: ${status.enableTelegramBot ? 'enabled' : 'disabled'}${status.telegramBotUsername ? ` (${status.telegramBotUsername})` : ''}`,
    `Telegram access mode: ${status.telegramAccessMode}`,
    `Telegram admin chats: ${status.telegramAdminChatCount}`,
    `Telegram allowed chats legacy: ${status.telegramAllowedChatCount}`,
    `Telegram legacy single allowed chat: ${status.telegramLegacyAllowedChatConfigured ? 'configured' : 'not configured'}`,
    `Telegram default notification chat: ${status.telegramDefaultChatConfigured ? 'configured' : 'not configured'}`,
    `Run watch after create: ${status.runWatchAfterCreate ? 'enabled' : 'disabled'}`,
    `Max searches per user: ${status.maxSearchesPerUser}`,
    `Scheduler: ${status.enableScheduler ? 'enabled' : 'disabled'}`,
    `Daily run time: ${status.dailyRunTime ?? '08:00'}`,
    `Effective cron: ${status.dailyCron ?? 'not configured'}`,
    `Providers: ${formatList(status.enabledFlightProviders)}`,
    `Notification channels: ${formatList(status.notificationChannels)}`,
    `Force daily summary: ${status.forceDailySummary ? 'enabled - diagnostic mode' : 'disabled'}`,
  ];
}

export function buildSystemCheckStatus(config: ConfigService, mongoStatus: string, telegramBotUsername?: string): SystemCheckStatus {
  return {
    mongoStatus,
    enableTelegramBot: config.get<boolean>('enableTelegramBot') === true,
    telegramBotUsername,
    telegramAccessMode: config.get<string>('telegramAccessMode') ?? 'approval',
    telegramAdminChatCount: (config.get<string[]>('telegramAdminChatIds') ?? []).length,
    telegramAllowedChatCount: (config.get<string[]>('telegramAllowedChatIds') ?? []).length,
    telegramLegacyAllowedChatConfigured: Boolean(config.get<string>('telegramAllowedChatId')),
    telegramDefaultChatConfigured: Boolean(config.get<string>('telegramChatId')),
    enableScheduler: config.get<boolean>('enableScheduler') === true,
    dailyRunTime: config.get<string>('dailyRunTime'),
    dailyCron: config.get<string>('dailyCron'),
    enabledFlightProviders: config.get<string[]>('enabledFlightProviders') ?? [],
    notificationChannels: config.get<string[]>('notificationChannels') ?? [],
    forceDailySummary: config.get<boolean>('forceDailySummary') === true,
    runWatchAfterCreate: config.get<boolean>('runWatchAfterCreate') === true,
    maxSearchesPerUser: config.get<number>('maxSearchesPerUser') ?? 5,
  };
}

export function maskValue(value?: string): string {
  if (!value) {
    return 'not configured';
  }
  if (value.length <= 4) {
    return '*'.repeat(value.length);
  }
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

export function maskList(values: string[]): string {
  return values.length ? values.map(maskValue).join(', ') : 'not configured';
}

function formatList(values: string[]): string {
  return values.length ? values.join(', ') : 'not configured';
}
