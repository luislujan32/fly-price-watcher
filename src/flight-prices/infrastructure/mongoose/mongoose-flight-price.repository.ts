import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightPriceSnapshot } from '../../domain/entities/flight-price-snapshot.entity';
import { FlightPriceRepository } from '../../domain/repositories/flight-price.repository';
import { FlightPriceModel } from './flight-price.schema';

@Injectable()
export class MongooseFlightPriceRepository implements FlightPriceRepository {
  constructor(
    @InjectModel(FlightPriceModel.name)
    private readonly model: Model<FlightPriceModel>,
  ) {}

  async create(snapshot: FlightPriceSnapshot): Promise<FlightPriceSnapshot> {
    const created = await this.model.create(snapshot.toPrimitives());
    return this.toEntity(created);
  }

  async findBySearchAndProvider(
    searchId: string,
    providerCode: FlightProviderCode,
  ): Promise<FlightPriceSnapshot[]> {
    const records = await this.model.find({ searchId, providerCode }).sort({ capturedAt: 1 }).exec();
    return records.map((record) => this.toEntity(record));
  }

  async findLatestBySearchAndProvider(
    searchId: string,
    providerCode: FlightProviderCode,
  ): Promise<FlightPriceSnapshot | null> {
    const record = await this.model.findOne({ searchId, providerCode }).sort({ capturedAt: -1 }).exec();
    return record ? this.toEntity(record) : null;
  }

  private toEntity(record: FlightPriceModel & { _id: unknown }): FlightPriceSnapshot {
    return new FlightPriceSnapshot({
      id: String(record._id),
      searchId: record.searchId,
      providerCode: record.providerCode,
      totalPrice: record.totalPrice,
      currency: record.currency,
      capturedAt: record.capturedAt,
      itinerarySummary: record.itinerarySummary,
      metadata: record.metadata,
      expiresAt: record.expiresAt,
    });
  }
}
