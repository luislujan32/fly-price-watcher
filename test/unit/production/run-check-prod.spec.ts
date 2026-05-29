import {
  productionTelegramAccessWarnings,
  validateProductionTelegramAccessConfig,
} from '../../../src/production/telegram-access-prod-check';

describe('production system check', () => {
  it('fails when bot is enabled in approval mode without admins', () => {
    expect(validateProductionTelegramAccessConfig({
      enableTelegramBot: true,
      accessMode: 'approval',
      adminChatCount: 0,
      allowedChatCount: 0,
    })).toContain('TELEGRAM_ADMIN_CHAT_IDS is required when ENABLE_TELEGRAM_BOT=true and TELEGRAM_ACCESS_MODE is approval or closed in production.');
  });

  it('passes open mode without admins', () => {
    expect(validateProductionTelegramAccessConfig({
      enableTelegramBot: true,
      accessMode: 'open',
      adminChatCount: 0,
      allowedChatCount: 0,
    })).toEqual([]);
  });

  it('warns when production access mode is open', () => {
    expect(productionTelegramAccessWarnings({
      enableTelegramBot: true,
      accessMode: 'open',
    })).toContain('TELEGRAM_ACCESS_MODE=open: cualquier usuario podrá usar el bot. Usalo sólo si realmente querés acceso público.');
  });
});
