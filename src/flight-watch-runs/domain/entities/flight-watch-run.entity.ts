import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import {
  FlightLegOption,
  FlightQuotePricingSource,
  FlightQuoteTag,
} from '../../../flight-providers/domain/models/flight-quote.model';
import { FlightWatchRunStatus } from '../enums/flight-watch-run-status.enum';

export type FlightOptionSummary = {
  price: number;
  currency: Currency;
  outboundPrice?: number;
  inboundPrice?: number;
  pricingSource?: FlightQuotePricingSource;
  fareName?: string;
  outboundFareName?: string;
  inboundFareName?: string;
  seatsAvailable?: number;
  outboundSummary: string;
  inboundSummary?: string;
  outboundOptions?: FlightLegOption[];
  inboundOptions?: FlightLegOption[];
  outboundDepartureTime?: string;
  inboundDepartureTime?: string;
  tags: FlightQuoteTag[];
  hasStops?: boolean;
};

export type DiagnosticsSummary = {
  rawCandidates?: number;
  discardedByAirport?: number;
  discardedByStops?: number;
  discardedByDate?: number;
  discardedByMissingPrice?: number;
  validCandidates?: number;
};

export type DiagnosticsDetails = {
  discardedReasons?: string[];
};

export type FlightWatchRunProps = {
  id?: string;
  searchId: string;
  providerCode: FlightProviderCode;
  ranAt: Date;
  status: FlightWatchRunStatus;
  route: string;
  departureDate: Date;
  returnDate?: Date;
  validOptionsCount: number;
  currency?: Currency;
  cheapestPrice?: number;
  recommendedPrice?: number;
  cheapestOption?: FlightOptionSummary;
  recommendedOption?: FlightOptionSummary;
  topOptions: FlightOptionSummary[];
  cheapestOptionCount?: number;
  diagnosticsSummary?: DiagnosticsSummary;
  diagnosticsDetails?: DiagnosticsDetails;
  alertsGenerated?: number;
  expiresAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class FlightWatchRun {
  constructor(private readonly props: FlightWatchRunProps) {}

  get searchId(): string {
    return this.props.searchId;
  }

  get id(): string | undefined {
    return this.props.id;
  }

  get providerCode(): FlightProviderCode {
    return this.props.providerCode;
  }

  get ranAt(): Date {
    return this.props.ranAt;
  }

  get status(): FlightWatchRunStatus {
    return this.props.status;
  }

  get currency(): Currency | undefined {
    return this.props.currency;
  }

  get cheapestPrice(): number | undefined {
    return this.props.cheapestPrice;
  }

  get recommendedPrice(): number | undefined {
    return this.props.recommendedPrice;
  }

  get route(): string {
    return this.props.route;
  }

  get departureDate(): Date {
    return this.props.departureDate;
  }

  get returnDate(): Date | undefined {
    return this.props.returnDate;
  }

  get cheapestOptionCount(): number | undefined {
    return this.props.cheapestOptionCount;
  }

  get recommendedOption(): FlightOptionSummary | undefined {
    return this.props.recommendedOption;
  }

  get topOptions(): FlightOptionSummary[] {
    return this.props.topOptions;
  }

  get validOptionsCount(): number {
    return this.props.validOptionsCount;
  }

  get alertsGenerated(): number | undefined {
    return this.props.alertsGenerated;
  }

  get diagnosticsSummary(): DiagnosticsSummary | undefined {
    return this.props.diagnosticsSummary;
  }

  get diagnosticsDetails(): DiagnosticsDetails | undefined {
    return this.props.diagnosticsDetails;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  toPrimitives(): FlightWatchRunProps {
    return { ...this.props };
  }
}
