import { parseTelegramAdminChatIds, parseTelegramAllowedChatIds } from '../../../src/shared/config/telegram-access.config';

describe('telegram access config', () => {
  it('parses comma-separated allowed chat ids', () => {
    expect(parseTelegramAllowedChatIds({ TELEGRAM_ALLOWED_CHAT_IDS: '123, 456,789' })).toEqual(['123', '456', '789']);
  });

  it('keeps compatibility with TELEGRAM_ALLOWED_CHAT_ID', () => {
    expect(parseTelegramAllowedChatIds({ TELEGRAM_ALLOWED_CHAT_ID: '123' })).toEqual(['123']);
  });

  it('deduplicates ids from both variables', () => {
    expect(parseTelegramAllowedChatIds({
      TELEGRAM_ALLOWED_CHAT_IDS: '123,456',
      TELEGRAM_ALLOWED_CHAT_ID: '123',
    })).toEqual(['123', '456']);
  });

  it('parses admin chat ids', () => {
    expect(parseTelegramAdminChatIds({ TELEGRAM_ADMIN_CHAT_IDS: '175, 999' })).toEqual(['175', '999']);
  });
});
