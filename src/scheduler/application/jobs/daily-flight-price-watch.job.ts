import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { resolveDailySchedule } from '../../../shared/config/cron.config';
import { FlightPriceWatchService } from '../services/flight-price-watch.service';

const DAILY_SCHEDULE = resolveDailySchedule();

@Injectable()
export class DailyFlightPriceWatchJob {
  private readonly logger = new Logger(DailyFlightPriceWatchJob.name);

  constructor(
    private readonly config: ConfigService,
    private readonly flightPriceWatch: FlightPriceWatchService,
  ) {}

  @Cron(DAILY_SCHEDULE.cron, { timeZone: DAILY_SCHEDULE.timeZone })
  async handleCron(): Promise<void> {
    if (!this.config.get<boolean>('enableScheduler')) {
      this.logger.log('Daily flight price watch skipped because scheduler is disabled.');
      return;
    }
    this.logger.log(`Daily flight price watch cron triggered. timeZone=${DAILY_SCHEDULE.timeZone}.`);
    await this.flightPriceWatch.runOnce();
  }
}
