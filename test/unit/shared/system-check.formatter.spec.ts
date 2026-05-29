import { ConfigService } from '@nestjs/config';
import {
  buildSystemCheckLines,
  buildSystemCheckStatus,
  maskValue,
} from '../../../src/shared/config/system-check.formatter';

describe('system check formatter', () => {
  it('masks sensitive values', () => {
    expect(maskValue(undefined)).toBe('not configured');
    expect(maskValue('1234')).toBe('****');
    expect(maskValue('123456789')).toBe('12***89');
  });

  it('builds readable status lines', () => {
    const lines = buildSystemCheckLines({
      mongoStatus: 'connected',
      enableTelegramBot: true,
      telegramBotUsername: '@flight_bot',
      telegramAccessMode: 'approval',
      telegramAdminChatCount: 1,
      telegramAllowedChatCount: 2,
      telegramLegacyAllowedChatConfigured: true,
      telegramDefaultChatConfigured: true,
      enableScheduler: true,
      dailyRunTime: '08:00',
      dailyCron: '0 8 * * *',
      enabledFlightProviders: ['AEROLINEAS_ARGENTINAS'],
      notificationChannels: ['console', 'telegram'],
      forceDailySummary: true,
      runWatchAfterCreate: true,
      maxSearchesPerUser: 5,
    });

    expect(lines).toContain('Mongo: connected');
    expect(lines).toContain('Telegram bot: enabled (@flight_bot)');
    expect(lines).toContain('Telegram access mode: approval');
    expect(lines).toContain('Telegram admin chats: 1');
    expect(lines).toContain('Telegram allowed chats legacy: 2');
    expect(lines).toContain('Telegram legacy single allowed chat: configured');
    expect(lines).toContain('Telegram default notification chat: configured');
    expect(lines).toContain('Run watch after create: enabled');
    expect(lines).toContain('Max searches per user: 5');
    expect(lines).toContain('Daily run time: 08:00');
    expect(lines).toContain('Effective cron: 0 8 * * *');
    expect(lines).toContain('Force daily summary: enabled - diagnostic mode');
  });

  it('reads status from ConfigService', () => {
    const config = {
      get: jest.fn((key: string) => ({
        enableTelegramBot: true,
        telegramAccessMode: 'approval',
        telegramAdminChatIds: ['111111111'],
        telegramAllowedChatIds: ['123456789'],
        telegramAllowedChatId: '123456789',
        telegramChatId: '111111111',
        enableScheduler: true,
        dailyRunTime: '08:00',
        dailyCron: '0 8 * * *',
        enabledFlightProviders: ['FAKE'],
        notificationChannels: ['console'],
        forceDailySummary: false,
        runWatchAfterCreate: true,
        maxSearchesPerUser: 5,
      })[key]),
    } as unknown as ConfigService;

    expect(buildSystemCheckStatus(config, 'connected', '@bot')).toEqual({
      mongoStatus: 'connected',
      enableTelegramBot: true,
      telegramBotUsername: '@bot',
      telegramAccessMode: 'approval',
      telegramAdminChatCount: 1,
      telegramAllowedChatCount: 1,
      telegramLegacyAllowedChatConfigured: true,
      telegramDefaultChatConfigured: true,
      enableScheduler: true,
      dailyRunTime: '08:00',
      dailyCron: '0 8 * * *',
      enabledFlightProviders: ['FAKE'],
      notificationChannels: ['console'],
      forceDailySummary: false,
      runWatchAfterCreate: true,
      maxSearchesPerUser: 5,
    });
  });
});
