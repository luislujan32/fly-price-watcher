import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';
import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import {
  FlightLegOption,
  FlightQuotePricingSource,
  FlightQuoteTag,
} from '../../../flight-providers/domain/models/flight-quote.model';
import { FlightWatchRunStatus } from '../../domain/enums/flight-watch-run-status.enum';

export type FlightWatchRunDocument = HydratedDocument<FlightWatchRunModel>;

@Schema({ _id: false })
export class FlightOptionSummaryModel {
  @Prop({ required: true, min: 0 })
  price: number;

  @Prop({ required: true, enum: Currency })
  currency: Currency;

  @Prop({ min: 0 })
  outboundPrice?: number;

  @Prop({ min: 0 })
  inboundPrice?: number;

  @Prop()
  pricingSource?: FlightQuotePricingSource;

  @Prop()
  fareName?: string;

  @Prop()
  outboundFareName?: string;

  @Prop()
  inboundFareName?: string;

  @Prop({ min: 0 })
  seatsAvailable?: number;

  @Prop({ required: true })
  outboundSummary: string;

  @Prop()
  inboundSummary?: string;

  @Prop({ type: [Object], default: undefined })
  outboundOptions?: FlightLegOption[];

  @Prop({ type: [Object], default: undefined })
  inboundOptions?: FlightLegOption[];

  @Prop()
  outboundDepartureTime?: string;

  @Prop()
  inboundDepartureTime?: string;

  @Prop({ type: [String], default: [] })
  tags: FlightQuoteTag[];

  @Prop()
  hasStops?: boolean;
}

const FlightOptionSummarySchema = SchemaFactory.createForClass(FlightOptionSummaryModel);

@Schema({ _id: false })
export class DiagnosticsSummaryModel {
  @Prop({ min: 0 })
  rawCandidates?: number;

  @Prop({ min: 0 })
  discardedByAirport?: number;

  @Prop({ min: 0 })
  discardedByStops?: number;

  @Prop({ min: 0 })
  discardedByDate?: number;

  @Prop({ min: 0 })
  discardedByMissingPrice?: number;

  @Prop({ min: 0 })
  validCandidates?: number;
}

const DiagnosticsSummarySchema = SchemaFactory.createForClass(DiagnosticsSummaryModel);

@Schema({ _id: false })
export class DiagnosticsDetailsModel {
  @Prop({ type: [String], default: [] })
  discardedReasons?: string[];
}

const DiagnosticsDetailsSchema = SchemaFactory.createForClass(DiagnosticsDetailsModel);

@Schema({ collection: 'flight_watch_runs', timestamps: true })
export class FlightWatchRunModel {
  @Prop({ required: true, index: true })
  searchId: string;

  @Prop({ required: true, enum: FlightProviderCode, index: true })
  providerCode: FlightProviderCode;

  @Prop({ required: true, index: true })
  ranAt: Date;

  @Prop({ required: true, enum: FlightWatchRunStatus })
  status: FlightWatchRunStatus;

  @Prop({ required: true })
  route: string;

  @Prop({ required: true })
  departureDate: Date;

  @Prop()
  returnDate?: Date;

  @Prop({ required: true, min: 0 })
  validOptionsCount: number;

  @Prop({ enum: Currency })
  currency?: Currency;

  @Prop({ min: 0 })
  cheapestPrice?: number;

  @Prop({ min: 0 })
  recommendedPrice?: number;

  @Prop({ type: FlightOptionSummarySchema })
  cheapestOption?: FlightOptionSummaryModel;

  @Prop({ type: FlightOptionSummarySchema })
  recommendedOption?: FlightOptionSummaryModel;

  @Prop({ type: [FlightOptionSummarySchema], default: [] })
  topOptions: FlightOptionSummaryModel[];

  @Prop({ min: 0 })
  cheapestOptionCount?: number;

  @Prop({ type: DiagnosticsSummarySchema })
  diagnosticsSummary?: DiagnosticsSummaryModel;

  @Prop({ type: DiagnosticsDetailsSchema })
  diagnosticsDetails?: DiagnosticsDetailsModel;

  @Prop({ min: 0 })
  alertsGenerated?: number;

  @Prop()
  expiresAt?: Date;
}

export const FlightWatchRunSchema = SchemaFactory.createForClass(FlightWatchRunModel);

FlightWatchRunSchema.index({ searchId: 1, providerCode: 1, ranAt: -1 });
FlightWatchRunSchema.index({ searchId: 1, providerCode: 1, createdAt: -1 });
FlightWatchRunSchema.index({ status: 1 });
FlightWatchRunSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
