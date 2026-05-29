import { Injectable } from '@nestjs/common';
import { CabinClass } from '../../../../flight-searches/domain/enums/cabin-class.enum';
import { TripType } from '../../../../flight-searches/domain/enums/trip-type.enum';
import { FlightQuery } from '../../../domain/models/flight-query.model';
import { AerolineasQueryParams } from './aerolineas.types';

@Injectable()
export class AerolineasQueryMapper {
  toQueryParams(query: FlightQuery): AerolineasQueryParams {
    const legs = [`${query.origin}-${query.destination}-${this.formatDate(query.departureDate)}`];

    if (query.tripType === TripType.ROUND_TRIP) {
      if (!query.returnDate) {
        throw new Error('Aerolíneas round-trip search requires returnDate.');
      }
      legs.push(`${query.destination}-${query.origin}-${this.formatDate(query.returnDate)}`);
    }

    return {
      adt: String(query.adults),
      chd: String(query.children ?? 0),
      inf: String(query.infants ?? 0),
      flexDates: 'false',
      cabinClass: this.mapCabinClass(query.cabinClass),
      flightType: query.tripType,
      leg: legs,
    };
  }

  toSearchParams(query: FlightQuery): URLSearchParams {
    const params = this.toQueryParams(query);
    const searchParams = new URLSearchParams();

    searchParams.set('adt', params.adt);
    searchParams.set('chd', params.chd);
    searchParams.set('inf', params.inf);
    searchParams.set('flexDates', params.flexDates);
    searchParams.set('cabinClass', params.cabinClass);
    searchParams.set('flightType', params.flightType);
    for (const leg of params.leg) {
      searchParams.append('leg', leg);
    }

    return searchParams;
  }

  private mapCabinClass(cabinClass: CabinClass): string {
    const map: Record<CabinClass, string> = {
      [CabinClass.ECONOMY]: 'Economy',
      [CabinClass.PREMIUM_ECONOMY]: 'PremiumEconomy',
      [CabinClass.BUSINESS]: 'Business',
    };

    return map[cabinClass];
  }

  private formatDate(date: Date): string {
    return date.toISOString().slice(0, 10).replace(/-/g, '');
  }
}
