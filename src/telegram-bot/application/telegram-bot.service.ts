import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CreateFlightSearchUseCase } from '../../flight-searches/application/use-cases/create-flight-search.use-case';
import { ManageFlightSearchesUseCase } from '../../flight-searches/application/use-cases/manage-flight-searches.use-case';
import { FlightSearch } from '../../flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../flight-searches/domain/enums/currency.enum';
import { TripType } from '../../flight-searches/domain/enums/trip-type.enum';
import { FlightProviderCode } from '../../flight-providers/domain/enums/flight-provider-code.enum';
import { GetLatestWatchRunUseCase } from '../../flight-watch-runs/application/use-cases/get-latest-watch-run.use-case';
import { FlightWatchRun } from '../../flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightPriceWatchService } from '../../scheduler/application/services/flight-price-watch.service';
import { Airport, AirportResolverService } from '../../shared/airports/airport-resolver.service';
import { BotUser } from '../domain/entities/bot-user.entity';
import { BotUserStatus } from '../domain/enums/bot-user-status.enum';
import {
  CreateSearchDraft,
  CreateSearchStep,
  TelegramConversationCommand,
  TelegramConversationState,
} from '../domain/entities/telegram-conversation-state.entity';
import {
  TELEGRAM_CONVERSATION_STATE_REPOSITORY,
  TelegramConversationStateRepository,
} from '../domain/repositories/telegram-conversation-state.repository';
import { TelegramBotClient, TelegramBotUpdate, TelegramBotUser, TelegramInlineKeyboardMarkup } from '../infrastructure/telegram-bot.client';
import {
  formatDate,
  parseAdultCount,
  parseAirportCode,
  parseDateInput,
  parseTargetPrice,
} from './validators/create-search-wizard.validators';
import { TelegramAccessControlService } from './telegram-access-control.service';

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private offset = 0;
  private timer?: NodeJS.Timeout;
  private pollingInProgress = false;
  private readonly processedUpdateIds = new Set<number>();

  constructor(
    private readonly config: ConfigService,
    private readonly client: TelegramBotClient,
    private readonly createFlightSearch: CreateFlightSearchUseCase,
    private readonly manageSearches: ManageFlightSearchesUseCase,
    private readonly latestWatchRun: GetLatestWatchRunUseCase,
    private readonly flightPriceWatch: FlightPriceWatchService,
    private readonly airports: AirportResolverService,
    private readonly accessControl: TelegramAccessControlService,
    @Inject(TELEGRAM_CONVERSATION_STATE_REPOSITORY)
    private readonly conversations: TelegramConversationStateRepository,
  ) {}

  startPolling(): boolean {
    if (!this.pollingEnabled()) {
      this.logger.warn('Telegram bot polling is disabled. Set ENABLE_TELEGRAM_BOT=true to enable it.');
      return false;
    }
    this.logger.log(
      `Telegram bot access control configured: mode=${this.accessControl.accessMode()}, admins=${this.accessControl.adminChatIds().length}, allowedChats=${this.accessControl.allowedChatIds().length}.`,
    );

    const intervalMs = this.pollingIntervalMs();
    this.logger.log(`Telegram bot polling started. intervalMs=${intervalMs}.`);
    void this.pollOnce();
    this.timer = setInterval(() => {
      void this.pollOnce();
    }, intervalMs);
    return true;
  }

  stopPolling(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  async pollOnce(): Promise<void> {
    if (this.pollingInProgress) {
      return;
    }
    this.pollingInProgress = true;
    try {
      let updates: TelegramBotUpdate[];
      try {
        updates = await this.client.getUpdates(this.offset || undefined);
      } catch (error) {
        this.logger.warn(`Telegram getUpdates failed: ${this.errorMessage(error)}. Polling will continue.`);
        return;
      }
      for (const update of updates) {
        try {
          await this.processUpdate(update);
        } catch (error) {
          this.logger.error(`Telegram update failed: ${this.errorMessage(error)}. Polling will continue.`);
        } finally {
          this.offset = Math.max(this.offset, update.update_id + 1);
        }
      }
    } finally {
      this.pollingInProgress = false;
    }
  }

  async processUpdate(update: TelegramBotUpdate): Promise<void> {
    if (this.processedUpdateIds.has(update.update_id)) {
      return;
    }
    this.processedUpdateIds.add(update.update_id);
    if (this.processedUpdateIds.size > 200) {
      this.processedUpdateIds.clear();
    }

    try {
      await this.processUpdateContent(update);
    } catch (error) {
      await this.handleUpdateError(update, error);
    }
  }

  private async processUpdateContent(update: TelegramBotUpdate): Promise<void> {
    if (update.callback_query) {
      await this.processCallbackQuery(update.callback_query);
      return;
    }

    const message = update.message;
    const text = message?.text?.trim();
    const chatId = message?.chat.id !== undefined ? String(message.chat.id) : undefined;
    if (!chatId || !text) {
      return;
    }

    this.debug(`Processing update: updateId=${update.update_id}, chatId=${chatId}.`);

    if (text === '/mi_chat_id') {
      await this.client.sendMessage(chatId, `Tu chatId es: ${chatId}`);
      return;
    }

    if (text === '/start') {
      await this.conversations.deleteByChatId(chatId);
      await this.handleStart(chatId, message?.from);
      return;
    }

    if (await this.handleAdminCommand(chatId, text)) {
      return;
    }

    if (!await this.accessControl.isAllowed(chatId)) {
      await this.client.sendMessage(chatId, await this.accessDeniedMessage(chatId));
      return;
    }

    if (text === '/help' || text === '/ayuda') {
      await this.client.sendMessage(chatId, this.helpMessage(chatId));
      return;
    }

    if (text === '/estado') {
      await this.sendStatus(chatId);
      return;
    }

    if (text === '/crear') {
      await this.startCreateSearch(chatId);
      return;
    }

    if (text === '/listar') {
      await this.sendSearchList(chatId);
      return;
    }

    if (text === '/resumen') {
      await this.client.sendMessage(chatId, 'Elegí una alerta de la lista y tocá 🔄 Resumen.');
      await this.sendSearchList(chatId);
      return;
    }

    if (text === '/preferencias') {
      await this.client.sendMessage(chatId, '⚙️ Preferencias todavía no está disponible. Por ahora podés crear, pausar, activar o borrar alertas.');
      return;
    }

    if (text === '/ver' || text.startsWith('/ver ')) {
      await this.handleViewCommand(chatId, text);
      return;
    }

    if (text.startsWith('/pausar')) {
      await this.handleStateCommand(chatId, text, 'pause');
      return;
    }

    if (text.startsWith('/activar')) {
      await this.handleStateCommand(chatId, text, 'activate');
      return;
    }

    if (text.startsWith('/borrar')) {
      await this.handleStateCommand(chatId, text, 'delete');
      return;
    }

    if (text === '/cancelar') {
      await this.conversations.deleteByChatId(chatId);
      await this.client.sendMessage(chatId, 'Creación cancelada.');
      return;
    }

    if (text.startsWith('/')) {
      await this.client.sendMessage(chatId, `Comando no reconocido.\n\n${this.helpMessage(chatId)}`);
      return;
    }

    const state = await this.conversations.findByChatId(chatId);
    if (state?.currentCommand === TelegramConversationCommand.CREATE_SEARCH) {
      if (this.isExpired(state)) {
        await this.conversations.deleteByChatId(chatId);
        await this.client.sendMessage(chatId, 'El flujo venció. Iniciá de nuevo con /crear.');
        return;
      }
      await this.processCreateSearchStep(chatId, text, state);
      return;
    }

    await this.client.sendMessage(chatId, `Comando no reconocido.\n\n${this.helpMessage(chatId)}`);
  }

  private async handleUpdateError(update: TelegramBotUpdate, error: unknown): Promise<void> {
    this.logger.error(this.errorMessage(error));
    try {
      const chatId = this.chatIdFromUpdate(update);
      if (!chatId || !await this.accessControl.isAllowed(chatId)) {
        return;
      }

      if (this.isDuplicateKeyError(error)) {
        await this.respondDuplicateName(chatId);
        return;
      }
      const maxSearches = this.maxSearchesError(error);
      if (maxSearches !== null) {
        await this.safeSendMessage(chatId, `Llegaste al límite de ${maxSearches} alertas activas.`, 'Failed to notify user about update error');
        return;
      }

      await this.safeSendMessage(chatId, 'Ocurrió un error procesando la operación. Probá de nuevo en unos minutos.', 'Failed to notify user about update error');
    } catch (notifyError) {
      this.logger.warn(`Failed to notify user about update error: ${this.errorMessage(notifyError)}`);
    }
  }

  private async safeSendMessage(chatId: string, text: string, warning: string, options?: { replyMarkup?: TelegramInlineKeyboardMarkup }): Promise<boolean> {
    try {
      if (options) {
        await this.client.sendMessage(chatId, text, options);
      } else {
        await this.client.sendMessage(chatId, text);
      }
      return true;
    } catch (error) {
      this.logger.warn(`${warning}: ${this.errorMessage(error)}`);
      return false;
    }
  }

  private async safeAnswerCallbackQuery(callbackId: string, text?: string): Promise<boolean> {
    try {
      if (text !== undefined) {
        await this.client.answerCallbackQuery(callbackId, text);
      } else {
        await this.client.answerCallbackQuery(callbackId);
      }
      return true;
    } catch (error) {
      this.logger.warn(`Failed to answer Telegram callback: ${this.errorMessage(error)}`);
      return false;
    }
  }

  private chatIdFromUpdate(update: TelegramBotUpdate): string | undefined {
    const messageChatId = update.message?.chat.id;
    if (messageChatId !== undefined) {
      return String(messageChatId);
    }
    const callbackChatId = update.callback_query?.message?.chat.id;
    return callbackChatId !== undefined ? String(callbackChatId) : undefined;
  }

  private isDuplicateKeyError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: unknown }).code === 11000;
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (this.isDuplicateKeyError(error)) {
      return 'Mongo duplicate key error.';
    }
    return String(error);
  }

  private maxSearchesError(error: unknown): number | null {
    if (!(error instanceof Error)) {
      return null;
    }
    const match = /^MAX_SEARCHES_PER_USER:(\d+)$/.exec(error.message);
    return match ? Number(match[1]) : null;
  }

  private async respondDuplicateName(chatId: string): Promise<void> {
    const state = await this.conversations.findByChatId(chatId);
    const currentName = state?.draft.name ?? 'esa alerta';
    const suggestedName = await this.suggestAvailableName(chatId, currentName);
    await this.saveCreateSearchState(chatId, CreateSearchStep.NAME_DUPLICATE, {
      ...(state?.draft ?? {}),
      suggestedName,
    });
    await this.client.sendMessage(chatId, [
      'Ya existe una alerta con ese nombre. Elegí otro nombre.',
      `Podés usar "${suggestedName}".`,
    ].join('\n'), {
      replyMarkup: {
        inline_keyboard: [
          [{ text: `✅ Usar "${suggestedName}"`, callback_data: 'create:use_suggested_name' }],
          [{ text: '✏️ Escribir otro nombre', callback_data: 'create:write_name' }],
          [{ text: '❌ Cancelar', callback_data: 'create:cancel' }],
        ],
      },
    });
  }

  private async processCallbackQuery(callback: NonNullable<TelegramBotUpdate['callback_query']>): Promise<void> {
    const chatId = callback.message?.chat.id !== undefined ? String(callback.message.chat.id) : undefined;
    const data = callback.data;
    if (!chatId || !data) {
      await this.safeAnswerCallbackQuery(callback.id);
      return;
    }

    this.debug(`Processing callback: chatId=${chatId}, data=${data}.`);

    const actorChatId = callback.from?.id !== undefined ? String(callback.from.id) : chatId;
    if (await this.handleAdminCallback(actorChatId, callback.id, data)) {
      return;
    }

    if (!await this.accessControl.isAllowed(chatId)) {
      await this.safeAnswerCallbackQuery(callback.id, await this.accessDeniedMessage(chatId));
      return;
    }

    await this.safeAnswerCallbackQuery(callback.id);

    if (data === 'menu:create') {
      await this.startCreateSearch(chatId);
      return;
    }
    if (data === 'menu:list') {
      await this.sendSearchList(chatId);
      return;
    }
    if (data === 'menu:summary') {
      await this.client.sendMessage(chatId, 'Elegí una alerta de la lista y tocá 🔄 Resumen.');
      await this.sendSearchList(chatId);
      return;
    }
    if (data === 'menu:preferences') {
      await this.client.sendMessage(chatId, '⚙️ Preferencias todavía no está disponible. Por ahora podés crear, pausar, activar o borrar alertas.');
      return;
    }
    if (data === 'menu:help') {
      await this.client.sendMessage(chatId, this.helpMessage(chatId));
      return;
    }

    if (data.startsWith('select_airport:')) {
      await this.handleSelectAirportCallback(chatId, data);
      return;
    }

    if (data.startsWith('create:')) {
      await this.handleCreateCallback(chatId, data);
      return;
    }

    await this.handleSearchCallback(chatId, data);
  }

  private async handleSearchCallback(chatId: string, data: string): Promise<void> {
    const match = /^search:(view|pause|activate|summary|delete|confirm_delete|cancel_delete):(\d+)$/.exec(data);
    if (!match) {
      await this.client.sendMessage(chatId, 'No pude interpretar esa acción. Usá /listar para ver tus alertas.');
      return;
    }

    const [, action, rawIndex] = match;
    const index = Number(rawIndex);
    if (action === 'view') {
      await this.sendSearchDetailByIndex(chatId, index);
      return;
    }
    if (action === 'summary') {
      await this.sendLatestRunSummaryByIndex(chatId, index);
      return;
    }
    if (action === 'pause') {
      await this.updateSearchStateByIndex(chatId, index, 'pause');
      return;
    }
    if (action === 'activate') {
      await this.updateSearchStateByIndex(chatId, index, 'activate');
      return;
    }
    if (action === 'delete') {
      await this.confirmDeleteSearchByIndex(chatId, index);
      return;
    }
    if (action === 'confirm_delete') {
      await this.updateSearchStateByIndex(chatId, index, 'delete');
      return;
    }
    await this.client.sendMessage(chatId, 'Operación cancelada.');
    await this.sendSearchList(chatId);
  }

  private async handleSelectAirportCallback(chatId: string, data: string): Promise<void> {
    const match = /^select_airport:(origin|destination):([A-Z]{3})$/.exec(data);
    if (!match) {
      await this.client.sendMessage(chatId, 'No pude interpretar esa opción. Probá de nuevo.');
      return;
    }
    const field = match[1] as 'origin' | 'destination';
    const code = match[2] as string;
    const state = await this.conversations.findByChatId(chatId);
    const expectedStep = field === 'origin' ? CreateSearchStep.ORIGIN : CreateSearchStep.DESTINATION;
    if (!state || state.currentCommand !== TelegramConversationCommand.CREATE_SEARCH || state.step !== expectedStep) {
      await this.client.sendMessage(chatId, 'No hay una selección de aeropuerto en curso. Iniciá de nuevo con /crear.');
      return;
    }
    if (this.isExpired(state)) {
      await this.conversations.deleteByChatId(chatId);
      await this.client.sendMessage(chatId, 'El flujo venció. Iniciá de nuevo con /crear.');
      return;
    }

    const airport = this.airports.findByCode(code);
    if (!airport) {
      await this.client.sendMessage(chatId, 'No encontré esa opción. Probá de nuevo.');
      return;
    }
    await this.selectAirport(chatId, state.draft, field, airport);
  }

  private async handleCreateCallback(chatId: string, data: string): Promise<void> {
    const state = await this.conversations.findByChatId(chatId);
    if (!state?.currentCommand || state.currentCommand !== TelegramConversationCommand.CREATE_SEARCH) {
      await this.client.sendMessage(chatId, 'No hay una creación en curso. Iniciá de nuevo con /crear.');
      return;
    }
    if (this.isExpired(state)) {
      await this.conversations.deleteByChatId(chatId);
      await this.client.sendMessage(chatId, 'El flujo venció. Iniciá de nuevo con /crear.');
      return;
    }

    const draft = { ...state.draft };
    if (data === 'create:cancel') {
      await this.conversations.deleteByChatId(chatId);
      await this.client.sendMessage(chatId, 'Creación cancelada.');
      return;
    }
    if (data === 'create:write_name') {
      await this.saveCreateSearchState(chatId, CreateSearchStep.NAME, {});
      await this.client.sendMessage(chatId, 'Escribí otro nombre para la alerta.');
      return;
    }
    if (data === 'create:use_suggested_name') {
      if (!draft.suggestedName) {
        await this.client.sendMessage(chatId, 'No encontré un nombre sugerido. Escribí otro nombre.');
        return;
      }
      await this.saveCreateSearchState(chatId, CreateSearchStep.ORIGIN, { name: draft.suggestedName });
      await this.client.sendMessage(chatId, `✅ Nombre seleccionado:\n${draft.suggestedName}`);
      await this.askAirport(chatId, 'Origen', 'origin');
      return;
    }
    if (data === 'create:adults:1' || data === 'create:adults:2') {
      const adults = data.endsWith(':2') ? 2 : 1;
      await this.saveCreateSearchState(chatId, CreateSearchStep.TARGET_PRICE_CHOICE, { ...draft, adults });
      await this.askTargetPriceChoice(chatId);
      return;
    }
    if (data === 'create:adults:other') {
      await this.saveCreateSearchState(chatId, CreateSearchStep.CUSTOM_ADULTS, draft);
      await this.client.sendMessage(chatId, 'Cuántos adultos? Escribí un número entre 1 y 9.');
      return;
    }
    if (data === 'create:target:omit') {
      const nextDraft = { ...draft };
      delete nextDraft.targetPrice;
      await this.saveCreateSearchState(chatId, CreateSearchStep.CONFIRMATION, nextDraft);
      await this.sendCreateConfirmation(chatId, nextDraft);
      return;
    }
    if (data === 'create:target:enter') {
      await this.saveCreateSearchState(chatId, CreateSearchStep.TARGET_PRICE, draft);
      await this.client.sendMessage(chatId, 'Precio objetivo? Escribí un número positivo.\nEjemplo: 280000');
      return;
    }
    if (data === 'create:confirm') {
      const created = await this.createSearchFromDraft(chatId, draft);
      await this.conversations.deleteByChatId(chatId);
      await this.afterCreateSearch(chatId, created);
      return;
    }
    if (data === 'create:edit') {
      await this.saveCreateSearchState(chatId, CreateSearchStep.NAME, {});
      await this.client.sendMessage(chatId, 'Empecemos de nuevo. Escribí el nombre de la alerta.');
      return;
    }
    await this.client.sendMessage(chatId, 'No pude interpretar esa acción. Probá de nuevo con /crear.');
  }

  private startMessage(): string {
    return [
      '✈️ Hola, soy Flight Price Watcher.',
      '',
      'Te ayudo a seguir precios de vuelos y avisarte cuando aparezcan oportunidades.',
      'Elegí una opción para empezar.',
    ].join('\n');
  }

  private helpMessage(chatId?: string): string {
    const lines = [
      '❓ Ayuda',
      '',
      'Con este bot podés crear alertas de vuelos y recibir avisos cuando haya precios interesantes.',
      '',
      'Acciones principales:',
      '➕ Crear alerta',
      '📋 Ver mis alertas',
      '🔎 Ver detalle',
      '⏸ Pausar alerta',
      '▶️ Activar alerta',
      '🗑 Borrar alerta',
      '',
      'Tip:',
      'Usá /listar para ver tus alertas. Desde ahí vas a tener botones para ver, pausar, activar o borrar.',
      '',
      'Comandos útiles:',
      '/crear - crear una alerta de vuelo',
      '/listar - ver tus alertas',
      '/estado - ver tu estado',
      '/cancelar - cancelar la operación actual',
      '/ayuda - ver esta ayuda',
    ];
    if (chatId && this.accessControl.isAdmin(chatId)) {
      lines.push(
        '',
        'Admin:',
        '/usuarios - ver usuarios',
        '/pendientes - ver solicitudes pendientes',
        '/sync_admins - sincronizar admins configurados',
        '/mi_chat_id - ver tu chatId',
      );
    }
    return lines.join('\n');
  }

  private async handleStart(chatId: string, from?: TelegramBotUser): Promise<void> {
    const result = await this.accessControl.handleStart(this.profileFromTelegram(chatId, from));
    if (result.type === 'allowed') {
      await this.client.sendMessage(chatId, this.startMessage(), { replyMarkup: this.startKeyboard() });
      return;
    }
    if (result.type === 'pending_created') {
      this.logger.log(`Access request created for chatId=${result.user.telegramChatId}.`);
      const notifiedAdmins = await this.notifyAdminsAccessRequest(result.user);
      if (notifiedAdmins > 0) {
        await this.client.sendMessage(chatId, 'Este bot está en beta cerrada. Ya envié tu solicitud al administrador.');
        return;
      }
      await this.client.sendMessage(chatId, 'Tu solicitud fue registrada, pero no pude notificar al administrador. Avisale manualmente.');
      return;
    }
    if (result.type === 'pending') {
      await this.client.sendMessage(chatId, 'Tu solicitud está pendiente de aprobación.');
      return;
    }
    await this.client.sendMessage(chatId, 'No tenés acceso a este bot.');
  }

  private profileFromTelegram(chatId: string, from?: TelegramBotUser) {
    return {
      telegramChatId: chatId,
      firstName: from?.first_name?.trim() || 'Telegram user',
      lastName: from?.last_name,
      username: from?.username,
    };
  }

  private async notifyAdminsAccessRequest(user: BotUser): Promise<number> {
    const admins = this.accessControl.adminChatIds();
    if (!admins.length) {
      this.logger.error('No TELEGRAM_ADMIN_CHAT_IDS configured; cannot notify access request.');
      return 0;
    }

    this.logger.log(`Notifying ${admins.length} admins...`);
    let successes = 0;
    for (const adminChatId of admins) {
      try {
        await this.client.sendMessage(adminChatId, [
          '👤 Nueva solicitud de acceso',
          '',
          `Nombre: ${this.botUserName(user)}`,
          user.username ? `Username: @${user.username}` : undefined,
          `Chat ID: ${user.telegramChatId}`,
        ].filter((line): line is string => line !== undefined).join('\n'), {
          replyMarkup: {
            inline_keyboard: [
              [{ text: '✅ Aprobar', callback_data: `approve_user:${user.telegramChatId}` }],
              [{ text: '❌ Rechazar', callback_data: `reject_user:${user.telegramChatId}` }],
              [{ text: '🚫 Bloquear', callback_data: `block_user:${user.telegramChatId}` }],
            ],
          },
        });
        successes += 1;
        this.logger.log(`Admin notification sent to chatId=${adminChatId}.`);
      } catch (error) {
        this.logger.error(`Admin notification failed for chatId=${adminChatId}: ${this.errorMessage(error)}`);
      }
    }
    return successes;
  }

  private async handleAdminCommand(chatId: string, text: string): Promise<boolean> {
    if (!this.accessControl.isAdmin(chatId)) {
      return false;
    }
    if (text === '/pendientes') {
      await this.sendPendingUsers(chatId);
      return true;
    }
    if (text === '/usuarios') {
      await this.sendUsersByStatus(chatId);
      return true;
    }
    if (text === '/sync_admins') {
      await this.syncConfiguredAdmins(chatId);
      return true;
    }
    if (text.startsWith('/aprobar ') || text.startsWith('/rechazar ') || text.startsWith('/bloquear ')) {
      const [command, targetChatId] = text.trim().split(/\s+/);
      if (!targetChatId) {
        await this.client.sendMessage(chatId, `Uso: ${command} chatId`);
        return true;
      }
      const action = command === '/aprobar' ? 'approve' : command === '/rechazar' ? 'reject' : 'block';
      await this.applyAdminUserAction(chatId, targetChatId, action);
      return true;
    }
    return false;
  }

  private async handleAdminCallback(actorChatId: string, callbackId: string, data: string): Promise<boolean> {
    const match = /^(approve_user|reject_user|block_user):(.+)$/.exec(data);
    if (!match) {
      return false;
    }
    if (!this.accessControl.isAdmin(actorChatId)) {
      await this.safeAnswerCallbackQuery(callbackId, 'Sólo admins pueden hacer esta acción.');
      return true;
    }
    await this.safeAnswerCallbackQuery(callbackId);
    const [, action, targetChatId] = match;
    await this.applyAdminUserAction(actorChatId, targetChatId, action === 'approve_user' ? 'approve' : action === 'reject_user' ? 'reject' : 'block');
    return true;
  }

  private async applyAdminUserAction(adminChatId: string, targetChatId: string, action: 'approve' | 'reject' | 'block'): Promise<void> {
    const user = action === 'approve'
      ? await this.accessControl.approve(targetChatId, adminChatId)
      : action === 'reject'
        ? await this.accessControl.reject(targetChatId)
        : await this.accessControl.block(targetChatId);
    if (!user) {
      await this.client.sendMessage(adminChatId, `No encontré solicitud para chatId=${targetChatId}.`);
      return;
    }

    if (action === 'approve') {
      await this.client.sendMessage(adminChatId, `✅ Usuario aprobado: ${this.botUserName(user)}.`);
      await this.client.sendMessage(targetChatId, '✅ Tu acceso fue aprobado. Ya podés usar el bot.', { replyMarkup: this.startKeyboard() });
      return;
    }
    if (action === 'reject') {
      await this.client.sendMessage(adminChatId, `❌ Usuario rechazado: ${this.botUserName(user)}.`);
      await this.client.sendMessage(targetChatId, 'No tenés acceso a este bot.');
      return;
    }
    await this.client.sendMessage(adminChatId, `🚫 Usuario bloqueado: ${this.botUserName(user)}.`);
    await this.client.sendMessage(targetChatId, 'No tenés acceso a este bot.');
  }

  private async sendPendingUsers(chatId: string): Promise<void> {
    const users = await this.accessControl.pendingUsers();
    if (!users.length) {
      await this.client.sendMessage(chatId, 'No hay solicitudes pendientes.');
      return;
    }
    await this.client.sendMessage(chatId, [
      'Solicitudes pendientes:',
      '',
      ...users.map((user, index) => `${index + 1}. ${this.botUserName(user)} ${user.username ? `(@${user.username}) ` : ''}- ${user.telegramChatId}`),
      '',
      'Usá /aprobar chatId, /rechazar chatId o /bloquear chatId.',
    ].join('\n'));
  }

  private async sendUsersByStatus(chatId: string): Promise<void> {
    const usersByStatus = await this.accessControl.usersByStatus();
    const lines = ['Usuarios del bot'];
    for (const status of [BotUserStatus.PENDING, BotUserStatus.APPROVED, BotUserStatus.REJECTED, BotUserStatus.BLOCKED]) {
      const users = usersByStatus[status] ?? [];
      lines.push('', `${status}:`);
      if (!users.length) {
        lines.push('- ninguno');
        continue;
      }
      lines.push(...users.map((user) => `- ${this.botUserLabel(user)}`));
    }
    await this.client.sendMessage(chatId, lines.join('\n'));
  }

  private async syncConfiguredAdmins(chatId: string): Promise<void> {
    const admins = await this.accessControl.syncConfiguredAdmins();
    if (!admins.length) {
      await this.client.sendMessage(chatId, 'No hay admins configurados en TELEGRAM_ADMIN_CHAT_IDS.');
      return;
    }
    await this.client.sendMessage(chatId, [
      `Admins sincronizados: ${admins.length}`,
      '',
      ...admins.map((user) => `- ${this.botUserLabel(user)}`),
    ].join('\n'));
  }

  private botUserName(user: BotUser): string {
    return [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Telegram user';
  }

  private botUserLabel(user: BotUser): string {
    return [
      this.botUserName(user),
      user.username ? `@${user.username}` : undefined,
      user.telegramChatId,
      user.createdAt ? `desde ${this.displayDate(user.createdAt)}` : undefined,
      user.isAdmin ? 'admin' : undefined,
    ].filter(Boolean).join(' - ');
  }

  private async sendStatus(chatId: string): Promise<void> {
    const searches = await this.manageSearches.listManageable(chatId);
    const activeSearches = searches.filter((search) => search.isActive).length;
    await this.client.sendMessage(chatId, [
      'Estado del bot',
      '',
      `Modo: ${this.accessControl.accessMode()}`,
      `Alertas activas: ${activeSearches}`,
      `Límite de alertas: ${this.maxSearchesPerUser()}`,
      `Scheduler: ${this.config.get<boolean>('enableScheduler') === true ? 'activo' : 'inactivo'}`,
      `Consulta al crear: ${this.runWatchAfterCreate() ? 'activa' : 'inactiva'}`,
    ].join('\n'));
  }

  private async sendSearchList(chatId: string): Promise<void> {
    const searches = await this.manageSearches.listManageable(chatId);
    await this.client.sendMessage(chatId, this.formatSearches(searches), {
      replyMarkup: searches.length ? this.searchListKeyboard(searches) : this.emptyListKeyboard(),
    });
  }

  private formatSearches(searches: FlightSearch[]): string {
    if (!searches.length) {
      return '📋 Mis alertas\n\nNo tenés alertas todavía. Podés crear la primera con /crear.';
    }

    return [
      '📋 Mis alertas',
      '',
      ...searches.map((search, index) => this.searchListItem(search, index + 1)),
    ].join('\n\n');
  }

  private searchListItem(search: FlightSearch, index: number): string {
    return [
      `${index}. ✈️ ${search.name}`,
      this.route(search),
      `${this.displayDate(search.departureDate)}${search.returnDate ? ` al ${this.displayDate(search.returnDate)}` : ''}`,
      `Estado: ${search.isActive ? 'activa' : 'pausada'}`,
      `Objetivo: ${search.targetPrice ? `$${Math.round(search.targetPrice).toLocaleString('de-DE')} ${search.currency}` : 'sin definir'}`,
    ].join('\n');
  }

  private startKeyboard(): TelegramInlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '➕ Crear alerta', callback_data: 'menu:create' }],
        [{ text: '📋 Mis alertas', callback_data: 'menu:list' }],
        [{ text: '🔄 Resumen ahora', callback_data: 'menu:summary' }],
        [{ text: '⚙️ Preferencias', callback_data: 'menu:preferences' }],
        [{ text: '❓ Ayuda', callback_data: 'menu:help' }],
      ],
    };
  }

  private emptyListKeyboard(): TelegramInlineKeyboardMarkup {
    return {
      inline_keyboard: [
        [{ text: '➕ Crear alerta', callback_data: 'menu:create' }],
        [{ text: '❓ Ayuda', callback_data: 'menu:help' }],
      ],
    };
  }

  private searchListKeyboard(searches: FlightSearch[]): TelegramInlineKeyboardMarkup {
    return {
      inline_keyboard: searches.flatMap((search, searchIndex) => {
        const index = searchIndex + 1;
        const stateButton = search.isActive
          ? { text: `⏸ Pausar ${index}`, callback_data: `search:pause:${index}` }
          : { text: `▶️ Activar ${index}`, callback_data: `search:activate:${index}` };
        return [
          [
            { text: `🔎 Ver ${index}`, callback_data: `search:view:${index}` },
            stateButton,
          ],
          [
            { text: `🔄 Resumen ${index}`, callback_data: `search:summary:${index}` },
            { text: `🗑 Borrar ${index}`, callback_data: `search:delete:${index}` },
          ],
        ];
      }),
    };
  }

  private displayDate(value: Date): string {
    const [year, month, day] = value.toISOString().slice(0, 10).split('-');
    return `${day}/${month}/${year}`;
  }

  private route(search: FlightSearch): string {
    return `${search.origin} → ${search.destination}${search.returnDate ? ` → ${search.origin}` : ''}`;
  }

  private async accessDeniedMessage(chatId: string): Promise<string> {
    const user = await this.accessControl.userByChatId(chatId);
    if (user?.status === BotUserStatus.PENDING) {
      return 'Tu solicitud está pendiente de aprobación.';
    }
    if (user?.status === BotUserStatus.REJECTED || user?.status === BotUserStatus.BLOCKED) {
      return 'No tenés acceso a este bot.';
    }
    return 'Este bot está en beta cerrada. Pedile acceso al administrador.';
  }

  private pollingEnabled(): boolean {
    return this.config.get<boolean>('enableTelegramBot') === true;
  }

  private pollingIntervalMs(): number {
    const value = this.config.get<number>('telegramPollingIntervalMs') ?? 3000;
    return Number.isFinite(value) && value > 0 ? value : 3000;
  }

  private async handleViewCommand(chatId: string, text: string): Promise<void> {
    const index = this.parseCommandIndex(text);
    if (index === null) {
      await this.client.sendMessage(chatId, 'Usá /ver 1 para ver el detalle de una búsqueda.');
      return;
    }

    await this.sendSearchDetailByIndex(chatId, index);
  }

  private async sendSearchDetailByIndex(chatId: string, index: number): Promise<void> {
    const search = await this.manageSearches.getByDisplayIndex(index, chatId);
    if (!search?.id) {
      await this.client.sendMessage(chatId, 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
      return;
    }

    await this.client.sendMessage(chatId, this.searchDetailMessage(search, await this.latestWatchRun.execute(search.id)));
  }

  private async handleStateCommand(
    chatId: string,
    text: string,
    action: 'pause' | 'activate' | 'delete',
  ): Promise<void> {
    const index = this.parseCommandIndex(text);
    if (index === null) {
      const command = action === 'pause' ? '/pausar' : action === 'activate' ? '/activar' : '/borrar';
      await this.client.sendMessage(chatId, `Usá ${command} 1 para administrar una búsqueda.`);
      return;
    }

    await this.updateSearchStateByIndex(chatId, index, action);
  }

  private async updateSearchStateByIndex(
    chatId: string,
    index: number,
    action: 'pause' | 'activate' | 'delete',
  ): Promise<void> {
    const search = action === 'pause'
      ? await this.manageSearches.pauseByDisplayIndex(index, chatId)
      : action === 'activate'
        ? await this.manageSearches.activateByDisplayIndex(index, chatId)
        : await this.manageSearches.softDeleteByDisplayIndex(index, chatId);

    if (!search) {
      await this.client.sendMessage(chatId, 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
      return;
    }

    if (action === 'pause') {
      await this.client.sendMessage(chatId, `⏸️ Pausé la búsqueda ${search.name}.`);
      return;
    }
    if (action === 'activate') {
      await this.client.sendMessage(chatId, `▶️ Activé la búsqueda ${search.name}.`);
      return;
    }
    await this.client.sendMessage(chatId, `🗑️ Alerta borrada: ${search.name}.`);
  }

  private async confirmDeleteSearchByIndex(chatId: string, index: number): Promise<void> {
    const search = await this.manageSearches.getByDisplayIndex(index, chatId);
    if (!search) {
      await this.client.sendMessage(chatId, 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
      return;
    }

    await this.client.sendMessage(chatId, `¿Seguro que querés borrar "${search.name}"?`, {
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ Sí, borrar', callback_data: `search:confirm_delete:${index}` }],
          [{ text: '❌ Cancelar', callback_data: `search:cancel_delete:${index}` }],
        ],
      },
    });
  }

  private async sendLatestRunSummaryByIndex(chatId: string, index: number): Promise<void> {
    const search = await this.manageSearches.getByDisplayIndex(index, chatId);
    if (!search?.id) {
      await this.client.sendMessage(chatId, 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
      return;
    }

    const latestRun = await this.latestWatchRun.execute(search.id);
    await this.client.sendMessage(chatId, [
      `🔄 Resumen — ${search.name}`,
      '',
      latestRun ? this.latestRunMessage(latestRun) : 'Todavía no hay corridas guardadas para esta alerta.',
    ].join('\n'));
  }

  private parseCommandIndex(text: string): number | null {
    const [, rawIndex] = text.trim().split(/\s+/);
    const index = Number(rawIndex);
    return Number.isInteger(index) && index > 0 ? index : null;
  }

  private async startCreateSearch(chatId: string): Promise<void> {
    await this.saveCreateSearchState(chatId, CreateSearchStep.NAME, {});
    await this.client.sendMessage(chatId, [
      '✈️ Vamos a crear una alerta.',
      '',
      'Primero, poné un nombre corto para identificarla.',
      'Ejemplo: Viaje Octubre',
    ].join('\n'));
  }

  private async processCreateSearchStep(
    chatId: string,
    text: string,
    state: TelegramConversationState,
  ): Promise<void> {
    const draft = { ...state.draft };
    this.debug(`Wizard step: chatId=${chatId}, currentStep=${state.step}.`);

    if (state.step === CreateSearchStep.NAME) {
      const name = text.trim();
      if (!name || name.length > 60) {
        await this.client.sendMessage(chatId, 'El nombre no puede estar vacío y debe tener hasta 60 caracteres.');
        return;
      }
      if (await this.searchNameExists(chatId, name)) {
        const suggestedName = await this.suggestAvailableName(chatId, name);
        await this.saveCreateSearchState(chatId, CreateSearchStep.NAME_DUPLICATE, { ...draft, suggestedName });
        await this.client.sendMessage(chatId, [
          `Ya existe una alerta con el nombre "${name}".`,
          `Podés usar "${suggestedName}" o escribir otro nombre.`,
        ].join('\n'), {
          replyMarkup: {
            inline_keyboard: [
              [{ text: `✅ Usar "${suggestedName}"`, callback_data: 'create:use_suggested_name' }],
              [{ text: '✏️ Escribir otro nombre', callback_data: 'create:write_name' }],
              [{ text: '❌ Cancelar', callback_data: 'create:cancel' }],
            ],
          },
        });
        return;
      }
      await this.saveCreateSearchState(chatId, CreateSearchStep.ORIGIN, { ...draft, name });
      await this.askAirport(chatId, 'Origen', 'origin');
      return;
    }

    if (state.step === CreateSearchStep.NAME_DUPLICATE) {
      await this.saveCreateSearchState(chatId, CreateSearchStep.NAME, {});
      await this.processCreateSearchStep(chatId, text, new TelegramConversationState({
        chatId,
        currentCommand: TelegramConversationCommand.CREATE_SEARCH,
        step: CreateSearchStep.NAME,
        draft: {},
        expiresAt: this.wizardExpiresAt(),
      }));
      return;
    }

    if (state.step === CreateSearchStep.ORIGIN) {
      const origin = await this.resolveAirportInput(chatId, text, draft, 'origin');
      if (!origin) {
        return;
      }
      const nextDraft = this.withSelectedAirport(draft, 'origin', origin.code);
      await this.saveCreateSearchState(chatId, CreateSearchStep.DESTINATION, nextDraft);
      await this.sendAirportSelected(chatId, 'Origen', origin);
      await this.askAirport(chatId, 'Destino', 'destination');
      return;
    }

    if (state.step === CreateSearchStep.DESTINATION) {
      const destination = await this.resolveAirportInput(chatId, text, draft, 'destination');
      if (!destination) {
        return;
      }
      if (destination.code === draft.origin) {
        await this.client.sendMessage(chatId, 'El destino debe ser distinto del origen.');
        return;
      }
      const nextDraft = this.withSelectedAirport(draft, 'destination', destination.code);
      await this.saveCreateSearchState(chatId, CreateSearchStep.DEPARTURE_DATE, nextDraft);
      await this.sendAirportSelected(chatId, 'Destino', destination);
      await this.askDepartureDate(chatId);
      return;
    }

    if (state.step === CreateSearchStep.DEPARTURE_DATE) {
      const departureDate = parseDateInput(text);
      if (!departureDate) {
        await this.client.sendMessage(chatId, 'Fecha inválida o en el pasado. Usá formato DD/MM/YYYY, por ejemplo 10/10/2026.');
        return;
      }
      const nextDraft = { ...draft, departureDate: departureDate.toISOString() };
      await this.saveCreateSearchState(chatId, CreateSearchStep.RETURN_DATE, nextDraft);
      await this.askReturnDate(chatId);
      return;
    }

    if (state.step === CreateSearchStep.RETURN_DATE) {
      if (text.trim() === '-') {
        await this.saveCreateSearchState(chatId, CreateSearchStep.ADULTS, { ...draft, tripType: TripType.ONE_WAY });
        await this.askAdults(chatId);
        return;
      }
      const returnDate = parseDateInput(text);
      const departureDate = draft.departureDate ? new Date(draft.departureDate) : undefined;
      if (!returnDate || !departureDate) {
        await this.client.sendMessage(chatId, 'Fecha inválida. Usá formato DD/MM/YYYY.');
        return;
      }
      if (returnDate.getTime() < departureDate.getTime()) {
        await this.client.sendMessage(chatId, 'La fecha de vuelta debe ser igual o posterior a la fecha de ida.');
        return;
      }
      await this.saveCreateSearchState(chatId, CreateSearchStep.ADULTS, { ...draft, tripType: TripType.ROUND_TRIP, returnDate: returnDate.toISOString() });
      await this.askAdults(chatId);
      return;
    }

    if (state.step === CreateSearchStep.CUSTOM_ADULTS) {
      const adults = parseAdultCount(text);
      if (!adults) {
        await this.client.sendMessage(chatId, 'Cantidad inválida. Escribí un entero entre 1 y 9.');
        return;
      }
      await this.saveCreateSearchState(chatId, CreateSearchStep.TARGET_PRICE_CHOICE, { ...draft, adults });
      await this.askTargetPriceChoice(chatId);
      return;
    }

    if (state.step === CreateSearchStep.ADULTS) {
      await this.client.sendMessage(chatId, 'Elegí la cantidad de adultos usando los botones.');
      await this.askAdults(chatId);
      return;
    }

    if (state.step === CreateSearchStep.TARGET_PRICE_CHOICE) {
      await this.client.sendMessage(chatId, 'Elegí si querés omitir o ingresar un precio objetivo usando los botones.');
      await this.askTargetPriceChoice(chatId);
      return;
    }

    if (state.step === CreateSearchStep.TARGET_PRICE) {
      const targetPrice = parseTargetPrice(text);
      if (targetPrice === null) {
        await this.client.sendMessage(chatId, 'Precio objetivo inválido. Escribí un número positivo u omitir.');
        return;
      }
      const nextDraft = { ...draft };
      if (targetPrice !== undefined) {
        nextDraft.targetPrice = targetPrice;
      } else {
        delete nextDraft.targetPrice;
      }
      await this.saveCreateSearchState(chatId, CreateSearchStep.CONFIRMATION, nextDraft);
      await this.sendCreateConfirmation(chatId, nextDraft);
      return;
    }

    if (state.step === CreateSearchStep.CONFIRMATION) {
      await this.client.sendMessage(chatId, 'Usá los botones para crear, editar o cancelar.');
    }
  }

  private async saveCreateSearchState(
    chatId: string,
    step: CreateSearchStep,
    draft: CreateSearchDraft,
  ): Promise<void> {
    this.debug(`Wizard transition: chatId=${chatId}, nextStep=${step}.`);
    await this.conversations.upsert(new TelegramConversationState({
      chatId,
      currentCommand: TelegramConversationCommand.CREATE_SEARCH,
      step,
      draft,
      expiresAt: this.wizardExpiresAt(),
    }));
  }

  private wizardExpiresAt(): Date {
    const ttlMinutes = this.config.get<number>('telegramWizardTtlMinutes') ?? 15;
    const safeTtl = Number.isFinite(ttlMinutes) && ttlMinutes > 0 ? ttlMinutes : 15;
    return new Date(Date.now() + safeTtl * 60 * 1000);
  }

  private isExpired(state: TelegramConversationState): boolean {
    return state.expiresAt.getTime() <= Date.now();
  }

  private async askAdults(chatId: string): Promise<void> {
    await this.client.sendMessage(chatId, 'Cantidad de adultos?', {
      replyMarkup: {
        inline_keyboard: [
          [{ text: '1 adulto', callback_data: 'create:adults:1' }],
          [{ text: '2 adultos', callback_data: 'create:adults:2' }],
          [{ text: 'Otro', callback_data: 'create:adults:other' }],
        ],
      },
    });
  }

  private async askTargetPriceChoice(chatId: string): Promise<void> {
    await this.client.sendMessage(chatId, [
      '¿Querés definir un precio objetivo?',
      'El bot igual guardará el precio actual como referencia y te avisará si baja.',
    ].join('\n'), {
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'Omitir', callback_data: 'create:target:omit' }],
          [{ text: 'Ingresar precio', callback_data: 'create:target:enter' }],
        ],
      },
    });
  }

  private async sendCreateConfirmation(chatId: string, draft: CreateSearchDraft): Promise<void> {
    await this.client.sendMessage(chatId, this.confirmationMessage(draft), {
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ Crear alerta', callback_data: 'create:confirm' }],
          [{ text: '✏️ Editar', callback_data: 'create:edit' }],
          [{ text: '❌ Cancelar', callback_data: 'create:cancel' }],
        ],
      },
    });
  }

  private async createSearchFromDraft(chatId: string, draft: CreateSearchDraft): Promise<FlightSearch> {
    if (!draft.name || !draft.origin || !draft.destination || !draft.tripType || !draft.departureDate || !draft.adults) {
      throw new Error('Create search draft is incomplete.');
    }

    const existingSearches = await this.manageSearches.listManageable(chatId);
    const maxSearches = this.maxSearchesPerUser();
    if (existingSearches.filter((search) => search.isActive).length >= maxSearches) {
      throw new Error(`MAX_SEARCHES_PER_USER:${maxSearches}`);
    }
    if (existingSearches.some((search) => search.name === draft.name)) {
      throw { code: 11000 };
    }

    return this.createFlightSearch.execute({
      name: draft.name,
      origin: draft.origin,
      destination: draft.destination,
      departureDate: new Date(draft.departureDate),
      returnDate: draft.returnDate ? new Date(draft.returnDate) : undefined,
      tripType: draft.tripType,
      cabinClass: CabinClass.ECONOMY,
      currency: Currency.ARS,
      adults: draft.adults,
      providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      telegramChatId: chatId,
      targetPrice: draft.targetPrice,
      notifyAlways: true,
      notifyOnPriceDrop: true,
      isActive: true,
    });
  }

  private async afterCreateSearch(chatId: string, search: FlightSearch): Promise<void> {
    if (!this.runWatchAfterCreate()) {
      await this.client.sendMessage(chatId, 'Alerta creada. La revisaré en la próxima ejecución programada.');
      return;
    }

    await this.client.sendMessage(chatId, '✅ Alerta creada. Voy a consultar el precio actual...');
    if (!search.id) {
      await this.client.sendMessage(chatId, 'La alerta fue creada, pero no pude consultar el precio ahora. Lo intentaré en la próxima ejecución programada.');
      return;
    }

    try {
      const result = await this.flightPriceWatch.runOnceForSearch(search.id, { sendInitialSummary: true });
      if (result.noResultsRuns > 0 || result.validOptionsFound === 0) {
        await this.client.sendMessage(chatId, 'Alerta creada. No encontré vuelos válidos para esta búsqueda por ahora.');
      }
    } catch (error) {
      this.logger.warn(`Initial watch after create failed for search=${search.id}: ${this.errorMessage(error)}`);
      await this.client.sendMessage(chatId, 'La alerta fue creada, pero no pude consultar el precio ahora. Lo intentaré en la próxima ejecución programada.');
    }
  }

  private runWatchAfterCreate(): boolean {
    const value = this.config.get<boolean>('runWatchAfterCreate');
    return typeof value === 'boolean' ? value : process.env.RUN_WATCH_AFTER_CREATE !== 'false';
  }

  private maxSearchesPerUser(): number {
    const value = this.config.get<number>('maxSearchesPerUser') ?? 5;
    return Number.isFinite(value) && value > 0 ? value : 5;
  }

  private confirmationMessage(draft: CreateSearchDraft): string {
    const departureDate = draft.departureDate ? new Date(draft.departureDate) : undefined;
    const returnDate = draft.returnDate ? new Date(draft.returnDate) : undefined;
    const route = draft.tripType === TripType.ROUND_TRIP
      ? `${this.airports.label(draft.origin)} ↔ ${this.airports.label(draft.destination)}`
      : `${this.airports.label(draft.origin)} → ${this.airports.label(draft.destination)}`;
    return [
      `✈️ ${draft.name ?? 'N/D'}`,
      '',
      route,
      `${departureDate ? formatDate(departureDate) : 'N/D'}${returnDate ? ` al ${formatDate(returnDate)}` : ''}`,
      `Adultos: ${draft.adults ?? 1}`,
      'Proveedor: Aerolíneas Argentinas',
      'Solo directos: sí',
      'Aeropuerto exacto: sí',
      `Precio objetivo: ${draft.targetPrice ? `$${Math.round(draft.targetPrice).toLocaleString('de-DE')} ARS` : 'sin definir'}`,
    ].join('\n');
  }

  private searchDetailMessage(search: FlightSearch, latestRun: FlightWatchRun | null): string {
    return [
      `🔎 ${search.name}`,
      '',
      `Ruta: ${this.airports.label(search.origin)} ${search.returnDate ? '↔' : '→'} ${this.airports.label(search.destination)}`,
      `Fechas: ${this.displayDate(search.departureDate)}${search.returnDate ? ` al ${this.displayDate(search.returnDate)}` : ''}`,
      `Tipo: ${search.tripType === TripType.ROUND_TRIP ? 'Ida y vuelta' : 'Solo ida'}`,
      `Adultos: ${search.adults}`,
      `Precio objetivo: ${search.targetPrice ? `$${Math.round(search.targetPrice).toLocaleString('de-DE')} ${search.currency}` : 'sin definir'}`,
      `Proveedor: ${search.providerCode ?? 'todos los habilitados'}`,
      `Estado: ${search.isActive ? 'activa' : 'pausada'}`,
      '',
      latestRun ? this.latestRunMessage(latestRun) : 'Última corrida: sin datos todavía.',
    ].join('\n');
  }

  private latestRunMessage(run: FlightWatchRun): string {
    const recommended = run.recommendedOption;
    return [
      'Última corrida:',
      `Fecha: ${this.displayDate(run.ranAt)}`,
      `Opciones válidas: ${run.validOptionsCount}`,
      `Más barato: ${run.cheapestPrice !== undefined ? `$${Math.round(run.cheapestPrice).toLocaleString('de-DE')} ${run.currency ?? ''}`.trim() : 'N/D'}`,
      `Recomendado: ${run.recommendedPrice !== undefined ? `$${Math.round(run.recommendedPrice).toLocaleString('de-DE')} ${run.currency ?? ''}`.trim() : 'N/D'}`,
      `Tarifa recomendada: ${recommended?.fareName ?? 'N/D'}`,
      recommended?.outboundSummary ? `Ida recomendada: ${recommended.outboundSummary}` : undefined,
      recommended?.inboundSummary ? `Vuelta recomendada: ${recommended.inboundSummary}` : undefined,
    ].filter((line): line is string => line !== undefined).join('\n');
  }

  private airportPrompt(label: 'Origen' | 'Destino'): string {
    const icon = label === 'Origen' ? '📍' : '📍';
    return [
      `${icon} ${label}`,
      '',
      'Elegí una opción de abajo o escribí ciudad, provincia, aeropuerto o código.',
      '',
      'Ejemplos:',
      'Jujuy, Aeroparque, Buenos Aires, AEP, JUJ',
    ].join('\n');
  }

  private async askAirport(
    chatId: string,
    label: 'Origen' | 'Destino',
    field: 'origin' | 'destination',
  ): Promise<void> {
    await this.client.sendMessage(chatId, this.airportPrompt(label), {
      replyMarkup: this.frequentAirportKeyboard(field),
    });
  }

  private async sendAirportSelected(chatId: string, label: 'Origen' | 'Destino', airport: Airport): Promise<void> {
    await this.client.sendMessage(chatId, `✅ ${label} seleccionado:\n${this.airportShortLabel(airport)}`);
  }

  private airportShortLabel(airport: Airport): string {
    if (airport.code === 'AEP') {
      return 'AEP — Buenos Aires Aeroparque';
    }
    if (airport.code === 'EZE') {
      return 'EZE — Buenos Aires Ezeiza';
    }
    return `${airport.code} — ${airport.city}`;
  }

  private async askDepartureDate(chatId: string): Promise<void> {
    await this.client.sendMessage(chatId, [
      '📅 Fecha de ida',
      '',
      'Escribí la fecha de salida.',
      '',
      'Formatos aceptados:',
      'DD/MM/YYYY o YYYY-MM-DD',
      '',
      'Ejemplo:',
      '20/10/2026',
    ].join('\n'));
  }

  private async askReturnDate(chatId: string): Promise<void> {
    await this.client.sendMessage(chatId, [
      '📅 Fecha de vuelta',
      '',
      'Escribí la fecha de regreso.',
      'Si es solo ida, escribí "-".',
      '',
      'Formatos aceptados:',
      'DD/MM/YYYY o YYYY-MM-DD',
      '',
      'Ejemplo:',
      '22/10/2026',
    ].join('\n'));
  }

  private frequentAirportKeyboard(field: 'origin' | 'destination'): TelegramInlineKeyboardMarkup {
    const airports = [
      ['JUJ', 'Jujuy'],
      ['AEP', 'Aeroparque'],
      ['EZE', 'Ezeiza'],
      ['MDZ', 'Mendoza'],
      ['COR', 'Córdoba'],
      ['SLA', 'Salta'],
    ];
    return {
      inline_keyboard: airports.map(([code, label]) => [
        { text: `${code} — ${label}`, callback_data: `select_airport:${field}:${code}` },
      ]),
    };
  }

  private async resolveAirportInput(
    chatId: string,
    text: string,
    draft: CreateSearchDraft,
    field: 'origin' | 'destination',
  ): Promise<Airport | null> {
    const pending = draft.pendingAirportField === field ? draft.pendingAirportOptions ?? [] : [];
    if (pending.length && /^\d+$/.test(text.trim())) {
      const index = Number(text.trim()) - 1;
      const selected = this.airports.findByCode(pending[index]);
      if (!selected) {
        await this.client.sendMessage(chatId, `Opción inválida. Respondé con un número entre 1 y ${pending.length}.`);
        return null;
      }
      return selected;
    }

    const result = this.airports.resolve(text);
    if (result.type === 'none') {
      const code = parseAirportCode(text);
      if (code) {
        await this.client.sendMessage(chatId, `No tengo ese aeropuerto en el catálogo, pero voy a usar el código ${code}.`);
        return {
          code,
          city: code,
          name: code,
          aliases: [],
        };
      }
      await this.client.sendMessage(chatId, 'No encontré ese aeropuerto. Probá con ciudad, aeropuerto o código. Ejemplos: Jujuy, Aeroparque, AEP.');
      return null;
    }

    if (result.type === 'multiple') {
      await this.saveCreateSearchState(chatId, field === 'origin' ? CreateSearchStep.ORIGIN : CreateSearchStep.DESTINATION, {
        ...draft,
        pendingAirportField: field,
        pendingAirportOptions: result.airports.map((airport) => airport.code),
      });
      await this.client.sendMessage(chatId, `Encontré más de una opción para ${text.trim()}. Elegí una:`, {
        replyMarkup: {
          inline_keyboard: result.airports.map((airport) => [
            { text: this.airports.label(airport), callback_data: `select_airport:${field}:${airport.code}` },
          ]),
        },
      });
      return null;
    }

    return result.airport;
  }

  private async selectAirport(
    chatId: string,
    draft: CreateSearchDraft,
    field: 'origin' | 'destination',
    airport: Airport,
  ): Promise<void> {
    if (field === 'destination' && airport.code === draft.origin) {
      await this.client.sendMessage(chatId, 'El destino debe ser distinto del origen.');
      return;
    }

    const nextDraft = this.withSelectedAirport(draft, field, airport.code);
    if (field === 'origin') {
      await this.saveCreateSearchState(chatId, CreateSearchStep.DESTINATION, nextDraft);
      await this.sendAirportSelected(chatId, 'Origen', airport);
      await this.askAirport(chatId, 'Destino', 'destination');
      return;
    }

    await this.saveCreateSearchState(chatId, CreateSearchStep.DEPARTURE_DATE, nextDraft);
    await this.sendAirportSelected(chatId, 'Destino', airport);
    await this.askDepartureDate(chatId);
  }

  private async searchNameExists(chatId: string, name: string): Promise<boolean> {
    const searches = await this.manageSearches.listManageable(chatId);
    return searches.some((search) => search.name.toLowerCase() === name.toLowerCase());
  }

  private async suggestAvailableName(chatId: string, baseName: string): Promise<string> {
    const searches = await this.manageSearches.listManageable(chatId);
    const existingNames = new Set(searches.map((search) => search.name.toLowerCase()));
    for (let suffix = 2; suffix < 100; suffix += 1) {
      const candidate = `${baseName} (${suffix})`;
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `${baseName} (${Date.now()})`;
  }

  private withSelectedAirport(
    draft: CreateSearchDraft,
    field: 'origin' | 'destination',
    code: string,
  ): CreateSearchDraft {
    const nextDraft = { ...draft, [field]: code };
    delete nextDraft.pendingAirportField;
    delete nextDraft.pendingAirportOptions;
    return nextDraft;
  }

  private debug(message: string): void {
    if (this.config.get<boolean>('enableVerboseWatchLogs') === true) {
      this.logger.debug(message);
    }
  }
}
