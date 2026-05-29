import { Inject, Injectable } from '@nestjs/common';
import { FlightSearch } from '../../domain/entities/flight-search.entity';
import {
  FLIGHT_SEARCH_REPOSITORY,
  FlightSearchRepository,
} from '../../domain/repositories/flight-search.repository';
import { CreateFlightSearchDto } from '../dto/create-flight-search.dto';

@Injectable()
export class CreateFlightSearchUseCase {
  constructor(
    @Inject(FLIGHT_SEARCH_REPOSITORY)
    private readonly repository: FlightSearchRepository,
  ) {}

  async execute(dto: CreateFlightSearchDto): Promise<FlightSearch> {
    return this.repository.upsertByName(new FlightSearch({
      ...dto,
      origin: dto.origin.toUpperCase(),
      destination: dto.destination.toUpperCase(),
      notifyOnPriceDrop: dto.notifyOnPriceDrop ?? true,
      notifyAlways: dto.notifyAlways ?? false,
      isActive: dto.isActive ?? true,
    }));
  }

  updateActiveByName(name: string, isActive: boolean): Promise<FlightSearch | null> {
    return this.repository.updateActiveByName(name, isActive);
  }
}
