import { FlightLegOption, FlightQuote } from '../../../domain/models/flight-quote.model';
import { AerolineasMappingDiagnostics } from './aerolineas.types';

export function formatAerolineasDiagnosticOutput(params: {
  quotes: FlightQuote[];
  diagnostics: AerolineasMappingDiagnostics;
}): string[] {
  const sourceQuote = params.quotes[0];
  const outboundOptions = sourceQuote?.outboundOptions ?? sourceQuote?.metadata?.outboundOptions ?? [];
  const inboundOptions = sourceQuote?.inboundOptions ?? sourceQuote?.metadata?.inboundOptions ?? [];
  const sortedQuotes = [...params.quotes].sort((left, right) => left.totalPrice - right.totalPrice);

  return [
    'A) Summary',
    `raw candidates: ${params.diagnostics.rawCandidates}`,
    `valid outbound flights: ${outboundOptions.length}`,
    `valid inbound flights: ${inboundOptions.length}`,
    `valid combinations: ${params.quotes.length}`,
    `discarded by stops: ${params.diagnostics.discardedByStops}`,
    `discarded by airport: ${params.diagnostics.discardedByAirport}`,
    `discarded by date: ${params.diagnostics.discardedByDate}`,
    `discarded by missing price: ${params.diagnostics.discardedByMissingPrice}`,
    '',
    'B) Valid outbound flights',
    ...formatLegOptions(outboundOptions),
    '',
    'C) Valid inbound flights',
    ...(inboundOptions.length ? formatLegOptions(inboundOptions) : ['none']),
    '',
    'D) Calculated combinations',
    ...formatCombinations(sortedQuotes),
    '',
    'E) Discarded options',
    ...formatDiscarded(params.diagnostics),
  ];
}

function formatLegOptions(options: FlightLegOption[]): string[] {
  if (!options.length) {
    return ['none'];
  }
  return options.map((option, index) => [
    `${index + 1}. ${option.flightNumber ?? 'flight'} ${option.origin ?? '?'}-${option.destination ?? '?'}`,
    `${option.departureDateTime ?? '?'} -> ${option.arrivalDateTime ?? '?'}`,
    `cheapest=${legPrice(option)} ${option.currency}`,
    `fare=${option.cheapestFareName ?? option.fareName ?? 'fare unknown'}`,
    otherFares(option),
    marker(option.isCheapest, 'cheapest'),
    marker(option.isRecommended, 'recommended'),
  ].filter(Boolean).join(' | '));
}

function formatCombinations(quotes: FlightQuote[]): string[] {
  if (!quotes.length) {
    return ['none'];
  }
  return quotes.map((quote, index) => {
    const outbound = firstLegLabel(quote.outboundOptions ?? quote.metadata?.outboundOptions, quote.outboundSegments ?? quote.metadata?.outboundSegments);
    const inbound = firstLegLabel(quote.inboundOptions ?? quote.metadata?.inboundOptions, quote.inboundSegments ?? quote.metadata?.inboundSegments);
    const tags = quote.tags ?? quote.metadata?.tags ?? [];
    return [
      `${index + 1}. ${outbound}${inbound ? ` + ${inbound}` : ''}`,
      `total=${quote.totalPrice} ${quote.currency}`,
      quote.outboundPrice ? `outbound=${quote.outboundPrice}` : undefined,
      quote.inboundPrice ? `inbound=${quote.inboundPrice}` : undefined,
      marker(tags.includes('CHEAPEST'), 'cheapest'),
      marker(tags.includes('RECOMMENDED'), 'recommended'),
    ].filter(Boolean).join(' | ');
  });
}

function legPrice(option: FlightLegOption): number {
  return option.cheapestPrice ?? option.price ?? 0;
}

function otherFares(option: FlightLegOption): string | undefined {
  const fares = (option.fares ?? [])
    .filter((fare) => fare.price !== legPrice(option) || fare.fareName !== (option.cheapestFareName ?? option.fareName))
    .map((fare) => `${fare.fareName ?? 'fare'}=${fare.price}`);
  return fares.length ? `other fares: ${fares.join(', ')}` : undefined;
}

function firstLegLabel(
  options?: FlightLegOption[],
  segments?: NonNullable<FlightQuote['metadata']>['outboundSegments'],
): string {
  const recommended = options?.find((option) => option.isRecommended);
  if (recommended) {
    return `${recommended.flightNumber ?? 'flight'} ${recommended.origin ?? '?'}-${recommended.destination ?? '?'}`;
  }
  const first = segments?.[0];
  return `${first?.flightNumber ?? 'flight'} ${first?.origin ?? '?'}-${first?.destination ?? '?'}`;
}

function formatDiscarded(diagnostics: AerolineasMappingDiagnostics): string[] {
  if (!diagnostics.discardedReasons.length) {
    return ['none'];
  }
  return diagnostics.discardedReasons.slice(0, 10).map((reason) => {
    const label = reason.reason === 'HAS_STOPS'
      ? 'discarded by stops'
      : reason.reason === 'AIRPORT_MISMATCH'
        ? 'discarded by airport'
        : reason.reason === 'DATE_MISMATCH'
          ? 'discarded by date'
          : 'discarded by missing price';
    return `${label}: ${reason.details}`;
  });
}

function marker(value: boolean | undefined, label: string): string | undefined {
  return value ? label : undefined;
}
