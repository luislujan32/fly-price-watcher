import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightProviderCode } from '../enums/flight-provider-code.enum';

export type FlightQuote = {
  searchId: string;
  providerCode: FlightProviderCode;
  outboundPrice?: number;
  inboundPrice?: number;
  totalPrice: number;
  currency: Currency;
  capturedAt: Date;
  itinerarySummary: string;
  pricingSource?: FlightQuotePricingSource;
  outboundSegments?: FlightQuoteSegment[];
  inboundSegments?: FlightQuoteSegment[];
  outboundOptions?: FlightLegOption[];
  inboundOptions?: FlightLegOption[];
  outboundDepartureTime?: string;
  inboundDepartureTime?: string;
  fareName?: string;
  outboundFareName?: string;
  inboundFareName?: string;
  seatsAvailable?: number;
  hasStops?: boolean;
  tags?: FlightQuoteTag[];
  score?: number;
  metadata?: FlightQuoteMetadata;
};

export type FlightQuotePricingSource = 'provider_total' | 'sum_of_bounds' | 'unknown';

export type FlightQuoteTag =
  | 'CHEAPEST'
  | 'RECOMMENDED'
  | 'EARLY_MORNING'
  | 'LATE_NIGHT'
  | 'GOOD_TIME'
  | 'UNCOMFORTABLE_RECOMMENDED';

export type FlightQuoteSegment = {
  flightNumber?: string;
  airline?: string;
  origin?: string;
  destination?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
};

export type FlightLegOption = {
  legType: 'outbound' | 'inbound';
  flightNumber?: string;
  origin?: string;
  destination?: string;
  departureDateTime?: string;
  arrivalDateTime?: string;
  duration?: number;
  currency: Currency;
  cheapestPrice?: number;
  cheapestFareName?: string;
  fares?: FlightFareOption[];
  price?: number;
  fareName?: string;
  seatsAvailable?: number;
  hasStops?: boolean;
  stopsCount?: number;
  tags?: FlightQuoteTag[];
  score?: number;
  isCheapest?: boolean;
  isRecommended?: boolean;
};

export type FlightFareOption = {
  fareName?: string;
  price: number;
  currency: Currency;
  seatsAvailable?: number;
  baggageInfo?: string;
  rawBrandCode?: string;
};

export type FlightQuoteMetadata = {
  outboundPrice?: number;
  inboundPrice?: number;
  pricingSource?: FlightQuotePricingSource;
  outboundSegments?: FlightQuoteSegment[];
  inboundSegments?: FlightQuoteSegment[];
  outboundOptions?: FlightLegOption[];
  inboundOptions?: FlightLegOption[];
  outboundDepartureTime?: string;
  inboundDepartureTime?: string;
  totalSegments?: number;
  hasStops?: boolean;
  actualOutboundOrigin?: string;
  actualOutboundDestination?: string;
  actualInboundOrigin?: string;
  actualInboundDestination?: string;
  fareName?: string;
  outboundFareName?: string;
  inboundFareName?: string;
  seatsAvailable?: number;
  tags?: FlightQuoteTag[];
  score?: number;
  discardedDiagnostics?: {
    rawCandidates: number;
    discardedByAirport: number;
    discardedByStops: number;
    discardedByDate: number;
    discardedByMissingPrice?: number;
    validCandidates: number;
    discardedReasons: string[];
  };
  watchSummary?: {
    searchName: string;
    route: string;
    departureDate: string;
    returnDate?: string;
    validOptions: number;
    cheapestPrice: number;
    recommendedPrice: number;
    cheapestIsRecommended: boolean;
    cheapestOptionCount: number;
    recommendedOutbound: string;
    recommendedInbound?: string;
    fareName?: string;
    seatsAvailable?: number;
    tags: FlightQuoteTag[];
  };
};
