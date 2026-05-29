import { Injectable } from '@nestjs/common';
import { FlightQuery } from '../../../domain/models/flight-query.model';

@Injectable()
export class JetSmartQueryMapper {
  toSearchParams(query: FlightQuery, pointOfSaleCountry: string): URLSearchParams {
    return this.toSearchParamsForLeg({
      origin: query.origin,
      destination: query.destination,
      date: query.departureDate,
      pointOfSaleCountry,
    });
  }

  toSearchParamsForLeg(params: {
    origin: string;
    destination: string;
    date: Date;
    pointOfSaleCountry: string;
  }): URLSearchParams {
    const searchParams = new URLSearchParams();
    const departureDate = this.dateOnly(params.date);

    searchParams.set('_agg', '');
    searchParams.set('_meta', '');
    searchParams.append('bt_date', `${departureDate} 00:00:00`);
    searchParams.append('bt_date', `${departureDate} 24:00:00`);
    searchParams.set('pov_c', params.pointOfSaleCountry);
    searchParams.set('dep', params.origin);
    searchParams.set('arr', params.destination);

    return searchParams;
  }

  toSearchParamsFromOrigin(params: {
    origin: string;
    date: Date;
    pointOfSaleCountry: string;
  }): URLSearchParams {
    const searchParams = new URLSearchParams();
    const departureDate = this.dateOnly(params.date);

    searchParams.set('_agg', '');
    searchParams.set('_meta', '');
    searchParams.append('bt_date', `${departureDate} 00:00:00`);
    searchParams.append('bt_date', `${departureDate} 24:00:00`);
    searchParams.set('pov_c', params.pointOfSaleCountry);
    searchParams.set('dep', params.origin);

    return searchParams;
  }

  private dateOnly(date: Date): string {
    return date.toISOString().slice(0, 10);
  }
}
