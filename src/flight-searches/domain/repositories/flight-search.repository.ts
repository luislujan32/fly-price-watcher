import { FlightSearch } from '../entities/flight-search.entity';

export const FLIGHT_SEARCH_REPOSITORY = Symbol('FLIGHT_SEARCH_REPOSITORY');

export interface FlightSearchRepository {
  create(search: FlightSearch): Promise<FlightSearch>;
  upsertByName(search: FlightSearch): Promise<FlightSearch>;
  updateActiveByName(name: string, isActive: boolean): Promise<FlightSearch | null>;
  updateActiveById(id: string, isActive: boolean, telegramChatId: string): Promise<FlightSearch | null>;
  softDeleteById(id: string, deletedAt: Date, telegramChatId: string): Promise<FlightSearch | null>;
  findActive(): Promise<FlightSearch[]>;
  findManageable(telegramChatId: string): Promise<FlightSearch[]>;
  findWithoutTelegramChatId(): Promise<FlightSearch[]>;
  setTelegramChatIdForIds(ids: string[], telegramChatId: string): Promise<number>;
  findById(id: string): Promise<FlightSearch | null>;
  findByName(name: string): Promise<FlightSearch | null>;
}
