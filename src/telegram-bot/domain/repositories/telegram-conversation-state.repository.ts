import { TelegramConversationState } from '../entities/telegram-conversation-state.entity';

export const TELEGRAM_CONVERSATION_STATE_REPOSITORY = Symbol('TELEGRAM_CONVERSATION_STATE_REPOSITORY');

export interface TelegramConversationStateRepository {
  findByChatId(chatId: string): Promise<TelegramConversationState | null>;
  upsert(state: TelegramConversationState): Promise<TelegramConversationState>;
  deleteByChatId(chatId: string): Promise<void>;
}
