import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaveFlightPriceSnapshotUseCase } from './application/use-cases/save-flight-price-snapshot.use-case';
import { FLIGHT_PRICE_REPOSITORY } from './domain/repositories/flight-price.repository';
import { FlightPriceModel, FlightPriceSchema } from './infrastructure/mongoose/flight-price.schema';
import { MongooseFlightPriceRepository } from './infrastructure/mongoose/mongoose-flight-price.repository';
import { DataRetentionService } from '../shared/retention/data-retention.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FlightPriceModel.name, schema: FlightPriceSchema }]),
  ],
  providers: [
    SaveFlightPriceSnapshotUseCase,
    DataRetentionService,
    { provide: FLIGHT_PRICE_REPOSITORY, useClass: MongooseFlightPriceRepository },
  ],
  exports: [SaveFlightPriceSnapshotUseCase, FLIGHT_PRICE_REPOSITORY],
})
export class FlightPricesModule {}
