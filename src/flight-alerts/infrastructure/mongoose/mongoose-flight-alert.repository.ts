import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightAlert } from '../../domain/entities/flight-alert.entity';
import { FlightAlertRepository } from '../../domain/repositories/flight-alert.repository';
import { FlightAlertType } from '../../domain/enums/flight-alert-type.enum';
import { FlightAlertModel } from './flight-alert.schema';

@Injectable()
export class MongooseFlightAlertRepository implements FlightAlertRepository {
  constructor(
    @InjectModel(FlightAlertModel.name)
    private readonly model: Model<FlightAlertModel>,
  ) {}

  async create(alert: FlightAlert): Promise<FlightAlert> {
    const created = await this.model.create(alert.toPrimitives());
    return this.toEntity(created);
  }

  async existsForDay(params: {
    searchId: string;
    providerCode: FlightProviderCode;
    alertType: FlightAlertType;
    alertDate: string;
  }): Promise<boolean> {
    return this.model.exists(params).then(Boolean);
  }

  private toEntity(record: FlightAlertModel & { _id: unknown; createdAt?: Date }): FlightAlert {
    return new FlightAlert({
      id: String(record._id),
      searchId: record.searchId,
      providerCode: record.providerCode,
      alertType: record.alertType,
      alertDate: record.alertDate,
      message: record.message,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    });
  }
}
