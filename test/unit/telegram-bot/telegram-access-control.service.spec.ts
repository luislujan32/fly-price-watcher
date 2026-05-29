import { ConfigService } from '@nestjs/config';
import { TelegramAccessControlService } from '../../../src/telegram-bot/application/telegram-access-control.service';
import { BotUserStatus } from '../../../src/telegram-bot/domain/enums/bot-user-status.enum';
import { BotUserRepository } from '../../../src/telegram-bot/domain/repositories/bot-user.repository';

describe('TelegramAccessControlService', () => {
  it('allows configured chats', async () => {
    const service = serviceWith({ telegramAllowedChatIds: ['123', '456'], nodeEnv: 'production' });

    await expect(service.isAllowed('123')).resolves.toBe(true);
    await expect(service.isAllowed('999')).resolves.toBe(false);
  });

  it('keeps compatibility with TELEGRAM_ALLOWED_CHAT_ID', async () => {
    const service = serviceWith({ telegramAllowedChatIds: [], telegramAllowedChatId: '123', nodeEnv: 'production' });

    await expect(service.isAllowed('123')).resolves.toBe(true);
    expect(service.allowedChatIds()).toEqual(['123']);
  });

  it('treats TELEGRAM_ADMIN_CHAT_IDS as source of truth even when stored user is not admin', async () => {
    const service = serviceWith(
      { telegramAllowedChatIds: [], telegramAdminChatIds: ['123'], telegramAccessMode: 'approval' },
      BotUserStatus.APPROVED,
      false,
    );

    expect(service.isAdmin('123')).toBe(true);
    await expect(service.isAllowed('123')).resolves.toBe(true);
  });

  it('allows users with approved status in approval mode', async () => {
    const service = serviceWith({ telegramAllowedChatIds: [], telegramAccessMode: 'approval' }, BotUserStatus.APPROVED);

    await expect(service.isAllowed('123')).resolves.toBe(true);
  });

  it('blocks pending users in approval mode', async () => {
    const service = serviceWith({ telegramAllowedChatIds: [], telegramAccessMode: 'approval' }, BotUserStatus.PENDING);

    await expect(service.isAllowed('123')).resolves.toBe(false);
  });

  it('allows everyone in open mode', async () => {
    const service = serviceWith({ telegramAllowedChatIds: [], telegramAccessMode: 'open' });

    await expect(service.isAllowed('123')).resolves.toBe(true);
  });

  it('keeps blocked users blocked even in open mode', async () => {
    const service = serviceWith({ telegramAllowedChatIds: [], telegramAccessMode: 'open' }, BotUserStatus.BLOCKED);

    await expect(service.isAllowed('123')).resolves.toBe(false);
  });
});

function serviceWith(values: Record<string, unknown>, status?: BotUserStatus, isAdmin = false): TelegramAccessControlService {
  const users = {
    findByChatId: jest.fn(async () => status ? { status, isAdmin } : null),
  } as unknown as BotUserRepository;
  return new TelegramAccessControlService({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService, users);
}
