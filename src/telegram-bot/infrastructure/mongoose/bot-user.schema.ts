import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { BotUserStatus } from '../../domain/enums/bot-user-status.enum';

export type BotUserDocument = HydratedDocument<BotUserModel>;

@Schema({ collection: 'telegram_users', timestamps: true })
export class BotUserModel {
  @Prop({ required: true, unique: true, index: true })
  telegramChatId: string;

  @Prop({ required: true })
  firstName: string;

  @Prop()
  lastName?: string;

  @Prop()
  username?: string;

  @Prop({ required: true, enum: BotUserStatus, index: true })
  status: BotUserStatus;

  @Prop({ default: false })
  isAdmin?: boolean;

  @Prop()
  approvedAt?: Date;

  @Prop()
  approvedBy?: string;
}

export const BotUserSchema = SchemaFactory.createForClass(BotUserModel);
BotUserSchema.index({ status: 1, createdAt: 1 });
