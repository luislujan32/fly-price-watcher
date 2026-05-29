import { FlightQuoteRankingService } from '../../../src/flight-providers/application/services/flight-quote-ranking.service';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuote } from '../../../src/flight-providers/domain/models/flight-quote.model';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';

describe('FlightQuoteRankingService', () => {
  const service = new FlightQuoteRankingService();

  it('marks the cheapest option and recommends a better-time option when the cheapest is too early', () => {
    const result = service.rank([
      quote({ price: 80_000, departure: '2026-07-15T06:30:00' }),
      quote({ price: 85_000, departure: '2026-07-15T10:00:00' }),
    ]);

    expect(result[0]?.tags).toEqual(expect.arrayContaining(['CHEAPEST', 'EARLY_MORNING']));
    expect(result[1]?.tags).toEqual(expect.arrayContaining(['GOOD_TIME', 'RECOMMENDED']));
    expect(result[0]?.tags).not.toContain('RECOMMENDED');
  });

  it('recommends the cheapest option when every option is uncomfortable', () => {
    const result = service.rank([
      quote({ price: 80_000, departure: '2026-07-15T06:30:00' }),
      quote({ price: 82_000, departure: '2026-07-15T22:30:00' }),
    ]);

    expect(result[0]?.tags).toEqual(expect.arrayContaining([
      'CHEAPEST',
      'EARLY_MORNING',
      'RECOMMENDED',
      'UNCOMFORTABLE_RECOMMENDED',
    ]));
    expect(result[1]?.tags).toEqual(expect.arrayContaining(['LATE_NIGHT']));
  });
});

function quote(params: { price: number; departure: string }): FlightQuote {
  return {
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    totalPrice: params.price,
    currency: Currency.ARS,
    capturedAt: new Date('2026-05-21T12:00:00.000Z'),
    itinerarySummary: 'AR1910 AEP-MDZ',
    outboundDepartureTime: params.departure,
    metadata: {
      outboundDepartureTime: params.departure,
    },
  };
}
