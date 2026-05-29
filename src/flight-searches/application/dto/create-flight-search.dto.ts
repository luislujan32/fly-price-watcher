import { CabinClass } from '../../domain/enums/cabin-class.enum';
import { Currency } from '../../domain/enums/currency.enum';
import { TripType } from '../../domain/enums/trip-type.enum';
import { FlightProviderCode } from '../../../flight-providers/domain/enums/flight-provider-code.enum';

export type CreateFlightSearchDto = {
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
  notifyOnPriceDrop?: boolean;
  notifyAlways?: boolean;
  isActive?: boolean;
};
