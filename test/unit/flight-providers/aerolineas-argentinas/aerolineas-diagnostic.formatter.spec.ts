import { formatAerolineasDiagnosticOutput } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas-diagnostic.formatter';
import { AerolineasMappingDiagnostics } from '../../../../src/flight-providers/infrastructure/providers/aerolineas-argentinas/aerolineas.types';
import { FlightProviderCode } from '../../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuote } from '../../../../src/flight-providers/domain/models/flight-quote.model';
import { Currency } from '../../../../src/flight-searches/domain/enums/currency.enum';

describe('formatAerolineasDiagnosticOutput', () => {
  it('shows valid outbound and inbound options plus discarded summaries', () => {
    const output = formatAerolineasDiagnosticOutput({
      quotes: [quote()],
      diagnostics: diagnostics(),
    }).join('\n');

    expect(output).toContain('valid outbound flights: 1');
    expect(output).toContain('valid inbound flights: 1');
    expect(output).toContain('discarded by stops: 1');
    expect(output).toContain('discarded by airport: 1');
    expect(output).toContain('B) Valid outbound flights');
    expect(output).toContain('AR1515 JUJ-AEP');
    expect(output).toContain('C) Valid inbound flights');
    expect(output).toContain('AR1516 AEP-JUJ');
    expect(output).toContain('discarded by stops: segments=2 stops=1');
    expect(output).toContain('discarded by airport: expected=AEP-JUJ actual=EZE-JUJ');
  });
});

function quote(): FlightQuote {
  return {
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    outboundPrice: 268_322,
    inboundPrice: 184_925,
    totalPrice: 453_247,
    currency: Currency.ARS,
    capturedAt: new Date('2026-05-25T12:00:00.000Z'),
    itinerarySummary: 'AR1515 JUJ-AEP / AR1516 AEP-JUJ',
    pricingSource: 'sum_of_bounds',
    outboundSegments: [
      {
        flightNumber: 'AR1515',
        origin: 'JUJ',
        destination: 'AEP',
        departureDateTime: '2026-10-20T19:00:00',
      },
    ],
    inboundSegments: [
      {
        flightNumber: 'AR1516',
        origin: 'AEP',
        destination: 'JUJ',
        departureDateTime: '2026-10-22T12:30:00',
      },
    ],
    outboundOptions: [
      {
        legType: 'outbound',
        flightNumber: 'AR1515',
        origin: 'JUJ',
        destination: 'AEP',
        departureDateTime: '2026-10-20T19:00:00',
        price: 268_322,
        currency: Currency.ARS,
        fareName: 'Base',
        isCheapest: true,
        isRecommended: true,
      },
    ],
    inboundOptions: [
      {
        legType: 'inbound',
        flightNumber: 'AR1516',
        origin: 'AEP',
        destination: 'JUJ',
        departureDateTime: '2026-10-22T12:30:00',
        price: 184_925,
        currency: Currency.ARS,
        fareName: 'Base',
        isCheapest: true,
        isRecommended: true,
      },
    ],
    tags: ['CHEAPEST', 'GOOD_TIME', 'RECOMMENDED'],
  };
}

function diagnostics(): AerolineasMappingDiagnostics {
  return {
    rawCandidates: 4,
    validCandidates: 2,
    discardedByAirport: 1,
    discardedByStops: 1,
    discardedByDate: 0,
    discardedByMissingPrice: 0,
    discardedReasons: [
      {
        bucketKey: '0',
        fareName: 'Base',
        reason: 'HAS_STOPS',
        details: 'segments=2 stops=1',
      },
      {
        bucketKey: '1',
        fareName: 'Base',
        reason: 'AIRPORT_MISMATCH',
        details: 'expected=AEP-JUJ actual=EZE-JUJ',
      },
    ],
  };
}
