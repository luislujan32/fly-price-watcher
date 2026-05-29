import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { CabinClass } from '../../domain/enums/cabin-class.enum';
import { Currency } from '../../domain/enums/currency.enum';
import { TripType } from '../../domain/enums/trip-type.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';

export type FlightSearchDocument = HydratedDocument<FlightSearchModel>;

@Schema({ collection: 'flight_searches', timestamps: true })
export class FlightSearchModel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ required: true, uppercase: true, trim: true })
  origin: string;

  @Prop({ required: true, uppercase: true, trim: true })
  destination: string;

  @Prop({ required: true })
  departureDate: Date;

  @Prop()
  returnDate?: Date;

  @Prop({ required: true, enum: TripType })
  tripType: TripType;

  @Prop({ required: true, enum: CabinClass })
  cabinClass: CabinClass;

  @Prop({ required: true, enum: Currency })
  currency: Currency;

  @Prop({ required: true, min: 1, default: 1 })
  adults: number;

  @Prop({ enum: FlightProviderCode })
  providerCode?: FlightProviderCode;

  @Prop({ trim: true, index: true })
  telegramChatId?: string;

  @Prop({ min: 0 })
  targetPrice?: number;

  @Prop({ required: true, default: true })
  notifyOnPriceDrop: boolean;

  @Prop({ required: true, default: false })
  notifyAlways: boolean;

  @Prop({ required: true, default: true })
  isActive: boolean;

  @Prop({ index: true })
  deletedAt?: Date;
}

export const FlightSearchSchema = SchemaFactory.createForClass(FlightSearchModel);

FlightSearchSchema.index({ telegramChatId: 1, createdAt: 1, _id: 1 });
FlightSearchSchema.index({ telegramChatId: 1, name: 1 }, { unique: true });
