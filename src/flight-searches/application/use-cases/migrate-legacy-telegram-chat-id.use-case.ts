import { Inject, Injectable } from '@nestjs/common';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchRepository,
} from '../../domain/repositories/flight-search.repository';

export type MigrateLegacyTelegramChatIdResult = {
  foundCount: number;
  updatedCount: number;
  updatedNames: string[];
};

@Injectable()
export class MigrateLegacyTelegramChatIdUseCase {
  constructor(
    @Inject(FLIGHT_SEARCH_REPOSITORY)
    private readonly repository: FlightSearchRepository,
  ) {}

  async execute(telegramChatId: string): Promise<MigrateLegacyTelegramChatIdResult> {
    const normalizedChatId = telegramChatId.trim();
    if (!normalizedChatId) {
      throw new Error('telegramChatId is required.');
    }

    const legacySearches = await this.repository.findWithoutTelegramChatId();
    const ids = legacySearches
      .map((search) => search.id)
      .filter((id): id is string => Boolean(id));

    const updatedCount = ids.length
      ? await this.repository.setTelegramChatIdForIds(ids, normalizedChatId)
      : 0;

    return {
      foundCount: legacySearches.length,
      updatedCount,
      updatedNames: legacySearches.map((search) => search.name),
    };
  }
}
