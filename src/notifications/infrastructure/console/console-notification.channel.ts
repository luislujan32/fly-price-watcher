import { Injectable, Logger } from '@nestjs/common';
import { NotificationMessage } from '../../domain/models/notification-message.model';
import { NotificationChannelPort } from '../../domain/ports/notification-channel.port';

@Injectable()
export class ConsoleNotificationChannel implements NotificationChannelPort {
  readonly channelName = 'console';
  private readonly logger = new Logger(ConsoleNotificationChannel.name);

  async send(message: NotificationMessage): Promise<void> {
    this.logger.log(message.title ? `${message.title}: ${message.body}` : message.body);
  }
}
