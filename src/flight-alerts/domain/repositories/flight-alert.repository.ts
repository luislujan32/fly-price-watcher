import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightAlert } from '../entities/flight-alert.entity';
import { FlightAlertType } from '../enums/flight-alert-type.enum';

export const FLIGHT_ALERT_REPOSITORY = Symbol('FLIGHT_ALERT_REPOSITORY');

export interface FlightAlertRepository {
  create(alert: FlightAlert): Promise<FlightAlert>;
  existsForDay(params: {
    searchId: string;
    providerCode: FlightProviderCode;
    alertType: FlightAlertType;
    alertDate: string;
  }): Promise<boolean>;
}
