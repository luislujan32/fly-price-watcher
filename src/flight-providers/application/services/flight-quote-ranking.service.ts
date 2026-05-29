import { Injectable } from '@nestjs/common';
import { FlightLegOption, FlightQuote, FlightQuoteSegment, FlightQuoteTag } from '../../domain/models/flight-quote.model';

@Injectable()
export class FlightQuoteRankingService {
  rank(quotes: FlightQuote[]): FlightQuote[] {
    if (!quotes.length) {
      return [];
    }

    const sorted = [...quotes].sort((left, right) => left.totalPrice - right.totalPrice);
    const cheapestPrice = sorted[0]?.totalPrice;
    const tagged = sorted.map((quote) => this.withTimeTags({
      ...quote,
      tags: quote.totalPrice === cheapestPrice ? ['CHEAPEST'] : [],
    }));

    const recommended = this.pickRecommended(tagged);
    return tagged.map((quote) => {
      const tags = new Set<FlightQuoteTag>(quote.tags ?? []);
      if (quote === recommended) {
        tags.add('RECOMMENDED');
        if (this.isUncomfortable(quote)) {
          tags.add('UNCOMFORTABLE_RECOMMENDED');
        }
      }
      const score = this.score(quote);
      const withLegOptions = this.withLegOptionMarkers(quote, recommended);
      return {
        ...withLegOptions,
        tags: [...tags],
        score,
        metadata: withLegOptions.metadata
          ? { ...withLegOptions.metadata, tags: [...tags], score }
          : withLegOptions.metadata,
      };
    });
  }

  private withLegOptionMarkers(quote: FlightQuote, recommended: FlightQuote): FlightQuote {
    const outboundRecommended = this.firstSegment(recommended.outboundSegments ?? recommended.metadata?.outboundSegments ?? []);
    const inboundRecommended = this.firstSegment(recommended.inboundSegments ?? recommended.metadata?.inboundSegments ?? []);
    const outboundOptions = this.markOptions(
      quote.outboundOptions ?? quote.metadata?.outboundOptions,
      outboundRecommended,
    );
    const inboundOptions = this.markOptions(
      quote.inboundOptions ?? quote.metadata?.inboundOptions,
      inboundRecommended,
    );

    return {
      ...quote,
      outboundOptions,
      inboundOptions,
      metadata: quote.metadata
        ? { ...quote.metadata, outboundOptions, inboundOptions }
        : quote.metadata,
    };
  }

  private markOptions(options: FlightLegOption[] | undefined, recommended?: FlightQuoteSegment): FlightLegOption[] | undefined {
    if (!options) {
      return undefined;
    }
    const cheapestPrice = options.length ? Math.min(...options.map((option) => this.legPrice(option))) : undefined;
    return options.map((option) => ({
      ...option,
      isCheapest: cheapestPrice !== undefined && this.legPrice(option) === cheapestPrice,
      isRecommended: this.sameOption(option, recommended),
    }));
  }

  private sameOption(option: FlightLegOption, segment?: FlightQuoteSegment): boolean {
    if (!segment) {
      return false;
    }
    return option.flightNumber === segment.flightNumber
      && option.origin === segment.origin
      && option.destination === segment.destination
      && option.departureDateTime === segment.departureDateTime;
  }

  private firstSegment(segments: FlightQuoteSegment[]): FlightQuoteSegment | undefined {
    return segments[0];
  }

  private withTimeTags(quote: FlightQuote): FlightQuote {
    const tags = new Set<FlightQuoteTag>(quote.tags ?? []);
    const departure = quote.outboundDepartureTime ?? quote.metadata?.outboundDepartureTime;
    const hour = this.hour(departure);

    if (hour !== undefined) {
      if (hour < 7) {
        tags.add('EARLY_MORNING');
      } else if (hour >= 22) {
        tags.add('LATE_NIGHT');
      } else if (hour >= 8 && hour < 20) {
        tags.add('GOOD_TIME');
      }
    }

    return { ...quote, tags: [...tags] };
  }

  private pickRecommended(quotes: FlightQuote[]): FlightQuote {
    const comfortable = quotes.filter((quote) => !this.isUncomfortable(quote));
    return (comfortable.length ? comfortable : quotes)
      .sort((left, right) => left.totalPrice - right.totalPrice)[0] as FlightQuote;
  }

  private isUncomfortable(quote: FlightQuote): boolean {
    return Boolean(quote.tags?.includes('EARLY_MORNING') || quote.tags?.includes('LATE_NIGHT'));
  }

  private score(quote: FlightQuote): number {
    const penalty = this.isUncomfortable(quote) ? 10_000 : 0;
    return quote.totalPrice + penalty;
  }

  private hour(value?: string): number | undefined {
    if (!value) {
      return undefined;
    }
    const match = /T(\d{2}):/.exec(value);
    return match ? Number(match[1]) : undefined;
  }

  private legPrice(option: FlightLegOption): number {
    return option.cheapestPrice ?? option.price ?? Number.POSITIVE_INFINITY;
  }
}
