import { FlightProviderCode } from '../../../domain/enums/flight-provider-code.enum';

export type AerolineasQueryParams = {
  adt: string;
  chd: string;
  inf: string;
  flexDates: 'false';
  cabinClass: string;
  flightType: string;
  leg: string[];
};

export type AerolineasFlightOffersResponse = {
  searchMetadata?: {
    shoppingId?: string;
    currency?: string;
    flightType?: string;
    routes?: string[];
  };
  brandedOffers?: Record<string, AerolineasOfferGroup[]>;
};

export type AerolineasOfferGroup = {
  legs?: AerolineasLeg[];
  offers?: AerolineasOffer[];
  bestOffer?: boolean;
};

export type AerolineasLeg = {
  segments?: AerolineasSegment[];
  stops?: number;
  totalDuration?: number;
};

export type AerolineasSegment = {
  flightNumber?: number | string;
  airline?: string;
  operatingAirline?: string;
  departure?: string;
  arrival?: string;
  origin?: string;
  destination?: string;
};

export type AerolineasOffer = {
  cabinClass?: string;
  bookingClass?: string;
  fareBasis?: string;
  brand?: {
    id?: string;
    name?: string;
  };
  fare?: {
    total?: number;
    baseFare?: number;
    taxes?: number;
  };
  seatAvailability?: {
    seats?: number;
    lowAvailability?: boolean;
  };
};

export type AerolineasMappedOffer = {
  providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS;
  totalPrice: number;
  currency: string;
  itinerarySummary: string;
};

export type AerolineasDiscardReason = {
  bucketKey: string;
  fareName: string;
  reason: 'AIRPORT_MISMATCH' | 'HAS_STOPS' | 'DATE_MISMATCH' | 'MISSING_PRICE';
  details: string;
};

export type AerolineasMappingDiagnostics = {
  rawCandidates: number;
  discardedByAirport: number;
  discardedByStops: number;
  discardedByDate: number;
  discardedByMissingPrice: number;
  validCandidates: number;
  discardedReasons: AerolineasDiscardReason[];
};

export type AerolineasMappingResult = {
  quotes: import('../../../domain/models/flight-quote.model').FlightQuote[];
  diagnostics: AerolineasMappingDiagnostics;
};
