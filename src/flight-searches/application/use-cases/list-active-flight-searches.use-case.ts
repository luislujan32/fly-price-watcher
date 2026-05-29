import { Inject, Injectable } from '@nestjs/common';
import { FlightSearch } from '../../domain/entities/flight-search.entity';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchRepository,
} from '../../domain/repositories/flight-search.repository';

@Injectable()
export class ListActiveFlightSearchesUseCase {
  constructor(
    @Inject(FLIGHT_SEARCH_REPOSITORY)
    private readonly repository: FlightSearchRepository,
  ) {}

  execute(): Promise<FlightSearch[]> {
    return this.repository.findActive();
  }
}
