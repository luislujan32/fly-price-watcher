import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightWatchRun } from '../../domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../domain/enums/flight-watch-run-status.enum';
import { FlightWatchRunRepository } from '../../domain/repositories/flight-watch-run.repository';
import { FlightWatchRunModel } from './flight-watch-run.schema';

@Injectable()
export class MongooseFlightWatchRunRepository implements FlightWatchRunRepository {
  constructor(
    @InjectModel(FlightWatchRunModel.name)
    private readonly model: Model<FlightWatchRunModel>,
  ) {}

  async create(run: FlightWatchRun): Promise<FlightWatchRun> {
    const created = await this.model.create(run.toPrimitives());
    return this.toEntity(created);
  }

  async updateAlertsGenerated(id: string, alertsGenerated: number): Promise<FlightWatchRun | null> {
    const updated = await this.model.findByIdAndUpdate(
      id,
      { $set: { alertsGenerated } },
      { new: true },
    ).exec();
    return updated ? this.toEntity(updated) : null;
  }

  async findLatestSuccessfulBefore(
    searchId: string,
    providerCode: FlightProviderCode,
    beforeDate: Date,
  ): Promise<FlightWatchRun | null> {
    const record = await this.model.findOne({
      searchId,
      providerCode,
      status: FlightWatchRunStatus.SUCCESS,
      ranAt: { $lt: beforeDate },
    }).sort({ ranAt: -1 }).exec();
    return record ? this.toEntity(record) : null;
  }

  async findLowestCheapestBefore(
    searchId: string,
    providerCode: FlightProviderCode,
    beforeDate: Date,
  ): Promise<FlightWatchRun | null> {
    const record = await this.model.findOne({
      searchId,
      providerCode,
      status: FlightWatchRunStatus.SUCCESS,
      ranAt: { $lt: beforeDate },
      cheapestPrice: { $type: 'number' },
    }).sort({ cheapestPrice: 1, ranAt: 1 }).exec();
    return record ? this.toEntity(record) : null;
  }

  async findLatestBySearchId(searchId: string): Promise<FlightWatchRun | null> {
    const record = await this.model.findOne({ searchId }).sort({ ranAt: -1, createdAt: -1 }).exec();
    return record ? this.toEntity(record) : null;
  }

  private toEntity(record: FlightWatchRunModel & { _id: unknown; createdAt?: Date; updatedAt?: Date }): FlightWatchRun {
    return new FlightWatchRun({
      id: String(record._id),
      searchId: record.searchId,
      providerCode: record.providerCode,
      ranAt: record.ranAt,
      status: record.status,
      route: record.route,
      departureDate: record.departureDate,
      returnDate: record.returnDate,
      validOptionsCount: record.validOptionsCount,
      currency: record.currency,
      cheapestPrice: record.cheapestPrice,
      recommendedPrice: record.recommendedPrice,
      cheapestOption: record.cheapestOption,
      recommendedOption: record.recommendedOption,
      topOptions: record.topOptions,
      cheapestOptionCount: record.cheapestOptionCount,
      diagnosticsSummary: record.diagnosticsSummary,
      diagnosticsDetails: record.diagnosticsDetails,
      alertsGenerated: record.alertsGenerated,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
  }
}
