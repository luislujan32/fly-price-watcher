import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightAlertType } from '../../domain/enums/flight-alert-type.enum';

export type FlightAlertDocument = HydratedDocument<FlightAlertModel>;

@Schema({ collection: 'flight_alerts', timestamps: true })
export class FlightAlertModel {
  @Prop({ required: true, index: true })
  searchId: string;

  @Prop({ required: true, enum: FlightProviderCode, index: true })
  providerCode: FlightProviderCode;

  @Prop({ required: true, enum: FlightAlertType, index: true })
  alertType: FlightAlertType;

  @Prop({ required: true, index: true })
  alertDate: string;

  @Prop({ required: true })
  message: string;

  @Prop()
  expiresAt?: Date;
}

export const FlightAlertSchema = SchemaFactory.createForClass(FlightAlertModel);
FlightAlertSchema.index(
  { searchId: 1, providerCode: 1, alertType: 1, alertDate: 1 },
  { unique: true },
);
FlightAlertSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
