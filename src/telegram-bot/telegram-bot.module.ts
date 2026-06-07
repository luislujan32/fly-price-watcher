import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { FlightAlertsModule } from '../flight-alerts/flight-alerts.module';
import { FlightSearchesModule } from '../flight-searches/flight-searches.module';
import { AirportResolverService } from '../shared/airports/airport-resolver.service';
import { FlightWatchRunsModule } from '../flight-watch-runs/flight-watch-runs.module';
import { SchedulerModule } from '../scheduler/scheduler.module';
import { TelegramAccessControlService } from './application/telegram-access-control.service';
import { TelegramBotService } from './application/telegram-bot.service';
import { TELEGRAM_CONVERSATION_STATE_REPOSITORY } from './domain/repositories/telegram-conversation-state.repository';
import { TelegramBotClient } from './infrastructure/telegram-bot.client';
import { BOT_USER_REPOSITORY } from './domain/repositories/bot-user.repository';
import { BotUserModel, BotUserSchema } from './infrastructure/mongoose/bot-user.schema';
import { MongooseBotUserRepository } from './infrastructure/mongoose/mongoose-bot-user.repository';
import { MongooseTelegramConversationStateRepository } from './infrastructure/mongoose/mongoose-telegram-conversation-state.repository';
import {
  TelegramConversationStateModel,
  TelegramConversationStateSchema,
} from './infrastructure/mongoose/telegram-conversation-state.schema';

@Module({
  imports: [
    FlightAlertsModule,
    FlightSearchesModule,
    FlightWatchRunsModule,
    SchedulerModule,
    MongooseModule.forFeature([
      { name: TelegramConversationStateModel.name, schema: TelegramConversationStateSchema },
      { name: BotUserModel.name, schema: BotUserSchema },
    ]),
  ],
  providers: [
    TelegramBotClient,
    TelegramAccessControlService,
    TelegramBotService,
    AirportResolverService,
    { provide: BOT_USER_REPOSITORY, useClass: MongooseBotUserRepository },
    { provide: TELEGRAM_CONVERSATION_STATE_REPOSITORY, useClass: MongooseTelegramConversationStateRepository },
  ],
  exports: [TelegramBotService],
})
export class TelegramBotModule {}
