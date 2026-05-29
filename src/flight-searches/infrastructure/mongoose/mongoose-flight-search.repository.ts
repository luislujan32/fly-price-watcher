import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, Model } from 'mongoose';
import { FlightSearch } from '../../domain/entities/flight-search.entity';
import { FlightSearchRepository } from '../../domain/repositories/flight-search.repository';
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
    const updated = await this.model.findOneAndUpdate(
      this.manageableByIdFilter(id, telegramChatId),
      { $set: { isActive } },
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async softDeleteById(id: string, deletedAt: Date, telegramChatId: string): Promise<FlightSearch | null> {
    const updated = await this.model.findOneAndUpdate(
      this.manageableByIdFilter(id, telegramChatId),
      { $set: { isActive: false, deletedAt } },
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
}
