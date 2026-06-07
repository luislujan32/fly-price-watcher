import { Inject, Injectable } from '@nestjs/common';
import { FlightSearch, FlightSearchPausedReason } from '../../domain/entities/flight-search.entity';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchLifecycleUpdate,
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

  findByIdForChat(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    return this.repository.findByIdForChat(id, telegramChatId);
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

  softDeleteByIdForChat(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    return this.repository.softDeleteById(id, new Date(), telegramChatId);
  }

  async touchManualWatchByDisplayIndex(index: number, telegramChatId: string, watchedAt: Date): Promise<FlightSearch | null> {
    const search = await this.getByDisplayIndex(index, telegramChatId);
    if (!search?.id) {
      return null;
    }
    return this.repository.updateLifecycleByIdForChat(search.id, telegramChatId, {
      lastManualWatchAt: watchedAt,
    });
  }

  async renewByDisplayIndex(index: number, telegramChatId: string): Promise<FlightSearch | null> {
    const search = await this.getByDisplayIndex(index, telegramChatId);
    if (!search?.id) {
      return null;
    }
    return this.renewById(search.id, telegramChatId);
  }

  renewById(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    return this.repository.updateLifecycleByIdForChat(id, telegramChatId, {
      isActive: true,
      notificationCountSinceRenewal: 0,
      requiresRenewal: false,
      renewalRequestedAt: null,
      pausedReason: null,
    });
  }

  keepPausedById(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    return this.repository.updateLifecycleByIdForChat(id, telegramChatId, {
      isActive: false,
      requiresRenewal: false,
      renewalRequestedAt: null,
      pausedReason: FlightSearchPausedReason.USER_PAUSED,
    });
  }

  markPurchasedById(id: string, telegramChatId: string): Promise<FlightSearch | null> {
    return this.repository.updateLifecycleByIdForChat(id, telegramChatId, {
      isActive: false,
      requiresRenewal: false,
      renewalRequestedAt: null,
      pausedReason: FlightSearchPausedReason.PURCHASED,
    });
  }

  markRenewalRequired(search: FlightSearch, limit: number, requestedAt: Date): Promise<FlightSearch | null> {
    if (!search.id) {
      return Promise.resolve(null);
    }
    return this.repository.updateLifecycleById(search.id, {
      isActive: false,
      notificationCountSinceRenewal: limit,
      renewalLimit: limit,
      requiresRenewal: true,
      renewalRequestedAt: requestedAt,
      pausedReason: FlightSearchPausedReason.RENEWAL_REQUIRED,
    });
  }

  recordAutomaticNotification(search: FlightSearch, limit: number, notifiedAt: Date): Promise<FlightSearch | null> {
    if (!search.id) {
      return Promise.resolve(null);
    }
    const count = search.notificationCountSinceRenewal + 1;
    const updates: FlightSearchLifecycleUpdate = {
      notificationCountSinceRenewal: count,
      renewalLimit: limit,
    };
    if (count >= limit) {
      updates.isActive = false;
      updates.requiresRenewal = true;
      updates.renewalRequestedAt = notifiedAt;
      updates.pausedReason = FlightSearchPausedReason.RENEWAL_REQUIRED;
    }
    return this.repository.updateLifecycleById(search.id, updates);
  }
}
