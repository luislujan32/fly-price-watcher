import { AlertMessageFormatter } from '../../../src/flight-alerts/domain/services/alert-message.formatter';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightQuoteTag } from '../../../src/flight-providers/domain/models/flight-quote.model';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { FlightWatchRun } from '../../../src/flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';

describe('AlertMessageFormatter', () => {
  const formatter = new AlertMessageFormatter();

  afterEach(() => {
    delete process.env.DEBUG_NOTIFICATIONS;
    delete process.env.MAX_LEG_OPTIONS_IN_ALERT;
  });

  it('formats DAILY_SUMMARY round trip with human text and line breaks', () => {
    const message = formatter.dailySummary(search(), run({
      cheapestPrice: 234_664,
      recommendedPrice: 234_664,
      tags: ['CHEAPEST', 'GOOD_TIME', 'RECOMMENDED'],
    }));

    expect(message).toContain([
      '✈️ Viaje Diciembre',
      '',
      'JUJ → AEP → JUJ',
      '20/12/2026 al 28/12/2026',
      '',
      '✅ Vuelos válidos: ida 1 · vuelta 1',
      '🔁 Combinaciones evaluadas: 5',
      '💰 Total más barato: $234.664 ARS',
      '⭐ Recomendado: $234.664 ARS',
      '🏷️ Tarifa: Base',
      '💺 Asientos disponibles: 4',
      '',
      'Desglose recomendado:',
      'Ida: $120.000 ARS',
      'Vuelta: $114.664 ARS',
      'Total: $234.664 ARS',
      '',
      'Ida — vuelos válidos:',
      '1. ⭐ AR1517 | JUJ → AEP',
      '   20/12/2026 12:00 → 14:10',
      '   Desde $120.000 ARS | Base | más barata',
      '',
      'Vuelta — vuelos válidos:',
      '1. ⭐ AR1512 | AEP → JUJ',
      '   28/12/2026 08:00 → 10:20',
      '   Desde $114.664 ARS | Base | más barata',
      '',
      '📌 Hay 4 opciones al precio mínimo.',
      'Criterio: más barato y buen horario.',
    ].join('\n'));
    expect(message).not.toContain('Tags:');
  });

  it('formats PRICE_DROP with a human title and route', () => {
    const message = formatter.priceDrop({
      search: search(),
      currentRun: run({ cheapestPrice: 288_038 }),
      previousPrice: 337_419,
      currentPrice: 288_038,
      label: 'cheapest',
    });

    expect(message).toBe([
      '📉 Bajó el precio más barato — Viaje Diciembre',
      '',
      'JUJ → AEP → JUJ',
      'Antes: $337.419 ARS',
      'Ahora: $288.038 ARS',
    ].join('\n'));
  });

  it('explains when recommended equals cheapest', () => {
    const message = formatter.dailySummary(search(), run({
      cheapestPrice: 234_664,
      recommendedPrice: 234_664,
    }));

    expect(message).toContain('Criterio: más barato y buen horario.');
  });

  it('explains when recommended is different from cheapest', () => {
    const message = formatter.dailySummary(search(), run({
      cheapestPrice: 234_664,
      recommendedPrice: 241_000,
    }));

    expect(message).toContain('Criterio: no es el más barato, pero tiene mejor horario.');
  });

  it('translates technical tags into human labels', () => {
    const message = formatter.dailySummary(search(), run({
      tags: ['EARLY_MORNING', 'LATE_NIGHT', 'UNCOMFORTABLE_RECOMMENDED'],
    }));

    process.env.DEBUG_NOTIFICATIONS = 'true';

    const debugMessage = formatter.dailySummary(search(), run({
      tags: ['EARLY_MORNING', 'LATE_NIGHT', 'UNCOMFORTABLE_RECOMMENDED'],
    }));

    expect(debugMessage).toContain('Tags técnicos: EARLY_MORNING, LATE_NIGHT, UNCOMFORTABLE_RECOMMENDED');
  });

  it('shows technical tags only when DEBUG_NOTIFICATIONS=true', () => {
    process.env.DEBUG_NOTIFICATIONS = 'true';

    const message = formatter.dailySummary(search(), run({
      tags: ['CHEAPEST', 'GOOD_TIME', 'RECOMMENDED'],
    }));

    expect(message).toContain('Tags técnicos: CHEAPEST, GOOD_TIME, RECOMMENDED');
  });

  it('shows valid outbound and inbound options without discarded options', () => {
    const message = formatter.dailySummary(search(), run({ includeExtraOptions: true }));

    expect(message).toContain('Ida — vuelos válidos:');
    expect(message).toContain('AR1517 | JUJ → AEP');
    expect(message).toContain('AR1519 | JUJ → AEP');
    expect(message).toContain('Vuelta — vuelos válidos:');
    expect(message).toContain('AR1512 | AEP → JUJ');
    expect(message).toContain('AR1516 | AEP → JUJ');
    expect(message).not.toContain('JUJ → EZE');
    expect(message).not.toContain('JUJ → COR');
  });

  it('marks recommended and cheapest leg options', () => {
    const message = formatter.dailySummary(search(), run());

    expect(message).toContain('1. ⭐ AR1517 | JUJ → AEP');
    expect(message).toContain('Desde $120.000 ARS | Base | más barata');
    expect(message).toContain('1. ⭐ AR1512 | AEP → JUJ');
    expect(message).toContain('Desde $114.664 ARS | Base | más barata');
  });

  it('respects MAX_LEG_OPTIONS_IN_ALERT', () => {
    process.env.MAX_LEG_OPTIONS_IN_ALERT = '1';

    const message = formatter.dailySummary(search(), run({ includeExtraOptions: true }));

    expect(message).toContain('Hay 1 vuelos válidos más no mostrados.');
    expect(message).not.toContain('AR1519 | JUJ → AEP');
  });

  it('includes applied filters and exclusion note', () => {
    const message = formatter.dailySummary(search(), run());

    expect(message).toContain('Filtros aplicados:');
    expect(message).toContain('✅ Solo vuelos directos');
    expect(message).toContain('✅ Aeropuerto exacto');
    expect(message).toContain('Se excluyen opciones con escala o desde/hacia otro aeropuerto.');
  });

  it('shows other fares under the same flight only once', () => {
    const message = formatter.dailySummary(search(), run({ includeFareFamilies: true }));

    expect(message.match(/AR1517 \| JUJ → AEP/g)).toHaveLength(1);
    expect(message).toContain('Otras tarifas: Plus $130.000 ARS, Flex $150.000 ARS');
  });
});

function search(): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'Viaje Diciembre',
    origin: 'JUJ',
    destination: 'AEP',
    departureDate: new Date('2026-12-20T12:00:00.000Z'),
    returnDate: new Date('2026-12-28T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    targetPrice: 250_000,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
  });
}

function run(params: {
  cheapestPrice?: number;
  recommendedPrice?: number;
  tags?: FlightQuoteTag[];
  includeExtraOptions?: boolean;
  includeFareFamilies?: boolean;
} = {}): FlightWatchRun {
  const cheapestPrice = params.cheapestPrice ?? 234_664;
  const recommendedPrice = params.recommendedPrice ?? cheapestPrice;
  const tags = params.tags ?? ['CHEAPEST', 'GOOD_TIME', 'RECOMMENDED'];
  return new FlightWatchRun({
    id: 'run-1',
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    ranAt: new Date('2026-05-23T12:00:00.000Z'),
    status: FlightWatchRunStatus.SUCCESS,
    route: 'JUJ-AEP',
    departureDate: new Date('2026-12-20T12:00:00.000Z'),
    returnDate: new Date('2026-12-28T12:00:00.000Z'),
    validOptionsCount: 5,
    currency: Currency.ARS,
    cheapestPrice,
    recommendedPrice,
    cheapestOptionCount: 4,
    topOptions: [],
    recommendedOption: {
      price: recommendedPrice,
      currency: Currency.ARS,
      outboundPrice: 120_000,
      inboundPrice: recommendedPrice - 120_000,
      pricingSource: 'sum_of_bounds',
      fareName: 'Base',
      seatsAvailable: 4,
      outboundSummary: 'AR1517 JUJ-AEP 2026-12-20T12:00:00',
      inboundSummary: 'AR1512 AEP-JUJ 2026-12-28T08:00:00',
      outboundOptions: [
        {
          legType: 'outbound',
          flightNumber: 'AR1517',
          origin: 'JUJ',
          destination: 'AEP',
          departureDateTime: '2026-12-20T12:00:00',
          arrivalDateTime: '2026-12-20T14:10:00',
          price: 120_000,
          cheapestPrice: 120_000,
          cheapestFareName: 'Base',
          fares: [
            { fareName: 'Base', price: 120_000, currency: Currency.ARS },
            ...(params.includeFareFamilies ? [
              { fareName: 'Plus', price: 130_000, currency: Currency.ARS },
              { fareName: 'Flex', price: 150_000, currency: Currency.ARS },
            ] : []),
          ],
          currency: Currency.ARS,
          fareName: 'Base',
          isRecommended: true,
          isCheapest: true,
          hasStops: false,
        },
        ...(params.includeExtraOptions ? [{
          legType: 'outbound' as const,
          flightNumber: 'AR1519',
          origin: 'JUJ',
          destination: 'AEP',
          departureDateTime: '2026-12-20T19:00:00',
          arrivalDateTime: '2026-12-20T21:10:00',
          price: 160_000,
          cheapestPrice: 160_000,
          cheapestFareName: 'Base',
          fares: [{ fareName: 'Base', price: 160_000, currency: Currency.ARS }],
          currency: Currency.ARS,
          fareName: 'Base',
          hasStops: false,
        }] : []),
      ],
      inboundOptions: [
        {
          legType: 'inbound',
          flightNumber: 'AR1512',
          origin: 'AEP',
          destination: 'JUJ',
          departureDateTime: '2026-12-28T08:00:00',
          arrivalDateTime: '2026-12-28T10:20:00',
          price: recommendedPrice - 120_000,
          cheapestPrice: recommendedPrice - 120_000,
          cheapestFareName: 'Base',
          fares: [{ fareName: 'Base', price: recommendedPrice - 120_000, currency: Currency.ARS }],
          currency: Currency.ARS,
          fareName: 'Base',
          isRecommended: true,
          isCheapest: true,
          hasStops: false,
        },
        ...(params.includeExtraOptions ? [{
          legType: 'inbound' as const,
          flightNumber: 'AR1516',
          origin: 'AEP',
          destination: 'JUJ',
          departureDateTime: '2026-12-28T17:15:00',
          arrivalDateTime: '2026-12-28T19:35:00',
          price: 190_000,
          cheapestPrice: 190_000,
          cheapestFareName: 'Base',
          fares: [{ fareName: 'Base', price: 190_000, currency: Currency.ARS }],
          currency: Currency.ARS,
          fareName: 'Base',
          hasStops: false,
        }] : []),
      ],
      tags,
    },
  });
}
