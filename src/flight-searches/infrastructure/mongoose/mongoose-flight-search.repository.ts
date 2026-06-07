import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { FlightSearch, FlightSearchPausedReason } from '../../domain/entities/flight-search.entity';
import { FlightSearchLifecycleUpdate, FlightSearchRepository } from '../../domain/repositories/flight-search.repository';
import { FlightSearchModel } from './flight-search.schema';

@Injectable()
export class MongooseFlightSearchRepository implements FlightSearchRepository {
  constructor(
    @InjectModel(FlightSearchModel.name)
    private readonly model: Model<FlightSearchModel>,
  ) {}

  async create(search: FlightSearch): Promise<FlightSearch> {
    const created = await this.model.create(search.toPrimitives());
    return this.toEntity(created);
  }

  async upsertByName(search: FlightSearch): Promise<FlightSearch> {
    const filter = search.telegramChatId
      ? { name: search.name, telegramChatId: search.telegramChatId }
      : { name: search.name };
    const updated = await this.model.findOneAndUpdate(
      filter,
      { $set: search.toPrimitives(), $unset: { deletedAt: '' } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    ).exec();
    return this.toEntity(updated);
  }

  async updateActiveByName(name: string, isActive: boolean): Promise<FlightSearch | null> {
    const updated = await this.model.findOneAndUpdate(
      { name },
      { $set: { isActive } },
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async updateActiveById(id: string, isActive: boolean, telegramChatId: string): Promise<FlightSearch | null> {
    const update = isActive
      ? this.lifecycleUpdate({
        isActive: true,
        notificationCountSinceRenewal: 0,
        requiresRenewal: false,
        renewalRequestedAt: null,
        pausedReason: null,
      })
      : this.lifecycleUpdate({
        isActive: false,
        requiresRenewal: false,
        renewalRequestedAt: null,
        pausedReason: FlightSearchPausedReason.USER_PAUSED,
      });
    const updated = await this.model.findOneAndUpdate(
      this.manageableByIdFilter(id, telegramChatId),
      update,
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async updateLifecycleById(id: string, updates: FlightSearchLifecycleUpdate): Promise<FlightSearch | null> {
    const updated = await this.model.findByIdAndUpdate(
      id,
      this.lifecycleUpdate(updates),
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async updateLifecycleByIdForChat(id: string, telegramChatId: string, updates: FlightSearchLifecycleUpdate): Promise<FlightSearch | null> {
    const updated = await this.model.findOneAndUpdate(
      this.manageableByIdFilter(id, telegramChatId),
      this.lifecycleUpdate(updates),
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async softDeleteById(id: string, deletedAt: Date, telegramChatId: string): Promise<FlightSearch | null> {
    const updated = await this.model.findOneAndUpdate(
      this.manageableByIdFilter(id, telegramChatId),
      { $set: { isActive: false, deletedAt, pausedReason: FlightSearchPausedReason.USER_PAUSED } },
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async findActive(): Promise<FlightSearch[]> {
    const records = await this.model.find({ isActive: true, deletedAt: { $exists: false } }).sort({ createdAt: 1, _id: 1 }).exec();
    return records.map((record) => this.toEntity(record));
  }

  async findManageable(telegramChatId: string): Promise<FlightSearch[]> {
    const records = await this.model.find(this.manageableFilter(telegramChatId)).sort({ createdAt: 1, _id: 1 }).exec();
    return records.map((record) => this.toEntity(record));
  }

  async findWithoutTelegramChatId(): Promise<FlightSearch[]> {
    const records = await this.model.find(this.missingTelegramChatIdFilter()).sort({ createdAt: 1, _id: 1 }).exec();
    return records.map((record) => this.toEntity(record));
  }

  async setTelegramChatIdForIds(ids: string[], telegramChatId: string): Promise<number> {
    if (!ids.length) {
      return 0;
    }

    const result = await this.model.updateMany(
      {
        _id: { $in: ids },
        ...this.missingTelegramChatIdFilter(),
      },
      { $set: { telegramChatId } },
    ).exec();
    return result.modifiedCount;
  }

  async findByName(name: string): Promise<FlightSearch | null> {
    const record = await this.model.findOne({ name }).exec();
    return record ? this.toEntity(record) : null;
  }

  async findById(id: string): Promise<FlightSearch | null> {
    const record = await this.model.findById(id).exec();
    return record ? this.toEntity(record) : null;
  }

  async findByIdForChat(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    const record = await this.model.findOne(this.manageableByIdFilter(id, telegramChatId)).exec();
    return record ? this.toEntity(record) : null;
  }

  private toEntity(record: FlightSearchModel & { _id: unknown; createdAt?: Date; updatedAt?: Date }): FlightSearch {
    return new FlightSearch({
      id: String(record._id),
      name: record.name,
      origin: record.origin,
      destination: record.destination,
      departureDate: record.departureDate,
      returnDate: record.returnDate,
      tripType: record.tripType,
      cabinClass: record.cabinClass,
      currency: record.currency,
      adults: record.adults,
      providerCode: record.providerCode,
      telegramChatId: record.telegramChatId,
      targetPrice: record.targetPrice,
      notifyOnPriceDrop: record.notifyOnPriceDrop ?? true,
      notifyAlways: record.notifyAlways,
      isActive: record.isActive,
      notificationCountSinceRenewal: record.notificationCountSinceRenewal,
      renewalLimit: record.renewalLimit,
      requiresRenewal: record.requiresRenewal,
      renewalRequestedAt: record.renewalRequestedAt,
      pausedReason: record.pausedReason,
      lastManualWatchAt: record.lastManualWatchAt,
      deletedAt: record.deletedAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }

  private manageableByIdFilter(id: string, telegramChatId: string): FilterQuery<FlightSearchModel> {
    return {
      _id: id,
      ...this.manageableFilter(telegramChatId),
    };
  }

  private manageableFilter(telegramChatId: string): FilterQuery<FlightSearchModel> {
    return {
      deletedAt: { $exists: false },
      telegramChatId,
    };
  }

  private missingTelegramChatIdFilter(): FilterQuery<FlightSearchModel> {
    return {
      $or: [
        { telegramChatId: { $exists: false } },
        { telegramChatId: null },
        { telegramChatId: '' },
      ],
    };
  }

  private lifecycleUpdate(updates: FlightSearchLifecycleUpdate): { $set: Record<string, unknown>; $unset?: Record<string, ''> } {
    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};
    for (const [key, value] of Object.entries(updates)) {
      if (value === null) {
        unset[key] = '';
      } else if (value !== undefined) {
        set[key] = value;
      }
    }
    return Object.keys(unset).length ? { $set: set, $unset: unset } : { $set: set };
  }
}
