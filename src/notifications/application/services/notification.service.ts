import { Inject, Injectable, Logger } from '@nestjs/common';
import {
  NOTIFICATION_CHANNELS,
  NotificationChannelPort,
} from '../../domain/ports/notification-channel.port';
import { NotificationMessage } from '../../domain/models/notification-message.model';

export type NotificationDispatchResult = {
  attempts: number;
  successes: number;
  failures: number;
};

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @Inject(NOTIFICATION_CHANNELS)
    private readonly channels: NotificationChannelPort[],
  ) {}

  async send(message: NotificationMessage): Promise<NotificationDispatchResult> {
    const results = await Promise.all(
      this.channels.map(async (channel) => {
        try {
          await channel.send(message);
          return true;
        } catch (error) {
          this.logger.error(`Notification channel failed: ${channel.channelName}`, error);
          return false;
        }
      }),
    );

    const successes = results.filter(Boolean).length;
    return {
      attempts: this.channels.length,
      successes,
      failures: this.channels.length - successes,
    };
  }
}
