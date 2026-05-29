import { ConfigService } from '@nestjs/config';
import { DataRetentionService } from '../../../src/shared/retention/data-retention.service';

describe('DataRetentionService', () => {
  it('calculates expiresAt from returnDate when present', () => {
    const service = new DataRetentionService(config(30));

    expect(service.expiresAtForTrip({
      departureDate: new Date('2026-10-10T12:00:00.000Z'),
      returnDate: new Date('2026-10-15T12:00:00.000Z'),
    })).toEqual(new Date('2026-11-14T12:00:00.000Z'));
  });

  it('calculates expiresAt from departureDate when returnDate is missing', () => {
    const service = new DataRetentionService(config(30));

    expect(service.expiresAtForTrip({
      departureDate: new Date('2026-07-15T12:00:00.000Z'),
    })).toEqual(new Date('2026-08-14T12:00:00.000Z'));
  });
});

function config(days: number): ConfigService {
  return {
    get: jest.fn((key: string) => key === 'dataRetentionDaysAfterTrip' ? days : undefined),
  } as unknown as ConfigService;
}
