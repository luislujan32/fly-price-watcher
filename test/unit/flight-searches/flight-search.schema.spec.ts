import { FlightSearchSchema } from '../../../src/flight-searches/infrastructure/mongoose/flight-search.schema';

describe('FlightSearchSchema', () => {
  it('does not define expiresAt or TTL indexes', () => {
    expect(FlightSearchSchema.path('expiresAt')).toBeUndefined();
    const ttlIndexes = FlightSearchSchema.indexes()
      .filter(([, options]) => options?.expireAfterSeconds === 0);
    expect(ttlIndexes).toEqual([]);
  });

  it('does not define a unique index on name only', () => {
    const indexes = FlightSearchSchema.indexes();

    expect(indexes).not.toContainEqual([{ name: 1 }, expect.objectContaining({ unique: true })]);
  });

  it('defines a unique index scoped by telegramChatId and name', () => {
    const indexes = FlightSearchSchema.indexes();

    expect(indexes).toContainEqual([
      { telegramChatId: 1, name: 1 },
      expect.objectContaining({ unique: true }),
    ]);
  });

  it('allows the same name for different telegramChatId values at schema level', () => {
    const uniqueIndexes = FlightSearchSchema.indexes()
      .filter(([, options]) => options?.unique === true);

    expect(uniqueIndexes).toEqual([
      [{ telegramChatId: 1, name: 1 }, expect.objectContaining({ unique: true })],
    ]);
  });
});
