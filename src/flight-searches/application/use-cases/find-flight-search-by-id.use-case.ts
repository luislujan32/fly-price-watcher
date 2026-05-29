import { Inject, Injectable } from '@nestjs/common';
import { FlightSearch } from '../../domain/entities/flight-search.entity';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchRepository,
} from '../../domain/repositories/flight-search.repository';

@Injectable()
export class FindFlightSearchByIdUseCase {
  constructor(
    @Inject(FLIGHT_SEARCH_REPOSITORY)
    private readonly repository: FlightSearchRepository,
  ) {}

  execute(id: string): Promise<FlightSearch | null> {
    return this.repository.findById(id);
  }
}
