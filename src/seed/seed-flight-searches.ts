import { Injectable } from '@nestjs/common';
import { CreateFlightSearchUseCase } from '../flight-searches/application/use-cases/create-flight-search.use-case';
import { CabinClass } from '../flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../flight-searches/domain/enums/currency.enum';
import { TripType } from '../flight-searches/domain/enums/trip-type.enum';
import { FlightProviderCode } from '../flight-providers/domain/enums/flight-provider-code.enum';

@Injectable()
export class SeedFlightSearches {
  constructor(private readonly createFlightSearch: CreateFlightSearchUseCase) {}

  async run(): Promise<void> {
    const enableDemoSeed = readBoolean('ENABLE_DEMO_SEED', false);
    const seedTelegramChatId = readOptionalString('SEED_TELEGRAM_CHAT_ID');
    if (!seedTelegramChatId) {
      throw new Error('SEED_TELEGRAM_CHAT_ID is required to create real seed searches. Run npm run migrate:telegram-chat-id for existing data or set SEED_TELEGRAM_CHAT_ID before npm run seed.');
    }

    if (enableDemoSeed) {
      await this.createFlightSearch.execute({
        name: 'BUE to MDZ example',
        origin: 'AEP',
        destination: 'MDZ',
        departureDate: readDate('DEMO_SEED_DEPARTURE_DATE', '2026-07-15'),
        returnDate: readDate('DEMO_SEED_RETURN_DATE', '2026-07-22'),
        tripType: TripType.ROUND_TRIP,
        cabinClass: CabinClass.ECONOMY,
        currency: Currency.ARS,
        adults: readNumber('DEMO_SEED_ADULTS', 1),
        providerCode: FlightProviderCode.FAKE,
        telegramChatId: seedTelegramChatId,
        targetPrice: readOptionalNumber('DEMO_SEED_TARGET_PRICE') ?? 150_000,
        notifyOnPriceDrop: true,
        notifyAlways: true,
        isActive: true,
      });
    } else {
      await this.createFlightSearch.updateActiveByName('BUE to MDZ example', false);
    }

    const searches = [
      {
        name: 'Viaje Octubre',
        departureDate: readDate('SEED_OCTOBER_DEPARTURE_DATE', '2026-10-10'),
        returnDate: readDate('SEED_OCTOBER_RETURN_DATE', '2026-10-15'),
        targetPrice: readOptionalNumber('SEED_OCTOBER_TARGET_PRICE'),
      },
      {
        name: 'Viaje Diciembre',
        departureDate: readDate('SEED_DECEMBER_DEPARTURE_DATE', '2026-12-20'),
        returnDate: readDate('SEED_DECEMBER_RETURN_DATE', '2026-12-28'),
        targetPrice: readOptionalNumber('SEED_DECEMBER_TARGET_PRICE'),
      },
    ];

    for (const search of searches) {
      await this.createFlightSearch.execute({
        name: search.name,
        origin: readString('SEED_ORIGIN', 'JUJ'),
        destination: readString('SEED_DESTINATION', 'AEP'),
        departureDate: search.departureDate,
        returnDate: search.returnDate,
        tripType: TripType.ROUND_TRIP,
        cabinClass: CabinClass.ECONOMY,
        currency: Currency.ARS,
        adults: readNumber('SEED_ADULTS', 1),
        providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
        telegramChatId: seedTelegramChatId,
        targetPrice: search.targetPrice,
        notifyOnPriceDrop: true,
        notifyAlways: true,
        isActive: true,
      });
    }
  }
}

function readString(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

function readOptionalString(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value ? value : undefined;
}

function readNumber(name: string, fallback: number): number {
  const value = process.env[name];
  return value ? Number(value) : fallback;
}

function readOptionalNumber(name: string): number | undefined {
  const value = process.env[name];
  return value ? Number(value) : undefined;
}

function readBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return fallback;
  }
  return value === 'true';
}

function readDate(name: string, fallback: string): Date {
  const value = process.env[name] ?? fallback;
  return new Date(`${value}T12:00:00.000Z`);
}
