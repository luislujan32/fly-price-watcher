import { SeedFlightSearches } from '../../../src/seed/seed-flight-searches';
import { CreateFlightSearchUseCase } from '../../../src/flight-searches/application/use-cases/create-flight-search.use-case';

describe('SeedFlightSearches', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv, ENABLE_DEMO_SEED: 'false' };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('fails clearly when real seed searches do not have SEED_TELEGRAM_CHAT_ID', async () => {
    delete process.env.SEED_TELEGRAM_CHAT_ID;
    const createFlightSearch = createFlightSearchMock();
    const seed = new SeedFlightSearches(createFlightSearch);

    await expect(seed.run()).rejects.toThrow('SEED_TELEGRAM_CHAT_ID is required');

    expect(createFlightSearch.execute).not.toHaveBeenCalled();
  });

  it('associates real seed searches with SEED_TELEGRAM_CHAT_ID when configured', async () => {
    process.env.SEED_TELEGRAM_CHAT_ID = '123';
    const createFlightSearch = createFlightSearchMock();
    const seed = new SeedFlightSearches(createFlightSearch);

    await seed.run();

    expect(createFlightSearch.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Viaje Octubre',
      telegramChatId: '123',
    }));
    expect(createFlightSearch.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Viaje Diciembre',
      telegramChatId: '123',
    }));
  });
});

function createFlightSearchMock(): jest.Mocked<CreateFlightSearchUseCase> {
  return {
    execute: jest.fn().mockResolvedValue(undefined),
    updateActiveByName: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<CreateFlightSearchUseCase>;
}
