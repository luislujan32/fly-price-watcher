import { Inject, Injectable } from '@nestjs/common';
import { FlightSearch } from '../../domain/entities/flight-search.entity';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchRepository,
} from '../../domain/repositories/flight-search.repository';

@Injectable()
export class ManageFlightSearchesUseCase {
  constructor(
    @Inject(FLIGHT_SEARCH_REPOSITORY)
    private readonly repository: FlightSearchRepository,
  ) {}

  listManageable(telegramChatId: string): Promise<FlightSearch[]> {
    return this.repository.findManageable(telegramChatId);
  }

  async getByDisplayIndex(index: number, telegramChatId: string): Promise<FlightSearch | null> {
    const searches = await this.listManageable(telegramChatId);
    return searches[index - 1] ?? null;
  }

  async pauseByDisplayIndex(index: number, telegramChatId: string): Promise<FlightSearch | null> {
    const search = await this.getByDisplayIndex(index, telegramChatId);
    if (!search?.id) {
      return null;
    }
    return this.repository.updateActiveById(search.id, false, telegramChatId);
  }

  async activateByDisplayIndex(index: number, telegramChatId: string): Promise<FlightSearch | null> {
    const search = await this.getByDisplayIndex(index, telegramChatId);
    if (!search?.id) {
      return null;
    }
    return this.repository.updateActiveById(search.id, true, telegramChatId);
  }

  async softDeleteByDisplayIndex(index: number, telegramChatId: string): Promise<FlightSearch | null> {
    const search = await this.getByDisplayIndex(index, telegramChatId);
    if (!search?.id) {
      return null;
    }
    return this.repository.softDeleteById(search.id, new Date(), telegramChatId);
  }
}
