import { NotificationMessage } from '../models/notification-message.model';

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

export interface NotificationChannelPort {
  readonly channelName: string;
  send(message: NotificationMessage): Promise<void>;
}
