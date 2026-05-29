import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightAlertType } from '../enums/flight-alert-type.enum';

export type FlightAlertProps = {
  id?: string;
  searchId: string;
  providerCode: FlightProviderCode;
  alertType: FlightAlertType;
  alertDate: string;
  message: string;
  expiresAt?: Date;
  createdAt?: Date;
};

export class FlightAlert {
  constructor(private readonly props: FlightAlertProps) {}

  get searchId(): string {
    return this.props.searchId;
  }

  get providerCode(): FlightProviderCode {
    return this.props.providerCode;
  }

  get alertType(): FlightAlertType {
    return this.props.alertType;
  }

  get alertDate(): string {
    return this.props.alertDate;
  }

  get message(): string {
    return this.props.message;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  toPrimitives(): FlightAlertProps {
    return { ...this.props };
  }
}
