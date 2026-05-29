import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class DataRetentionService {
  constructor(private readonly config?: ConfigService) {}

  expiresAtForTrip(params: {
    departureDate: Date;
    returnDate?: Date;
  }): Date {
    const baseDate = params.returnDate ?? params.departureDate;
    return new Date(baseDate.getTime() + this.daysAfterTrip() * MS_PER_DAY);
  }

  private daysAfterTrip(): number {
    const value = this.config?.get<number>('dataRetentionDaysAfterTrip');
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const envValue = Number(process.env.DATA_RETENTION_DAYS_AFTER_TRIP ?? 30);
    return Number.isFinite(envValue) ? envValue : 30;
  }
}
