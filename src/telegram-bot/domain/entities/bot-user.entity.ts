import { BotUserStatus } from '../enums/bot-user-status.enum';

export type BotUserProps = {
  id?: string;
  telegramChatId: string;
  firstName: string;
  lastName?: string;
  username?: string;
  status: BotUserStatus;
  isAdmin?: boolean;
  approvedAt?: Date;
  approvedBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
};

export class BotUser {
  constructor(private readonly props: BotUserProps) {}

  get telegramChatId(): string {
    return this.props.telegramChatId;
  }

  get firstName(): string {
    return this.props.firstName;
  }

  get lastName(): string | undefined {
    return this.props.lastName;
  }

  get username(): string | undefined {
    return this.props.username;
  }

  get status(): BotUserStatus {
    return this.props.status;
  }

  get isAdmin(): boolean {
    return this.props.isAdmin === true;
  }

  get approvedAt(): Date | undefined {
    return this.props.approvedAt;
  }

  get approvedBy(): string | undefined {
    return this.props.approvedBy;
  }

  get createdAt(): Date | undefined {
    return this.props.createdAt;
  }

  get updatedAt(): Date | undefined {
    return this.props.updatedAt;
  }

  toPrimitives(): BotUserProps {
    return { ...this.props };
  }
}
