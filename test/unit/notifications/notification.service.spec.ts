import { NotificationService } from '../../../src/notifications/application/services/notification.service';
import { NotificationChannelPort } from '../../../src/notifications/domain/ports/notification-channel.port';

describe('NotificationService', () => {
  it('sends a message to all configured channels', async () => {
    const consoleChannel: NotificationChannelPort = {
      channelName: 'console',
      send: jest.fn().mockResolvedValue(undefined),
    };
    const telegramChannel: NotificationChannelPort = {
      channelName: 'telegram',
      send: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotificationService([consoleChannel, telegramChannel]);

    await expect(service.send({ title: 'PRICE_DROP', body: 'Price dropped' })).resolves.toEqual({
      attempts: 2,
      successes: 2,
      failures: 0,
    });

    expect(consoleChannel.send).toHaveBeenCalledWith({ title: 'PRICE_DROP', body: 'Price dropped' });
    expect(telegramChannel.send).toHaveBeenCalledWith({ title: 'PRICE_DROP', body: 'Price dropped' });
  });

  it('does not fail when one channel throws', async () => {
    const failingChannel: NotificationChannelPort = {
      channelName: 'telegram',
      send: jest.fn().mockRejectedValue(new Error('network failed')),
    };
    const workingChannel: NotificationChannelPort = {
      channelName: 'console',
      send: jest.fn().mockResolvedValue(undefined),
    };
    const service = new NotificationService([failingChannel, workingChannel]);

    await expect(service.send({ title: 'DAILY_SUMMARY', body: 'Summary' })).resolves.toEqual({
      attempts: 2,
      successes: 1,
      failures: 1,
    });
    expect(workingChannel.send).toHaveBeenCalled();
  });
});
