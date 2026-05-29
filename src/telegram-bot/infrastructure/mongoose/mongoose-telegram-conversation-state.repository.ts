import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TelegramConversationState } from '../../domain/entities/telegram-conversation-state.entity';
import { TelegramConversationStateRepository } from '../../domain/repositories/telegram-conversation-state.repository';
import { TelegramConversationStateModel } from './telegram-conversation-state.schema';

@Injectable()
export class MongooseTelegramConversationStateRepository implements TelegramConversationStateRepository {
  constructor(
    @InjectModel(TelegramConversationStateModel.name)
    private readonly model: Model<TelegramConversationStateModel>,
  ) {}

  async findByChatId(chatId: string): Promise<TelegramConversationState | null> {
    const record = await this.model.findOne({ chatId }).exec();
    return record ? this.toEntity(record) : null;
  }

  async upsert(state: TelegramConversationState): Promise<TelegramConversationState> {
    const updated = await this.model.findOneAndUpdate(
      { chatId: state.chatId },
      { $set: state.toPrimitives() },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return this.toEntity(updated);
  }

  async deleteByChatId(chatId: string): Promise<void> {
    await this.model.deleteOne({ chatId }).exec();
  }

  private toEntity(record: TelegramConversationStateModel & { _id: unknown; updatedAt?: Date }): TelegramConversationState {
    return new TelegramConversationState({
      id: String(record._id),
      chatId: record.chatId,
      currentCommand: record.currentCommand,
      step: record.step,
      draft: record.draft,
      updatedAt: record.updatedAt,
      expiresAt: record.expiresAt,
    });
  }
}
