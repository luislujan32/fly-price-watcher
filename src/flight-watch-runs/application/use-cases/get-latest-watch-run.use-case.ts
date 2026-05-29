import { Inject, Injectable } from '@nestjs/common';
import { FlightWatchRun } from '../../domain/entities/flight-watch-run.entity';
import {
  FLIGHT_WATCH_RUN_REPOSITORY,
  FlightWatchRunRepository,
} from '../../domain/repositories/flight-watch-run.repository';

@Injectable()
export class GetLatestWatchRunUseCase {
  constructor(
    @Inject(FLIGHT_WATCH_RUN_REPOSITORY)
    private readonly repository: FlightWatchRunRepository,
  ) {}

  execute(searchId: string): Promise<FlightWatchRun | null> {
    return this.repository.findLatestBySearchId(searchId);
  }
}
