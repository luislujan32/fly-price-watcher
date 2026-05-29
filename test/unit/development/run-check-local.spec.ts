import { localTelegramAccessWarnings } from '../../../src/development/telegram-access-local-check';

describe('local system check', () => {
  it('warns when approval mode has no admins configured', () => {
    expect(localTelegramAccessWarnings({
      enableTelegramBot: true,
      accessMode: 'approval',
      adminChatCount: 0,
      allowedChatCount: 0,
      legacyAllowedChatConfigured: false,
    })).toContain('No TELEGRAM_ADMIN_CHAT_IDS configured. Las solicitudes no podrán notificarse.');
  });

  it('warns when legacy allowlist variables are configured', () => {
    expect(localTelegramAccessWarnings({
      enableTelegramBot: true,
      accessMode: 'approval',
      adminChatCount: 1,
      allowedChatCount: 1,
      legacyAllowedChatConfigured: false,
    })).toContain('Legacy allowlist configured. TELEGRAM_ADMIN_CHAT_IDS is the official admin variable; TELEGRAM_ALLOWED_CHAT_IDS/TELEGRAM_ALLOWED_CHAT_ID are legacy allowlists.');
  });
});
