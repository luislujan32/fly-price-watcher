import { Inject, Injectable, Optional } from '@nestjs/common';
import { FlightQuote } from '../../../flight-providers/domain/models/flight-quote.model';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { DataRetentionService } from '../../../shared/retention/data-retention.service';
import { FlightPriceSnapshot } from '../../domain/entities/flight-price-snapshot.entity';
import {
  FLIGHT_PRICE_REPOSITORY,
  FlightPriceRepository,
} from '../../domain/repositories/flight-price.repository';

@Injectable()
export class SaveFlightPriceSnapshotUseCase {
  constructor(
    @Inject(FLIGHT_PRICE_REPOSITORY)
    private readonly repository: FlightPriceRepository,
    @Optional()
    private readonly retention?: DataRetentionService,
  ) {}

  execute(quote: FlightQuote, search?: FlightSearch): Promise<FlightPriceSnapshot> {
    return this.repository.create(new FlightPriceSnapshot({
      ...quote,
      expiresAt: search ? this.expiresAt(search) : undefined,
    }));
  }

  private expiresAt(search: FlightSearch): Date {
    const retention = this.retention ?? new DataRetentionService();
    return retention.expiresAtForTrip({
      departureDate: search.departureDate,
      returnDate: search.returnDate,
    });
  }
}
