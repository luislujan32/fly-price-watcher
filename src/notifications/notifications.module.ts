import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NotificationService } from './application/services/notification.service';
import { NOTIFICATION_CHANNELS, NotificationChannelPort } from './domain/ports/notification-channel.port';
import { ConsoleNotificationChannel } from './infrastructure/console/console-notification.channel';
import { TelegramNotificationChannel } from './infrastructure/telegram/telegram-notification.channel';

@Module({
  providers: [
    ConsoleNotificationChannel,
    TelegramNotificationChannel,
    {
      provide: NOTIFICATION_CHANNELS,
      useFactory: (
        config: ConfigService,
        consoleChannel: ConsoleNotificationChannel,
        telegramChannel: TelegramNotificationChannel,
      ): NotificationChannelPort[] => {
        const enabled = config.get<string[]>('notificationChannels') ?? ['console'];
        const channels: NotificationChannelPort[] = [];
        if (enabled.includes('console')) {
          channels.push(consoleChannel);
        }
        if (enabled.includes('telegram') && telegramChannel.isConfigured()) {
          channels.push(telegramChannel);
        }
        return channels;
      },
      inject: [ConfigService, ConsoleNotificationChannel, TelegramNotificationChannel],
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
