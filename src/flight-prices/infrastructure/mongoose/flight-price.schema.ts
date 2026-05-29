import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';

export type FlightPriceDocument = HydratedDocument<FlightPriceModel>;

@Schema({ collection: 'flight_price_snapshots', timestamps: true })
export class FlightPriceModel {
  @Prop({ required: true, index: true })
  searchId: string;

  @Prop({ required: true, enum: FlightProviderCode, index: true })
  providerCode: FlightProviderCode;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({ required: true, enum: Currency })
  currency: Currency;

  @Prop({ required: true, index: true })
  capturedAt: Date;

  @Prop({ required: true })
  itinerarySummary: string;

  @Prop({ type: MongooseSchema.Types.Mixed })
  metadata?: Record<string, unknown>;

  @Prop()
  expiresAt?: Date;
}

export const FlightPriceSchema = SchemaFactory.createForClass(FlightPriceModel);
FlightPriceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
