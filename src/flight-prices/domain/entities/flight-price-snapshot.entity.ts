import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuoteMetadata } from '../../../flight-providers/domain/models/flight-quote.model';

export type FlightPriceSnapshotProps = {
  id?: string;
  searchId: string;
  providerCode: FlightProviderCode;
  totalPrice: number;
  currency: Currency;
  capturedAt: Date;
  itinerarySummary: string;
  metadata?: FlightQuoteMetadata;
  expiresAt?: Date;
};

export class FlightPriceSnapshot {
  constructor(private readonly props: FlightPriceSnapshotProps) {}

  get searchId(): string {
    return this.props.searchId;
  }

  get providerCode(): FlightProviderCode {
    return this.props.providerCode;
  }

  get totalPrice(): number {
    return this.props.totalPrice;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get capturedAt(): Date {
    return this.props.capturedAt;
  }

  get itinerarySummary(): string {
    return this.props.itinerarySummary;
  }

  get metadata(): FlightQuoteMetadata | undefined {
    return this.props.metadata;
  }

  get expiresAt(): Date | undefined {
    return this.props.expiresAt;
  }

  toPrimitives(): FlightPriceSnapshotProps {
    return { ...this.props };
  }
}
