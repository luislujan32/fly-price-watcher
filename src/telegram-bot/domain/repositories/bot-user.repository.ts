import { BotUser } from '../entities/bot-user.entity';
import { BotUserStatus } from '../enums/bot-user-status.enum';

export const BOT_USER_REPOSITORY = Symbol('BOT_USER_REPOSITORY');

export interface BotUserRepository {
  findByChatId(telegramChatId: string): Promise<BotUser | null>;
  upsert(user: BotUser): Promise<BotUser>;
  updateStatus(telegramChatId: string, status: BotUserStatus, approvedBy?: string): Promise<BotUser | null>;
  findByStatus(status: BotUserStatus): Promise<BotUser[]>;
}
