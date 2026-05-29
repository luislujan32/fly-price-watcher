import { Module } from '@nestjs/common';
import { FlightAlertsModule } from '../flight-alerts/flight-alerts.module';
import { FlightPricesModule } from '../flight-prices/flight-prices.module';
import { FlightProvidersModule } from '../flight-providers/flight-providers.module';
import { FlightSearchesModule } from '../flight-searches/flight-searches.module';
import { FlightWatchRunsModule } from '../flight-watch-runs/flight-watch-runs.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DailyFlightPriceWatchJob } from './application/jobs/daily-flight-price-watch.job';
import { FlightPriceWatchService } from './application/services/flight-price-watch.service';

@Module({
  imports: [
    FlightSearchesModule,
    FlightPricesModule,
    FlightAlertsModule,
    FlightProvidersModule,
    FlightWatchRunsModule,
    NotificationsModule,
  ],
  providers: [DailyFlightPriceWatchJob, FlightPriceWatchService],
  exports: [FlightPriceWatchService],
})
export class SchedulerModule {}
