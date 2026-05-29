import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SaveFlightWatchRunUseCase } from './application/use-cases/save-flight-watch-run.use-case';
import { GetLatestWatchRunUseCase } from './application/use-cases/get-latest-watch-run.use-case';
import { FLIGHT_WATCH_RUN_REPOSITORY } from './domain/repositories/flight-watch-run.repository';
import { FlightWatchRunModel, FlightWatchRunSchema } from './infrastructure/mongoose/flight-watch-run.schema';
import { MongooseFlightWatchRunRepository } from './infrastructure/mongoose/mongoose-flight-watch-run.repository';
import { DataRetentionService } from '../shared/retention/data-retention.service';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: FlightWatchRunModel.name, schema: FlightWatchRunSchema }]),
  ],
  providers: [
    SaveFlightWatchRunUseCase,
    GetLatestWatchRunUseCase,
    DataRetentionService,
    { provide: FLIGHT_WATCH_RUN_REPOSITORY, useClass: MongooseFlightWatchRunRepository },
  ],
  exports: [SaveFlightWatchRunUseCase, GetLatestWatchRunUseCase, FLIGHT_WATCH_RUN_REPOSITORY],
})
export class FlightWatchRunsModule {}
