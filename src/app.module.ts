import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { appConfig } from './shared/config/app.config';
import { DatabaseModule } from './shared/database/database.module';
import { FlightSearchesModule } from './flight-searches/flight-searches.module';
import { FlightPricesModule } from './flight-prices/flight-prices.module';
import { FlightAlertsModule } from './flight-alerts/flight-alerts.module';
import { FlightProvidersModule } from './flight-providers/flight-providers.module';
import { FlightWatchRunsModule } from './flight-watch-runs/flight-watch-runs.module';
import { NotificationsModule } from './notifications/notifications.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { SeedModule } from './seed/seed.module';
import { TelegramBotModule } from './telegram-bot/telegram-bot.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    FlightSearchesModule,
    FlightPricesModule,
    FlightAlertsModule,
    FlightProvidersModule,
    FlightWatchRunsModule,
    NotificationsModule,
    SchedulerModule,
    SeedModule,
    TelegramBotModule,
  ],
})
export class AppModule {}
