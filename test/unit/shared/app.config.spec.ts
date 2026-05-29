import { appConfig } from '../../../src/shared/config/app.config';

describe('appConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.ENABLE_TELEGRAM_BOT;
    delete process.env.TELEGRAM_ACCESS_MODE;
    delete process.env.TELEGRAM_ADMIN_CHAT_IDS;
    delete process.env.MAX_SEARCHES_PER_USER;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('enables Telegram bot with ENABLE_TELEGRAM_BOT=true', () => {
    process.env.ENABLE_TELEGRAM_BOT = 'true';

    expect(appConfig().enableTelegramBot).toBe(true);
  });

  it('disables Telegram bot by default', () => {
    expect(appConfig().enableTelegramBot).toBe(false);
  });

  it('reads Telegram approval access config', () => {
    process.env.TELEGRAM_ACCESS_MODE = 'approval';
    process.env.TELEGRAM_ADMIN_CHAT_IDS = '175,999';
    process.env.MAX_SEARCHES_PER_USER = '7';

    expect(appConfig()).toMatchObject({
      telegramAccessMode: 'approval',
      telegramAdminChatIds: ['175', '999'],
      maxSearchesPerUser: 7,
    });
  });
});
