import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BotUser } from '../../domain/entities/bot-user.entity';
import { BotUserStatus } from '../../domain/enums/bot-user-status.enum';
import { BotUserRepository } from '../../domain/repositories/bot-user.repository';
import { BotUserModel } from './bot-user.schema';

@Injectable()
export class MongooseBotUserRepository implements BotUserRepository {
  constructor(
    @InjectModel(BotUserModel.name)
    private readonly model: Model<BotUserModel>,
  ) {}

  async findByChatId(telegramChatId: string): Promise<BotUser | null> {
    const record = await this.model.findOne({ telegramChatId }).exec();
    return record ? this.toEntity(record) : null;
  }

  async upsert(user: BotUser): Promise<BotUser> {
    const updated = await this.model.findOneAndUpdate(
      { telegramChatId: user.telegramChatId },
      { $set: user.toPrimitives() },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return this.toEntity(updated);
  }

  async updateStatus(telegramChatId: string, status: BotUserStatus, approvedBy?: string): Promise<BotUser | null> {
    const updated = await this.model.findOneAndUpdate(
      { telegramChatId },
      {
        $set: {
          status,
          ...(status === BotUserStatus.APPROVED ? { approvedAt: new Date(), approvedBy } : {}),
        },
      },
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async findByStatus(status: BotUserStatus): Promise<BotUser[]> {
    const records = await this.model.find({ status }).sort({ createdAt: 1, _id: 1 }).exec();
    return records.map((record) => this.toEntity(record));
  }

  private toEntity(record: BotUserModel & { _id: unknown; createdAt?: Date; updatedAt?: Date }): BotUser {
    return new BotUser({
      id: String(record._id),
      telegramChatId: record.telegramChatId,
      firstName: record.firstName,
      lastName: record.lastName,
      username: record.username,
      status: record.status,
      isAdmin: record.isAdmin,
      approvedAt: record.approvedAt,
      approvedBy: record.approvedBy,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
