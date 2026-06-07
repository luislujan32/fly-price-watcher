import { CabinClass } from '../../../flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../flight-searches/domain/enums/trip-type.enum';

export type FlightQuery = {
  searchId: string;
  origin: string;
  destination: string;
  departureDate: Date;
  returnDate?: Date;
  tripType: TripType;
  cabinClass: CabinClass;
  currency: Currency;
  adults: number;
  children?: number;
  infants?: number;
  allowStops?: boolean;
};
