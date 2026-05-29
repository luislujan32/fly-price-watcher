import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BotUser } from '../domain/entities/bot-user.entity';
import { BotUserStatus } from '../domain/enums/bot-user-status.enum';
import { BOT_USER_REPOSITORY, BotUserRepository } from '../domain/repositories/bot-user.repository';

export type TelegramAccessMode = 'closed' | 'approval' | 'open';

export type TelegramUserProfile = {
  telegramChatId: string;
  firstName: string;
  lastName?: string;
  username?: string;
};

export type AccessRequestResult =
  | { type: 'allowed'; user?: BotUser }
  | { type: 'pending_created'; user: BotUser }
  | { type: 'pending'; user: BotUser }
  | { type: 'denied'; user?: BotUser };

@Injectable()
export class TelegramAccessControlService {
  constructor(
    private readonly config: ConfigService,
    @Inject(BOT_USER_REPOSITORY)
    private readonly users: BotUserRepository,
  ) {}

  async isAllowed(chatId: string): Promise<boolean> {
    if (this.isAdmin(chatId) || this.isLegacyAllowed(chatId)) {
      return true;
    }
    const user = await this.users.findByChatId(chatId);
    if (user?.status === BotUserStatus.REJECTED || user?.status === BotUserStatus.BLOCKED) {
      return false;
    }
    if (this.accessMode() === 'open') {
      return true;
    }
    if (this.accessMode() === 'closed') {
      return false;
    }

    return user?.status === BotUserStatus.APPROVED;
  }

  async handleStart(profile: TelegramUserProfile): Promise<AccessRequestResult> {
    const chatId = profile.telegramChatId;
    if (this.isAdmin(chatId)) {
      const existing = await this.users.findByChatId(chatId);
      const user = await this.users.upsert(new BotUser({
        ...profile,
        status: BotUserStatus.APPROVED,
        isAdmin: true,
        approvedAt: existing?.approvedAt ?? new Date(),
        approvedBy: 'admin-config',
      }));
      return { type: 'allowed', user };
    }
    if (this.isLegacyAllowed(chatId)) {
      const existing = await this.users.findByChatId(chatId);
      const user = await this.users.upsert(new BotUser({
        ...profile,
        status: BotUserStatus.APPROVED,
        isAdmin: false,
        approvedAt: existing?.approvedAt ?? new Date(),
        approvedBy: existing?.approvedBy ?? 'allowlist',
      }));
      return { type: 'allowed', user };
    }

    const existing = await this.users.findByChatId(chatId);
    if (existing?.status === BotUserStatus.REJECTED || existing?.status === BotUserStatus.BLOCKED) {
      return { type: 'denied', user: existing };
    }
    if (this.accessMode() === 'open') {
      const user = await this.users.upsert(new BotUser({
        ...profile,
        status: BotUserStatus.APPROVED,
        approvedAt: existing?.approvedAt ?? new Date(),
        approvedBy: existing?.approvedBy ?? 'open',
      }));
      return { type: 'allowed', user };
    }

    if (existing?.status === BotUserStatus.APPROVED) {
      return { type: 'allowed', user: existing };
    }
    if (existing?.status === BotUserStatus.PENDING) {
      return { type: 'pending', user: existing };
    }
    if (this.accessMode() === 'closed') {
      return { type: 'denied' };
    }

    const user = await this.users.upsert(new BotUser({
      ...profile,
      status: BotUserStatus.PENDING,
    }));
    return { type: 'pending_created', user };
  }

  async approve(telegramChatId: string, approvedBy: string): Promise<BotUser | null> {
    return this.users.updateStatus(telegramChatId, BotUserStatus.APPROVED, approvedBy);
  }

  async reject(telegramChatId: string): Promise<BotUser | null> {
    return this.users.updateStatus(telegramChatId, BotUserStatus.REJECTED);
  }

  async block(telegramChatId: string): Promise<BotUser | null> {
    return this.users.updateStatus(telegramChatId, BotUserStatus.BLOCKED);
  }

  pendingUsers(): Promise<BotUser[]> {
    return this.users.findByStatus(BotUserStatus.PENDING);
  }

  async usersByStatus(): Promise<Record<BotUserStatus, BotUser[]>> {
    const entries = await Promise.all([
      BotUserStatus.PENDING,
      BotUserStatus.APPROVED,
      BotUserStatus.REJECTED,
      BotUserStatus.BLOCKED,
    ].map(async (status) => [status, await this.users.findByStatus(status)] as const));
    return Object.fromEntries(entries) as Record<BotUserStatus, BotUser[]>;
  }

  userByChatId(chatId: string): Promise<BotUser | null> {
    return this.users.findByChatId(chatId);
  }

  async syncConfiguredAdmins(): Promise<BotUser[]> {
    const synced: BotUser[] = [];
    for (const chatId of this.adminChatIds()) {
      const existing = await this.users.findByChatId(chatId);
      synced.push(await this.users.upsert(new BotUser({
        telegramChatId: chatId,
        firstName: existing?.firstName ?? `Admin ${chatId}`,
        lastName: existing?.lastName,
        username: existing?.username,
        status: BotUserStatus.APPROVED,
        isAdmin: true,
        approvedAt: existing?.approvedAt ?? new Date(),
        approvedBy: 'admin-config',
      })));
    }
    return synced;
  }

  isAdmin(chatId: string): boolean {
    return this.adminChatIds().includes(chatId);
  }

  isLegacyAllowed(chatId: string): boolean {
    return this.allowedChatIds().includes(chatId);
  }

  accessMode(): TelegramAccessMode {
    const value = this.config.get<string>('telegramAccessMode') ?? 'approval';
    if (value === 'closed' || value === 'open') {
      return value;
    }
    return 'approval';
  }

  allowedChatIds(): string[] {
    const configured = this.normalizeChatIds(this.config.get<string[] | string>('telegramAllowedChatIds'));
    const legacy = this.config.get<string>('telegramAllowedChatId');
    return [...new Set([
      ...configured,
      ...(legacy ? [legacy.trim()] : []),
    ])];
  }

  adminChatIds(): string[] {
    return this.normalizeChatIds(this.config.get<string[] | string>('telegramAdminChatIds'));
  }

  private normalizeChatIds(value: string[] | string | undefined): string[] {
    if (Array.isArray(value)) {
      return [...new Set(value.map((chatId) => String(chatId).trim()).filter(Boolean))];
    }
    return [...new Set((value ?? '').split(',').map((chatId) => chatId.trim()).filter(Boolean))];
  }
}
