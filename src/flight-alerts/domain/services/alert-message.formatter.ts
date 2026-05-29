import { Injectable } from '@nestjs/common';
import { FlightLegOption, FlightQuoteTag } from '../../../flight-providers/domain/models/flight-quote.model';
import { FlightSearch } from '../../../flight-searches/domain/entities/flight-search.entity';
import { Currency } from '../../../flight-searches/domain/enums/currency.enum';
import { FlightWatchRun } from '../../../flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightAlert } from '../entities/flight-alert.entity';
import { FlightAlertType } from '../enums/flight-alert-type.enum';

@Injectable()
export class AlertMessageFormatter {
  priceDrop(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
    previousPrice: number;
    currentPrice: number;
    label: 'cheapest' | 'recommended';
  }): string {
    const title = params.label === 'recommended'
      ? '📉 Bajó la opción recomendada'
      : '📉 Bajó el precio más barato';
    return [
      `${title} — ${params.search.name}`,
      '',
      this.displayRoute(params.search, params.currentRun.route, Boolean(params.currentRun.returnDate)),
      `Antes: ${this.money(params.previousPrice, params.currentRun.currency)}`,
      `Ahora: ${this.money(params.currentPrice, params.currentRun.currency)}`,
    ].join('\n');
  }

  targetReached(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
    targetPrice: number;
  }): string {
    return `${params.search.name}: ${params.currentRun.providerCode} llegó al objetivo ${this.money(params.currentRun.cheapestPrice ?? 0, params.currentRun.currency)} <= ${this.money(params.targetPrice, params.currentRun.currency)}.`;
  }

  historicalLow(params: {
    search: FlightSearch;
    currentRun: FlightWatchRun;
  }): string {
    return `${params.search.name}: ${params.currentRun.providerCode} tiene nuevo mínimo histórico: ${this.money(params.currentRun.cheapestPrice ?? 0, params.currentRun.currency)}.`;
  }

  dailySummary(search: FlightSearch, currentRun: FlightWatchRun): string {
    const recommended = currentRun.recommendedOption;
    const isRoundTrip = Boolean(currentRun.returnDate);
    return [
      `✈️ ${search.name}`,
      '',
      this.displayRoute(search, currentRun.route, isRoundTrip),
      this.displayDates(currentRun.departureDate, currentRun.returnDate),
      '',
      this.validFlightsLine(recommended, isRoundTrip),
      isRoundTrip ? `🔁 Combinaciones evaluadas: ${currentRun.validOptionsCount}` : undefined,
      `💰 Total más barato: ${this.money(currentRun.cheapestPrice ?? 0, currentRun.currency)}`,
      `⭐ Recomendado: ${this.money(currentRun.recommendedPrice ?? currentRun.cheapestPrice ?? 0, currentRun.currency)}`,
      `🏷️ Tarifa: ${recommended?.fareName ?? 'N/D'}`,
      `💺 Asientos disponibles: ${recommended?.seatsAvailable ?? 'N/D'}`,
      '',
      ...this.priceBreakdown(recommended, currentRun.currency, isRoundTrip),
      '',
      ...this.legOptionsSection('Ida', recommended?.outboundOptions ?? []),
      ...(recommended?.inboundOptions?.length ? ['', ...this.legOptionsSection('Vuelta', recommended.inboundOptions)] : []),
      (currentRun.cheapestOptionCount ?? 0) > 1 ? '' : undefined,
      (currentRun.cheapestOptionCount ?? 0) > 1 ? `📌 Hay ${currentRun.cheapestOptionCount} opciones al precio mínimo.` : undefined,
      this.criteria(currentRun.cheapestPrice === currentRun.recommendedPrice),
      '',
      'Filtros aplicados:',
      search.allowStops !== false ? '✅ Vuelos con escalas permitidos' : '✅ Solo vuelos directos',
      '✅ Aeropuerto exacto',
      search.allowStops !== false
        ? 'Se incluyen vuelos con escala. Se excluyen opciones desde/hacia otro aeropuerto.'
        : 'Se excluyen opciones con escala o desde/hacia otro aeropuerto.',
      this.debugTagsLine(recommended?.tags ?? []),
    ].filter((line): line is string => line !== undefined).join('\n');
  }

  initialSummary(search: FlightSearch, currentRun: FlightWatchRun): string {
    return [
      '🔎 Resultado inicial',
      '',
      this.dailySummary(search, currentRun),
    ].join('\n');
  }

  consolidated(search: FlightSearch, currentRun: FlightWatchRun, alerts: FlightAlert[]): string {
    const importantEvents = this.importantEventLines(alerts);
    const summary = this.dailySummary(search, currentRun);

    if (!importantEvents.length) {
      return summary;
    }

    return [
      ...importantEvents,
      '',
      summary,
    ].join('\n');
  }

  private money(amount: number, currency?: Currency): string {
    return `$${Math.round(amount).toLocaleString('de-DE')} ${currency ?? ''}`.trim();
  }

  private displayRoute(search: FlightSearch, route?: string, isRoundTrip?: boolean): string {
    const [origin, destination] = (route ?? `${search.origin}-${search.destination}`).split('-');
    if ((isRoundTrip ?? Boolean(search.returnDate)) && origin && destination) {
      return `${origin} → ${destination} → ${origin}`;
    }
    return origin && destination ? `${origin} → ${destination}` : route ?? `${search.origin} → ${search.destination}`;
  }

  private displayDates(departureDate: Date, returnDate?: Date): string {
    return `${this.displayDate(departureDate)}${returnDate ? ` al ${this.displayDate(returnDate)}` : ''}`;
  }

  private displaySegment(value: string): string {
    const match = /^(?<flight>\S+)\s+(?<origin>[A-Z]{3})-(?<destination>[A-Z]{3})\s+(?<dateTime>\d{4}-\d{2}-\d{2}T\d{2}:\d{2})/.exec(value);
    if (!match?.groups) {
      return value;
    }
    return [
      `${match.groups.flight} | ${match.groups.origin} → ${match.groups.destination}`,
      this.displayDateTime(match.groups.dateTime),
    ].join('\n');
  }

  private priceBreakdown(
    option: FlightWatchRun['recommendedOption'],
    currency: Currency | undefined,
    isRoundTrip: boolean,
  ): string[] {
    if (!option) {
      return ['Desglose recomendado:', 'Total: N/D'];
    }
    if (!isRoundTrip) {
      return ['Desglose recomendado:', `Total: ${this.money(option.price, option.currency ?? currency)}`];
    }
    return [
      'Desglose recomendado:',
      `Ida: ${this.optionalMoney(option.outboundPrice, option.currency ?? currency)}`,
      `Vuelta: ${this.optionalMoney(option.inboundPrice, option.currency ?? currency)}`,
      `Total: ${this.money(option.price, option.currency ?? currency)}`,
    ];
  }

  private legOptionsSection(label: 'Ida' | 'Vuelta', options: FlightLegOption[]): string[] {
    if (!options.length) {
      return [`${label} — vuelos válidos:`, 'N/D'];
    }

    const sorted = this.sortLegOptions(options);
    const shown = sorted.slice(0, this.maxLegOptionsInAlert());
    const hiddenCount = Math.max(sorted.length - shown.length, 0);
    return [
      `${label} — vuelos válidos:`,
      ...shown.flatMap((option, index) => this.displayLegOption(option, index)),
      hiddenCount > 0 ? `Hay ${hiddenCount} vuelos válidos más no mostrados.` : undefined,
    ].filter((line): line is string => line !== undefined);
  }

  private displayLegOption(option: FlightLegOption, index: number): string[] {
    const otherFares = (option.fares ?? [])
      .filter((fare) => fare.price !== this.legPrice(option) || fare.fareName !== (option.cheapestFareName ?? option.fareName))
      .map((fare) => `${fare.fareName ?? 'Tarifa'} ${this.money(fare.price, fare.currency)}`);
    return [
      `${index + 1}. ${option.isRecommended ? '⭐ ' : ''}${option.flightNumber ?? 'Vuelo'} | ${option.origin ?? '?'} → ${option.destination ?? '?'}${option.hasStops ? ' 🔀 con escala' : ''}`,

      `   ${this.displayLegTimes(option)}`,
      `   Desde ${this.money(this.legPrice(option), option.currency)} | ${[
        option.cheapestFareName ?? option.fareName ?? 'Tarifa N/D',
        option.isCheapest ? 'más barata' : undefined,
      ].filter(Boolean).join(' | ')}`,
      otherFares.length ? `   Otras tarifas: ${otherFares.join(', ')}` : undefined,
    ].filter((line): line is string => line !== undefined);
  }

  private displayLegTimes(option: FlightLegOption): string {
    const departure = option.departureDateTime ? this.displayDateTime(option.departureDateTime) : 'N/D';
    const arrival = option.arrivalDateTime ? this.displayTime(option.arrivalDateTime) : undefined;
    return arrival ? `${departure} → ${arrival}` : departure;
  }

  private sortLegOptions(options: FlightLegOption[]): FlightLegOption[] {
    return [...options].sort((left, right) => {
      if (left.isRecommended !== right.isRecommended) {
        return left.isRecommended ? -1 : 1;
      }
      if (this.legPrice(left) !== this.legPrice(right)) {
        return this.legPrice(left) - this.legPrice(right);
      }
      return String(left.departureDateTime ?? '').localeCompare(String(right.departureDateTime ?? ''));
    });
  }

  private validFlightsLine(option: FlightWatchRun['recommendedOption'], isRoundTrip: boolean): string {
    const outboundCount = option?.outboundOptions?.length ?? 0;
    const inboundCount = option?.inboundOptions?.length ?? 0;
    if (isRoundTrip) {
      return `✅ Vuelos válidos: ida ${outboundCount} · vuelta ${inboundCount}`;
    }
    return `✅ Vuelos válidos: ${outboundCount}`;
  }

  private legPrice(option: FlightLegOption): number {
    return option.cheapestPrice ?? option.price ?? 0;
  }

  private displayDate(date: Date): string {
    const [year, month, day] = date.toISOString().slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  private displayDateTime(value: string): string {
    const [date, time] = value.split('T');
    if (!date || !time) {
      return value;
    }
    const [year, month, day] = date.split('-');
    return `${day}/${month}/${year} ${time.slice(0, 5)}`;
  }

  private displayTime(value: string): string {
    const time = value.split('T')[1];
    return time ? time.slice(0, 5) : value;
  }

  private optionalMoney(amount: number | undefined, currency?: Currency): string {
    return typeof amount === 'number' ? this.money(amount, currency) : 'N/D';
  }

  private maxLegOptionsInAlert(): number {
    const value = Number(process.env.MAX_LEG_OPTIONS_IN_ALERT ?? 3);
    return Number.isFinite(value) && value > 0 ? value : 3;
  }

  private criteria(cheapestIsRecommended: boolean): string {
    return cheapestIsRecommended
      ? 'Criterio: más barato y buen horario.'
      : 'Criterio: no es el más barato, pero tiene mejor horario.';
  }

  private humanTagsLine(tags: FlightQuoteTag[]): string {
    return `Etiquetas: ${tags.map((tag) => this.humanTag(tag)).join(', ') || 'sin etiquetas'}`;
  }

  private debugTagsLine(tags: FlightQuoteTag[]): string | undefined {
    return process.env.DEBUG_NOTIFICATIONS === 'true'
      ? `Tags técnicos: ${tags.join(', ') || 'none'}`
      : undefined;
  }

  private humanTag(tag: FlightQuoteTag): string {
    const labels: Record<FlightQuoteTag, string> = {
      CHEAPEST: 'más barato',
      GOOD_TIME: 'buen horario',
      RECOMMENDED: 'recomendado',
      EARLY_MORNING: 'horario muy temprano',
      LATE_NIGHT: 'horario nocturno',
      UNCOMFORTABLE_RECOMMENDED: 'recomendado aunque incómodo',
    };
    return labels[tag] ?? tag;
  }

  private importantEventLines(alerts: FlightAlert[]): string[] {
    const types = new Set(alerts.map((alert) => alert.alertType));
    const labels: Array<[FlightAlertType, string]> = [
      [FlightAlertType.LOWEST_HISTORICAL_PRICE, '🚨 Nuevo mínimo histórico'],
      [FlightAlertType.PRICE_DROP_CHEAPEST, '📉 Bajó el precio más barato'],
      [FlightAlertType.PRICE_DROP_RECOMMENDED, '⭐ Bajó la opción recomendada'],
      [FlightAlertType.TARGET_PRICE_REACHED, '🎯 Precio objetivo alcanzado'],
    ];

    return labels
      .filter(([type]) => types.has(type))
      .map(([, label]) => label);
  }
}
