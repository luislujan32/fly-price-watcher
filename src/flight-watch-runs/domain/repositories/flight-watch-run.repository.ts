import { FlightWatchRun } from '../entities/flight-watch-run.entity';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';

export const FLIGHT_WATCH_RUN_REPOSITORY = Symbol('FLIGHT_WATCH_RUN_REPOSITORY');

export interface FlightWatchRunRepository {
  create(run: FlightWatchRun): Promise<FlightWatchRun>;
  updateAlertsGenerated(id: string, alertsGenerated: number): Promise<FlightWatchRun | null>;
  findLatestSuccessfulBefore(
    searchId: string,
    providerCode: FlightProviderCode,
    beforeDate: Date,
  ): Promise<FlightWatchRun | null>;
  findLowestCheapestBefore(
    searchId: string,
    providerCode: FlightProviderCode,
    beforeDate: Date,
  ): Promise<FlightWatchRun | null>;
  findLatestBySearchId(searchId: string): Promise<FlightWatchRun | null>;
}
