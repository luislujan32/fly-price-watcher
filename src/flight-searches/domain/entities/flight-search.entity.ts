import { CabinClass } from '../enums/cabin-class.enum';
import { Currency } from '../enums/currency.enum';
import { TripType } from '../enums/trip-type.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';

export type FlightSearchProps = {
  id?: string;
  name: string;
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  tripType: TripType;
  cabinClass: CabinClass;
  currency: Currency;
  adults: number;
  providerCode?: FlightProviderCode;
  telegramChatId?: string;
  targetPrice?: number;
  notifyOnPriceDrop: boolean;
  notifyAlways: boolean;
  isActive: boolean;
  deletedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};

export class FlightSearch {
  constructor(private readonly props: FlightSearchProps) {}

  get id(): string | undefined {
    return this.props.id;
  }

  get name(): string {
    return this.props.name;
  }

  get origin(): string {
    return this.props.origin;
  }

  get destination(): string {
    return this.props.destination;
  }

  get departureDate(): Date {
    return this.props.departureDate;
  }

  get returnDate(): Date | undefined {
    return this.props.returnDate;
  }

  get tripType(): TripType {
    return this.props.tripType;
  }

  get cabinClass(): CabinClass {
    return this.props.cabinClass;
  }

  get currency(): Currency {
    return this.props.currency;
  }

  get adults(): number {
    return this.props.adults;
  }

  get providerCode(): FlightProviderCode | undefined {
    return this.props.providerCode;
  }

  get telegramChatId(): string | undefined {
    return this.props.telegramChatId;
  }

  get targetPrice(): number | undefined {
    return this.props.targetPrice;
  }

  get notifyOnPriceDrop(): boolean {
    return this.props.notifyOnPriceDrop;
  }

  get notifyAlways(): boolean {
    return this.props.notifyAlways;
  }

  get isActive(): boolean {
    return this.props.isActive;
  }

  get deletedAt(): Date | undefined {
    return this.props.deletedAt;
  }

  toPrimitives(): FlightSearchProps {
    return { ...this.props };
  }
}
