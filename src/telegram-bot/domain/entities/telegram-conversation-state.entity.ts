import { TripType } from '../../../flight-searches/domain/enums/trip-type.enum';

export enum TelegramConversationCommand {
  CREATE_SEARCH = 'CREATE_SEARCH',
}

export enum CreateSearchStep {
  NAME = 'NAME',
  NAME_DUPLICATE = 'NAME_DUPLICATE',
  ORIGIN = 'ORIGIN',
  DESTINATION = 'DESTINATION',
  DEPARTURE_DATE = 'DEPARTURE_DATE',
  RETURN_DATE = 'RETURN_DATE',
  ADULTS = 'ADULTS',
  CUSTOM_ADULTS = 'CUSTOM_ADULTS',
  CHILDREN = 'CHILDREN',
  CUSTOM_CHILDREN = 'CUSTOM_CHILDREN',
  STOPS = 'STOPS',
  PROVIDER = 'PROVIDER',
  TARGET_PRICE_CHOICE = 'TARGET_PRICE_CHOICE',
  TARGET_PRICE = 'TARGET_PRICE',
  CONFIRMATION = 'CONFIRMATION',
}

export type CreateSearchDraft = {
  name?: string;
  suggestedName?: string;
  origin?: string;
  destination?: string;
  pendingAirportField?: 'origin' | 'destination';
  pendingAirportOptions?: string[];
  tripType?: TripType;
  departureDate?: string;
  returnDate?: string;
  adults?: number;
  children?: number;
  allowStops?: boolean;
  providerCode?: string;
  targetPrice?: number;
};

export type TelegramConversationStateProps = {
  id?: string;
  chatId: string;
  currentCommand: TelegramConversationCommand;
  step: CreateSearchStep;
  draft: CreateSearchDraft;
  updatedAt?: Date;
  expiresAt: Date;
};

export class TelegramConversationState {
  constructor(private readonly props: TelegramConversationStateProps) {}

  get id(): string | undefined {
    return this.props.id;
  }

  get chatId(): string {
    return this.props.chatId;
  }

  get currentCommand(): TelegramConversationCommand {
    return this.props.currentCommand;
  }

  get step(): CreateSearchStep {
    return this.props.step;
  }

  get draft(): CreateSearchDraft {
    return this.props.draft;
  }

  get expiresAt(): Date {
    return this.props.expiresAt;
  }

  toPrimitives(): TelegramConversationStateProps {
    return { ...this.props };
  }
}
