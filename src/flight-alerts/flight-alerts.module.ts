import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightWatchRunsModule } from '../flight-watch-runs/flight-watch-runs.module';
import { EvaluateFlightAlertsUseCase } from './application/use-cases/evaluate-flight-alerts.use-case';
import { FLIGHT_ALERT_REPOSITORY } from './domain/repositories/flight-alert.repository';
import { AlertMessageFormatter } from './domain/services/alert-message.formatter';
import { AlertMatcherService } from './domain/services/alert-matcher.service';
import { FlightAlertModel, FlightAlertSchema } from './infrastructure/mongoose/flight-alert.schema';
import { MongooseFlightAlertRepository } from './infrastructure/mongoose/mongoose-flight-alert.repository';
import { DataRetentionService } from '../shared/retention/data-retention.service';

@Module({
  imports: [
    FlightWatchRunsModule,
    MongooseModule.forFeature([{ name: FlightAlertModel.name, schema: FlightAlertSchema }]),
  ],
  providers: [
    AlertMessageFormatter,
    AlertMatcherService,
    EvaluateFlightAlertsUseCase,
    DataRetentionService,
    { provide: FLIGHT_ALERT_REPOSITORY, useClass: MongooseFlightAlertRepository },
  ],
  exports: [AlertMessageFormatter, AlertMatcherService, EvaluateFlightAlertsUseCase],
})
export class FlightAlertsModule {}
