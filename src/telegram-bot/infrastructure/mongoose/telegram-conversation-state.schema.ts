import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import {
  CreateSearchDraft,
  CreateSearchStep,
  TelegramConversationCommand,
} from '../../domain/entities/telegram-conversation-state.entity';

export type TelegramConversationStateDocument = HydratedDocument<TelegramConversationStateModel>;

@Schema({ collection: 'telegram_conversation_states', timestamps: true })
export class TelegramConversationStateModel {
  @Prop({ required: true, unique: true, index: true })
  chatId: string;

  @Prop({ required: true, enum: TelegramConversationCommand })
  currentCommand: TelegramConversationCommand;

  @Prop({ required: true, enum: CreateSearchStep })
  step: CreateSearchStep;

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  draft: CreateSearchDraft;

  @Prop({ required: true })
  expiresAt: Date;
}

export const TelegramConversationStateSchema = SchemaFactory.createForClass(TelegramConversationStateModel);
TelegramConversationStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
