import { ConfigService } from '@nestjs/config';
import { TelegramBotService } from '../../../src/telegram-bot/application/telegram-bot.service';
import { TelegramBotClient, TelegramBotUpdate } from '../../../src/telegram-bot/infrastructure/telegram-bot.client';
import { CreateFlightSearchUseCase } from '../../../src/flight-searches/application/use-cases/create-flight-search.use-case';
import { ManageFlightSearchesUseCase } from '../../../src/flight-searches/application/use-cases/manage-flight-searches.use-case';
import { FlightSearch } from '../../../src/flight-searches/domain/entities/flight-search.entity';
import { CabinClass } from '../../../src/flight-searches/domain/enums/cabin-class.enum';
import { Currency } from '../../../src/flight-searches/domain/enums/currency.enum';
import { TripType } from '../../../src/flight-searches/domain/enums/trip-type.enum';
import { AirportResolverService } from '../../../src/shared/airports/airport-resolver.service';
import { GetLatestWatchRunUseCase } from '../../../src/flight-watch-runs/application/use-cases/get-latest-watch-run.use-case';
import { FlightWatchRun } from '../../../src/flight-watch-runs/domain/entities/flight-watch-run.entity';
import { FlightWatchRunStatus } from '../../../src/flight-watch-runs/domain/enums/flight-watch-run-status.enum';
import { FlightProviderCode } from '../../../src/flight-providers/domain/enums/flight-provider-code.enum';
import { FlightPriceWatchService } from '../../../src/scheduler/application/services/flight-price-watch.service';
import { TelegramAccessControlService } from '../../../src/telegram-bot/application/telegram-access-control.service';
import {
  CreateSearchDraft,
  CreateSearchStep,
  TelegramConversationCommand,
  TelegramConversationState,
} from '../../../src/telegram-bot/domain/entities/telegram-conversation-state.entity';
import { TelegramConversationStateRepository } from '../../../src/telegram-bot/domain/repositories/telegram-conversation-state.repository';
import { TelegramConversationStateSchema } from '../../../src/telegram-bot/infrastructure/mongoose/telegram-conversation-state.schema';
import { BotUser } from '../../../src/telegram-bot/domain/entities/bot-user.entity';
import { BotUserStatus } from '../../../src/telegram-bot/domain/enums/bot-user-status.enum';
import { BotUserRepository } from '../../../src/telegram-bot/domain/repositories/bot-user.repository';

describe('TelegramBotService', () => {
  it('rejects messages from chats that are not allowed', async () => {
    const { service, client, manageSearches } = fixture();

    await service.processUpdate(update('/listar', 999));

    expect(client.sendMessage).toHaveBeenCalledWith('999', 'Este bot está en beta cerrada. Pedile acceso al administrador.');
    expect(manageSearches.listManageable).not.toHaveBeenCalled();
  });

  it('responds to /start with a friendly message and inline buttons', async () => {
    const { service, client } = fixture();

    await service.processUpdate(update('/start'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Hola, soy Flight Price Watcher'), {
      replyMarkup: expect.objectContaining({
        inline_keyboard: expect.arrayContaining([
          [{ text: '➕ Crear alerta', callback_data: 'menu:create' }],
          [{ text: '📋 Mis alertas', callback_data: 'menu:list' }],
        ]),
      }),
    });
  });

  it('responds to /ayuda with simple help', async () => {
    const { service, client } = fixture();

    await service.processUpdate(update('/ayuda'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('/crear - crear una alerta de vuelo'));
    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Usá /listar para ver tus alertas');
    expect(message).not.toContain('/ver N');
    expect(message).not.toContain('/sync_admins');
  });

  it('/ayuda shows admin section to admins', async () => {
    const { service, client } = fixture({ adminChatIds: ['999'], allowedChatIds: [], legacyAllowedChatId: '' });

    await service.processUpdate(update('/ayuda', 999));

    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Admin:');
    expect(message).toContain('/sync_admins - sincronizar admins configurados');
  });

  it('accepts allowed chats from TELEGRAM_ALLOWED_CHAT_IDS', async () => {
    const { service, client } = fixture({ allowedChatIds: ['123', '456'] });

    await service.processUpdate(update('/start', 456));

    expect(client.sendMessage).toHaveBeenCalledWith('456', expect.stringContaining('Hola, soy Flight Price Watcher'), expect.any(Object));
  });

  it('keeps compatibility with TELEGRAM_ALLOWED_CHAT_ID', async () => {
    const { service, client } = fixture({ allowedChatIds: [], legacyAllowedChatId: '789' });

    await service.processUpdate(update('/start', 789));

    expect(client.sendMessage).toHaveBeenCalledWith('789', expect.stringContaining('Hola, soy Flight Price Watcher'), expect.any(Object));
  });

  it('keeps admin approved on /start even if they are not in telegram_users yet', async () => {
    const { service, client, botUsers } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
    });

    await service.processUpdate(update('/start', 999));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '999',
      status: BotUserStatus.APPROVED,
      isAdmin: true,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('999', expect.stringContaining('Hola, soy Flight Price Watcher'), expect.any(Object));
  });

  it('/start upgrades an existing allowlist-approved admin to admin-config', async () => {
    const { service, botUsers } = fixture({
      allowedChatIds: ['999'],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
      botUsers: [botUser({
        telegramChatId: '999',
        status: BotUserStatus.APPROVED,
        isAdmin: false,
        approvedBy: 'allowlist',
      })],
    });

    await service.processUpdate(update('/start', 999));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '999',
      status: BotUserStatus.APPROVED,
      isAdmin: true,
      approvedBy: 'admin-config',
    }));
  });

  it('/sync_admins creates and updates configured admins', async () => {
    const { service, client, botUsers } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999', '888'],
      accessMode: 'approval',
      botUsers: [botUser({
        telegramChatId: '999',
        status: BotUserStatus.APPROVED,
        isAdmin: false,
        approvedBy: 'allowlist',
      })],
    });

    await service.processUpdate(update('/sync_admins', 999));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '999',
      isAdmin: true,
      approvedBy: 'admin-config',
    }));
    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '888',
      isAdmin: true,
      approvedBy: 'admin-config',
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('999', expect.stringContaining('Admins sincronizados: 2'));
  });

  it('legacy allowlist does not make users admin', async () => {
    const { service, botUsers } = fixture({
      allowedChatIds: ['123'],
      legacyAllowedChatId: '',
      adminChatIds: [],
      accessMode: 'approval',
    });

    await service.processUpdate(update('/start', 123));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '123',
      status: BotUserStatus.APPROVED,
      isAdmin: false,
      approvedBy: 'allowlist',
    }));
  });

  it('creates a pending access request in approval mode and notifies admins', async () => {
    const { service, client, botUsers } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
    });

    await service.processUpdate(update('/start', 123));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '123',
      status: BotUserStatus.PENDING,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Este bot está en beta cerrada. Ya envié tu solicitud al administrador.');
    expect(client.sendMessage).toHaveBeenCalledWith('999', expect.stringContaining('Nueva solicitud de acceso'), expect.any(Object));
  });

  it('registers pending user and explains when no admins are configured', async () => {
    const { service, client, botUsers } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: [],
      accessMode: 'approval',
    });

    await service.processUpdate(update('/start', 123));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({
      telegramChatId: '123',
      status: BotUserStatus.PENDING,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith(
      '123',
      'Tu solicitud fue registrada, pero no pude notificar al administrador. Avisale manualmente.',
    );
  });

  it('does not crash if admin notification fails', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
    });
    client.sendMessage.mockImplementation(async (chatId: string) => {
      if (chatId === '999') {
        throw new Error('telegram failed');
      }
    });

    await service.processUpdate(update('/start', 123));

    expect(client.sendMessage).toHaveBeenCalledWith('999', expect.stringContaining('Nueva solicitud de acceso'), expect.any(Object));
    expect(client.sendMessage).toHaveBeenCalledWith(
      '123',
      'Tu solicitud fue registrada, pero no pude notificar al administrador. Avisale manualmente.',
    );
  });

  it('approves a pending user from admin callback and lets them use the bot', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
      botUsers: [botUser({ telegramChatId: '123', status: BotUserStatus.PENDING })],
    });

    await service.processUpdate(callbackUpdate('approve_user:123', 999, 1));
    await service.processUpdate(update('/listar', 123, 2));

    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Tu acceso fue aprobado. Ya podés usar el bot.', expect.any(Object));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Mis alertas'), expect.any(Object));
  });

  it('does not allow rejected users to use commands', async () => {
    const { service, client, manageSearches } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      accessMode: 'approval',
      botUsers: [botUser({ telegramChatId: '123', status: BotUserStatus.REJECTED })],
    });

    await service.processUpdate(update('/listar'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No tenés acceso a este bot.');
    expect(manageSearches.listManageable).not.toHaveBeenCalled();
  });

  it('does not allow blocked users to use commands', async () => {
    const { service, client, manageSearches } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      accessMode: 'approval',
      botUsers: [botUser({ telegramChatId: '123', status: BotUserStatus.BLOCKED })],
    });

    await service.processUpdate(update('/listar'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No tenés acceso a este bot.');
    expect(manageSearches.listManageable).not.toHaveBeenCalled();
  });

  it('auto-approves users in open mode', async () => {
    const { service, client, botUsers } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      accessMode: 'open',
    });

    await service.processUpdate(update('/start'));

    expect(botUsers.upsert).toHaveBeenCalledWith(expect.objectContaining({ status: BotUserStatus.APPROVED }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Hola, soy Flight Price Watcher'), expect.any(Object));
  });

  it('blocks non-allowed users in closed mode', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'closed',
    });

    await service.processUpdate(update('/start'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No tenés acceso a este bot.');
  });

  it('lets admins use admin commands', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
      botUsers: [botUser({ telegramChatId: '123', status: BotUserStatus.PENDING })],
    });

    await service.processUpdate(update('/pendientes', 999));

    expect(client.sendMessage).toHaveBeenCalledWith('999', expect.stringContaining('Solicitudes pendientes'));
  });

  it('non-admin cannot execute admin callbacks', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      accessMode: 'approval',
      botUsers: [botUser({ telegramChatId: '123', status: BotUserStatus.APPROVED })],
    });

    await service.processUpdate(callbackUpdate('approve_user:456', 123));

    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-1', 'Sólo admins pueden hacer esta acción.');
    expect(client.sendMessage).not.toHaveBeenCalledWith('456', expect.any(String), expect.anything());
  });

  it('/mi_chat_id responds with the current chat id even when the user is not approved', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
    });

    await service.processUpdate(update('/mi_chat_id', 123));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Tu chatId es: 123');
  });

  it('/estado shows user active searches and limits', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [
        search({ telegramChatId: '123' }),
        search({ id: 'search-2', name: 'Pausada', telegramChatId: '123', isActive: false }),
      ],
    });

    await service.processUpdate(update('/estado'));

    expect(manageSearches.listManageable).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Alertas activas: 1'));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Límite de alertas: 5'));
  });

  it('/pendientes without pending users responds clearly', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      botUsers: [],
    });

    await service.processUpdate(update('/pendientes', 999));

    expect(client.sendMessage).toHaveBeenCalledWith('999', 'No hay solicitudes pendientes.');
  });

  it('/usuarios groups users by status', async () => {
    const { service, client } = fixture({
      allowedChatIds: [],
      legacyAllowedChatId: '',
      adminChatIds: ['999'],
      botUsers: [
        botUser({ telegramChatId: '1', firstName: 'Pending', status: BotUserStatus.PENDING }),
        botUser({ telegramChatId: '2', firstName: 'Approved', status: BotUserStatus.APPROVED }),
        botUser({ telegramChatId: '3', firstName: 'Rejected', status: BotUserStatus.REJECTED }),
        botUser({ telegramChatId: '4', firstName: 'Blocked', status: BotUserStatus.BLOCKED }),
      ],
    });

    await service.processUpdate(update('/usuarios', 999));

    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('pending:');
    expect(message).toContain('approved:');
    expect(message).toContain('rejected:');
    expect(message).toContain('blocked:');
    expect(message).toContain('Pending');
    expect(message).toContain('Approved');
  });

  it('/crear starts a create-search conversation', async () => {
    const { service, client, conversations } = fixture();

    await service.processUpdate(update('/crear'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      chatId: '123',
      currentCommand: TelegramConversationCommand.CREATE_SEARCH,
      step: CreateSearchStep.NAME,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Vamos a crear una alerta'));
  });

  it('detects duplicate name early and proposes Iron Maiden (2)', async () => {
    const { service, client, conversations } = fixture({
      searches: [search({ name: 'Iron Maiden', telegramChatId: '123' })],
      state: state(CreateSearchStep.NAME, {}),
    });

    await service.processUpdate(update('Iron Maiden'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.NAME_DUPLICATE,
      draft: expect.objectContaining({ suggestedName: 'Iron Maiden (2)' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Iron Maiden (2)'), expect.any(Object));
  });

  it('uses suggested duplicate name and continues to origin', async () => {
    const { service, conversations, client } = fixture({
      state: state(CreateSearchStep.NAME_DUPLICATE, { suggestedName: 'Iron Maiden (2)' }),
    });

    await service.processUpdate(callbackUpdate('create:use_suggested_name'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.ORIGIN,
      draft: expect.objectContaining({ name: 'Iron Maiden (2)' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Nombre seleccionado:\nIron Maiden (2)');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Origen'), expect.any(Object));
  });

  it('lets user write another name after duplicate and revalidates it', async () => {
    const { service, conversations, client } = fixture({
      state: state(CreateSearchStep.NAME_DUPLICATE, { suggestedName: 'Iron Maiden (2)' }),
    });

    await service.processUpdate(callbackUpdate('create:write_name'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.NAME,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Escribí otro nombre para la alerta.');
  });

  it('shows frequent airport buttons when asking for origin', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.NAME, {}) });

    await service.processUpdate(update('Viaje Test'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Origen'), {
      replyMarkup: {
        inline_keyboard: expect.arrayContaining([
          [{ text: 'JUJ — Jujuy', callback_data: 'select_airport:origin:JUJ' }],
          [{ text: 'AEP — Aeroparque', callback_data: 'select_airport:origin:AEP' }],
          [{ text: 'EZE — Ezeiza', callback_data: 'select_airport:origin:EZE' }],
          [{ text: 'MDZ — Mendoza', callback_data: 'select_airport:origin:MDZ' }],
          [{ text: 'COR — Córdoba', callback_data: 'select_airport:origin:COR' }],
          [{ text: 'SLA — Salta', callback_data: 'select_airport:origin:SLA' }],
        ]),
      },
    });
  });

  it('shows frequent airport buttons when asking for destination', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('JUJ'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Origen seleccionado:\nJUJ — San Salvador de Jujuy');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Destino'), {
      replyMarkup: {
        inline_keyboard: expect.arrayContaining([
          [{ text: 'JUJ — Jujuy', callback_data: 'select_airport:destination:JUJ' }],
          [{ text: 'AEP — Aeroparque', callback_data: 'select_airport:destination:AEP' }],
          [{ text: 'EZE — Ezeiza', callback_data: 'select_airport:destination:EZE' }],
          [{ text: 'MDZ — Mendoza', callback_data: 'select_airport:destination:MDZ' }],
          [{ text: 'COR — Córdoba', callback_data: 'select_airport:destination:COR' }],
          [{ text: 'SLA — Salta', callback_data: 'select_airport:destination:SLA' }],
        ]),
      },
    });
  });

  it('lists active FlightSearches for /listar', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [
        search({ telegramChatId: '123' }),
        search({ name: 'Viaje Pausado', isActive: false, telegramChatId: '123' }),
      ],
    });

    await service.processUpdate(update('/listar'));

    expect(manageSearches.listManageable).toHaveBeenCalledWith('123');
    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    const options = (client.sendMessage as jest.Mock).mock.calls[0][2];
    expect(message).toContain('1. ✈️ Viaje Octubre');
    expect(message).toContain('Estado: activa');
    expect(message).toContain('2. ✈️ Viaje Pausado');
    expect(message).toContain('Estado: pausada');
    expect(options.replyMarkup.inline_keyboard).toContainEqual([
      { text: '🔎 Ver 1', callback_data: 'search:view:1' },
      { text: '⏸ Pausar 1', callback_data: 'search:pause:1' },
    ]);
    expect(options.replyMarkup.inline_keyboard).toContainEqual([
      { text: '🔎 Ver 2', callback_data: 'search:view:2' },
      { text: '▶️ Activar 2', callback_data: 'search:activate:2' },
    ]);
  });

  it('/listar filters searches by current chatId and excludes searches without telegramChatId', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [
        search({ name: 'Mi viaje', telegramChatId: '123' }),
        search({ name: 'Otro chat', telegramChatId: '999' }),
        search({ name: 'Sin chat' }),
      ],
    });

    await service.processUpdate(update('/listar'));

    expect(manageSearches.listManageable).toHaveBeenCalledWith('123');
    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Mi viaje');
    expect(message).not.toContain('Sin chat');
    expect(message).not.toContain('Otro chat');
  });

  it('advances offset so polling does not process the same update twice', async () => {
    const updates = [[update('/help', 123, 10)], []];
    const { service, client } = fixture({ updates });

    await service.pollOnce();
    await service.pollOnce();

    expect(client.getUpdates).toHaveBeenNthCalledWith(1, undefined);
    expect(client.getUpdates).toHaveBeenNthCalledWith(2, 11);
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('getUpdates timeout does not stop polling', async () => {
    const { service, client } = fixture();
    client.getUpdates.mockReset();
    client.getUpdates
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce([update('/help', 123, 10)]);

    await expect(service.pollOnce()).resolves.toBeUndefined();
    await expect(service.pollOnce()).resolves.toBeUndefined();

    expect(client.getUpdates).toHaveBeenNthCalledWith(1, undefined);
    expect(client.getUpdates).toHaveBeenNthCalledWith(2, undefined);
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('❓ Ayuda'));
  });

  it('sendMessage fetch failure does not crash polling', async () => {
    const { service, client } = fixture({ updates: [[update('/help', 123, 10)]] });
    client.sendMessage.mockRejectedValue(new Error('fetch failed'));

    await expect(service.pollOnce()).resolves.toBeUndefined();

    expect(client.sendMessage).toHaveBeenCalled();
  });

  it('pollOnce continues with later updates when one update fails', async () => {
    const { service, client, manageSearches } = fixture({
      updates: [[callbackUpdate('search:pause:1', 123, 10), update('/listar', 123, 11)]],
      searches: [search({ telegramChatId: '123' })],
    });
    client.getUpdates.mockReset();
    client.getUpdates.mockResolvedValueOnce([callbackUpdate('search:pause:1', 123, 10), update('/listar', 123, 11)]);
    manageSearches.pauseByDisplayIndex.mockRejectedValueOnce(new Error('boom'));

    await expect(service.pollOnce()).resolves.toBeUndefined();

    expect(manageSearches.listManageable).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📋 Mis alertas'), expect.any(Object));
  });

  it('handles menu callbacks from /start buttons', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('menu:list'));

    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-1');
    expect(manageSearches.listManageable).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📋 Mis alertas'), expect.any(Object));
  });

  it('handles search view callback scoped by chat', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('search:view:1'));

    expect(client.answerCallbackQuery).toHaveBeenCalledWith('callback-1');
    expect(manageSearches.getByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('🔎 Viaje Octubre'), expect.objectContaining({
      replyMarkup: expect.objectContaining({
        inline_keyboard: expect.arrayContaining([
          [{ text: '🔄 Consultar ahora', callback_data: 'search:manual:1' }],
        ]),
      }),
    }));
  });

  it('handles search pause callback scoped by chat', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('search:pause:1'));

    expect(manageSearches.pauseByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '⏸️ Pausé la búsqueda Viaje Octubre.');
  });

  it('handles search summary callback using latest saved run only', async () => {
    const { service, client, latestWatchRun } = fixture({
      searches: [search({ telegramChatId: '123' })],
      latestRun: watchRun(),
    });

    await service.processUpdate(callbackUpdate('search:summary:1'));

    expect(latestWatchRun.execute).toHaveBeenCalledWith('search-1');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('🔄 Resumen — Viaje Octubre'));
  });

  it('manual watch callback runs only the selected search and sends an initial summary', async () => {
    const { service, client, flightPriceWatch, manageSearches } = fixture({
      searches: [search({ telegramChatId: '123' })],
    });

    await service.processUpdate(callbackUpdate('search:manual:1'));

    expect(manageSearches.touchManualWatchByDisplayIndex).toHaveBeenCalledWith(1, '123', expect.any(Date));
    expect(flightPriceWatch.runOnceForSearch).toHaveBeenCalledWith('search-1', { sendInitialSummary: true, manual: true });
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Consultando precio actual'));
  });

  it('manual watch callback respects per-alert cooldown', async () => {
    const { service, client, flightPriceWatch } = fixture({
      searches: [search({
        telegramChatId: '123',
        lastManualWatchAt: new Date(Date.now() - 2 * 60 * 1000),
      })],
    });

    await service.processUpdate(callbackUpdate('search:manual:1'));

    expect(flightPriceWatch.runOnceForSearch).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Probá de nuevo en'));
  });

  it('renew callback activates the search and clears renewal state', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ telegramChatId: '123', isActive: false, requiresRenewal: true })],
    });

    await service.processUpdate(callbackUpdate('search:renew:1'));

    expect(manageSearches.renewByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Perfecto. Sigo monitoreando Viaje Octubre.');
  });

  it('renewal prompt callbacks keep paused or mark purchased by search id scoped to chat', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ telegramChatId: '123', isActive: false, requiresRenewal: true })],
    });

    await service.processUpdate(callbackUpdate('renewal:pause:search-1'));
    await service.processUpdate(callbackUpdate('renewal:purchased:search-1', 123, 2));

    expect(manageSearches.keepPausedById).toHaveBeenCalledWith('search-1', '123');
    expect(manageSearches.markPurchasedById).toHaveBeenCalledWith('search-1', '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '⏸ Mantengo pausada Viaje Octubre.');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Genial. Marco Viaje Octubre como comprada y dejo de monitorearla.');
  });

  it('validates invalid origin', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('J1'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('No encontré ese aeropuerto'));
  });

  it('validates destination different from origin', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.DESTINATION, { name: 'Viaje Test', origin: 'JUJ' }) });

    await service.processUpdate(update('juj'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'El destino debe ser distinto del origen.');
  });

  it('accepts lowercase airport codes and normalizes them', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('juj'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'JUJ' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Origen seleccionado:\nJUJ — San Salvador de Jujuy');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Destino'), expect.any(Object));
  });

  it('allows unknown IATA codes with a warning', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('zzz'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'ZZZ' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('No tengo ese aeropuerto en el catálogo, pero voy a usar el código ZZZ.'));
  });

  it('resolves airport by city name', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('jujuy'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'JUJ' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Origen seleccionado:\nJUJ — San Salvador de Jujuy');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Destino'), expect.any(Object));
  });

  it('resolves Aeroparque to AEP', async () => {
    const { service, conversations } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('aeroparque'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'AEP' }),
    }));
  });

  it('resolves Ezeiza to EZE', async () => {
    const { service, conversations } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('ezeiza'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'EZE' }),
    }));
  });

  it('shows inline options when airport search has multiple matches', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }) });

    await service.processUpdate(update('buenos aires'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.ORIGIN,
      draft: expect.objectContaining({ pendingAirportField: 'origin', pendingAirportOptions: ['AEP', 'EZE'] }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Encontré más de una opción'), {
      replyMarkup: {
        inline_keyboard: [
          [{ text: expect.stringContaining('AEP'), callback_data: 'select_airport:origin:AEP' }],
          [{ text: expect.stringContaining('EZE'), callback_data: 'select_airport:origin:EZE' }],
        ],
      },
    });
  });

  it('select_airport callback selects origin', async () => {
    const { service, conversations, client } = fixture({
      state: state(CreateSearchStep.ORIGIN, { name: 'Viaje Test' }),
    });

    await service.processUpdate(callbackUpdate('select_airport:origin:JUJ'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DESTINATION,
      draft: expect.objectContaining({ origin: 'JUJ' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Origen seleccionado:\nJUJ — San Salvador de Jujuy');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📍 Destino'), expect.any(Object));
  });

  it('select_airport callback selects destination', async () => {
    const { service, conversations, client } = fixture({
      state: state(CreateSearchStep.DESTINATION, { name: 'Viaje Test', origin: 'JUJ' }),
    });

    await service.processUpdate(callbackUpdate('select_airport:destination:AEP'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.DEPARTURE_DATE,
      draft: expect.objectContaining({ destination: 'AEP' }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Destino seleccionado:\nAEP — Buenos Aires Aeroparque');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📅 Fecha de ida'));
  });

  it('a departure date message only advances to RETURN_DATE, not ADULTS', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.DEPARTURE_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ROUND_TRIP,
    }) });

    await service.processUpdate(update('10/10/2026'));

    expect(conversations.upsert).toHaveBeenCalledTimes(1);
    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.RETURN_DATE,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📅 Fecha de vuelta'));
  });

  it('accepts yyyy-mm-dd departure date format', async () => {
    const { service, conversations } = fixture({ state: state(CreateSearchStep.DEPARTURE_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
    }) });

    await service.processUpdate(update('2026-10-10'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.RETURN_DATE,
      draft: expect.objectContaining({
        departureDate: new Date('2026-10-10T12:00:00.000Z').toISOString(),
      }),
    }));
  });

  it('a return date message only advances to ADULTS', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.RETURN_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ROUND_TRIP,
      departureDate: new Date('2026-10-10T12:00:00.000Z').toISOString(),
    }) });

    await service.processUpdate(update('15/10/2026'));

    expect(conversations.upsert).toHaveBeenCalledTimes(1);
    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.ADULTS,
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Cantidad de adultos?', expect.any(Object));
  });

  it('sets one-way trip when return date is dash', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.RETURN_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      departureDate: new Date('2026-10-10T12:00:00.000Z').toISOString(),
    }) });

    await service.processUpdate(update('-'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.ADULTS,
      draft: expect.objectContaining({ tripType: TripType.ONE_WAY }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Cantidad de adultos?', expect.any(Object));
  });

  it('chooses adults with inline button', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.ADULTS, completeDraft()) });

    await service.processUpdate(callbackUpdate('create:adults:2'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.TARGET_PRICE_CHOICE,
      draft: expect.objectContaining({ adults: 2 }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('¿Querés definir un precio objetivo?'), expect.any(Object));
  });

  it('validates invalid departure date', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.DEPARTURE_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ONE_WAY,
    }) });

    await service.processUpdate(update('31/02/2026'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Fecha inválida'));
  });

  it('validates past departure date', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.DEPARTURE_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ONE_WAY,
    }) });

    await service.processUpdate(update('01/01/2026'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('en el pasado'));
  });

  it('validates returnDate is not before departureDate', async () => {
    const { service, client } = fixture({ state: state(CreateSearchStep.RETURN_DATE, {
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ROUND_TRIP,
      departureDate: new Date('2026-10-10T12:00:00.000Z').toISOString(),
    }) });

    await service.processUpdate(update('09/10/2026'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'La fecha de vuelta debe ser igual o posterior a la fecha de ida.');
  });

  it('allows omitting targetPrice', async () => {
    const { service, client, conversations } = fixture({ state: state(CreateSearchStep.TARGET_PRICE_CHOICE, completeDraft()) });

    await service.processUpdate(callbackUpdate('create:target:omit'));

    expect(conversations.upsert).toHaveBeenCalledWith(expect.objectContaining({
      step: CreateSearchStep.CONFIRMATION,
      draft: expect.not.objectContaining({ targetPrice: expect.anything() }),
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Precio objetivo: sin definir'), expect.any(Object));
  });

  it('creates FlightSearch on confirmation button', async () => {
    const { service, createFlightSearch, conversations, client, flightPriceWatch } = fixture({
      state: state(CreateSearchStep.CONFIRMATION, completeDraft({ targetPrice: 280_000 })),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(createFlightSearch.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Viaje Test',
      origin: 'JUJ',
      destination: 'AEP',
      tripType: TripType.ROUND_TRIP,
      adults: 1,
      telegramChatId: '123',
      targetPrice: 280_000,
      notifyAlways: true,
      notifyOnPriceDrop: true,
      isActive: true,
    }));
    expect(conversations.deleteByChatId).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Alerta creada. Voy a consultar el precio actual...');
    expect(flightPriceWatch.runOnceForSearch).toHaveBeenCalledWith('search-1', { sendInitialSummary: true });
  });

  it('responds clearly when duplicate key happens while creating a search', async () => {
    const { service, createFlightSearch, conversations, client } = fixture({
      state: state(CreateSearchStep.CONFIRMATION, completeDraft({ name: 'Iron Maiden' })),
    });
    createFlightSearch.execute.mockRejectedValueOnce({ code: 11000 });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Ya existe una alerta con ese nombre'), expect.any(Object));
    expect(conversations.deleteByChatId).not.toHaveBeenCalled();
  });

  it('does not allow creating the same name in the same telegramChatId', async () => {
    const { service, createFlightSearch, client } = fixture({
      searches: [search({ name: 'Iron Maiden', telegramChatId: '123' })],
      state: state(CreateSearchStep.CONFIRMATION, completeDraft({ name: 'Iron Maiden' })),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(createFlightSearch.execute).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Ya existe una alerta con ese nombre'), expect.any(Object));
  });

  it('allows creating the same name in a different telegramChatId', async () => {
    const { service, createFlightSearch, client, flightPriceWatch } = fixture({
      searches: [search({ name: 'Iron Maiden', telegramChatId: '999' })],
      state: state(CreateSearchStep.CONFIRMATION, completeDraft({ name: 'Iron Maiden' })),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(createFlightSearch.execute).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Iron Maiden',
      telegramChatId: '123',
    }));
    expect(client.sendMessage).toHaveBeenCalledWith('123', '✅ Alerta creada. Voy a consultar el precio actual...');
    expect(flightPriceWatch.runOnceForSearch).toHaveBeenCalledWith('search-1', { sendInitialSummary: true });
  });

  it('does not run initial watch when RUN_WATCH_AFTER_CREATE=false', async () => {
    const { service, client, flightPriceWatch } = fixture({
      runWatchAfterCreate: false,
      state: state(CreateSearchStep.CONFIRMATION, completeDraft()),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(flightPriceWatch.runOnceForSearch).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Alerta creada. La revisaré en la próxima ejecución programada.');
  });

  it('keeps alert created when initial watch fails', async () => {
    const { service, createFlightSearch, client, flightPriceWatch } = fixture({
      watchError: new Error('provider failed'),
      state: state(CreateSearchStep.CONFIRMATION, completeDraft()),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(createFlightSearch.execute).toHaveBeenCalled();
    expect(flightPriceWatch.runOnceForSearch).toHaveBeenCalledWith('search-1', { sendInitialSummary: true });
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'La alerta fue creada, pero no pude consultar el precio ahora. Lo intentaré en la próxima ejecución programada.');
  });

  it('responds clearly when initial watch finds no valid options', async () => {
    const { service, client } = fixture({
      watchResult: {
        activeSearches: 1,
        providerCodes: [FlightProviderCode.AEROLINEAS_ARGENTINAS],
        snapshotsSaved: 0,
        alertsGenerated: 0,
        watchRunsSaved: 1,
        notificationsSent: 0,
        notificationAttempts: 0,
        notificationSuccesses: 0,
        notificationFailures: 0,
        errors: 0,
        noResultsRuns: 1,
        validOptionsFound: 0,
      },
      state: state(CreateSearchStep.CONFIRMATION, completeDraft()),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Alerta creada. No encontré vuelos válidos para esta búsqueda por ahora.');
  });

  it('blocks creating more alerts when MAX_SEARCHES_PER_USER is reached', async () => {
    const { service, createFlightSearch, client } = fixture({
      searches: [1, 2, 3, 4, 5].map((index) => search({ id: `search-${index}`, name: `Viaje ${index}`, telegramChatId: '123' })),
      state: state(CreateSearchStep.CONFIRMATION, completeDraft({ name: 'Viaje 6' })),
    });

    await service.processUpdate(callbackUpdate('create:confirm'));

    expect(createFlightSearch.execute).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Llegaste al límite de 5 alertas activas.');
  });

  it('captures callback errors and responds with a friendly message', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });
    manageSearches.pauseByDisplayIndex.mockRejectedValueOnce(new Error('boom'));

    await service.processUpdate(callbackUpdate('search:pause:1'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Ocurrió un error procesando la operación. Probá de nuevo en unos minutos.');
  });

  it('handleUpdateError does not throw if sending the friendly message fails', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });
    manageSearches.pauseByDisplayIndex.mockRejectedValueOnce(new Error('boom'));
    client.sendMessage.mockRejectedValue(new Error('fetch failed'));

    await expect(service.processUpdate(callbackUpdate('search:pause:1'))).resolves.toBeUndefined();
  });

  it('does not use conversation state from another chat', async () => {
    const { service, client, conversations } = fixture({
      state: new TelegramConversationState({
        chatId: '999',
        currentCommand: TelegramConversationCommand.CREATE_SEARCH,
        step: CreateSearchStep.NAME,
        draft: {},
        expiresAt: new Date(Date.now() + 15 * 60 * 1000),
      }),
    });

    await service.processUpdate(update('Iron Maiden'));

    expect(conversations.findByChatId).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('Comando no reconocido'));
  });

  it('cancels and clears conversation state', async () => {
    const { service, conversations, client } = fixture({ state: state(CreateSearchStep.NAME, {}) });

    await service.processUpdate(update('/cancelar'));

    expect(conversations.deleteByChatId).toHaveBeenCalledWith('123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Creación cancelada.');
  });

  it('does not process the same update twice when processUpdate is called directly', async () => {
    const { service, client } = fixture();
    const telegramUpdate = update('/help', 123, 99);

    await service.processUpdate(telegramUpdate);
    await service.processUpdate(telegramUpdate);

    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('/ver without index explains usage', async () => {
    const { service, client } = fixture();

    await service.processUpdate(update('/ver'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Usá /ver 1 para ver el detalle de una búsqueda.');
  });

  it('/ver with valid index shows search details', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ telegramChatId: '123', providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS })],
    });

    await service.processUpdate(update('/ver 1'));

    expect(manageSearches.getByDisplayIndex).toHaveBeenCalledWith(1, '123');
    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('🔎 Viaje Octubre');
    expect(message).toContain('✈️ Ruta');
    expect(message).toContain('JUJ → AEP → JUJ');
    expect(message).toContain('San Salvador de Jujuy ↔ Aeroparque');
    expect(message).toContain('📅 Fechas');
    expect(message).toContain('10/10/2026 al 15/10/2026');
    expect(message).toContain('Ida y vuelta · 1 adulto');
    expect(message).toContain('⚙️ Estado');
    expect(message).toContain('Activa');
    expect(message).toContain('Proveedor: Aerolíneas Argentinas');
    expect(message).toContain('Precio objetivo: sin definir');
    expect(message).toContain('Todavía no hay consultas registradas.');
    expect(message).not.toContain('AEROLINEAS_ARGENTINAS');
    expect(message).not.toContain('undefined');
  });

  it('/ver with invalid index shows a clear error', async () => {
    const { service, client } = fixture({ searches: [] });

    await service.processUpdate(update('/ver 9'));

    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
  });

  it('/pausar changes isActive=false', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(update('/pausar 1'));

    expect(manageSearches.pauseByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '⏸️ Pausé la búsqueda Viaje Octubre.');
  });

  it('/pausar does not affect searches from another chat', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ name: 'Otro chat', telegramChatId: '999' })],
    });

    await service.processUpdate(update('/pausar 1'));

    expect(manageSearches.pauseByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
  });

  it('/activar changes isActive=true', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ isActive: false, telegramChatId: '123' })] });

    await service.processUpdate(update('/activar 1'));

    expect(manageSearches.activateByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '▶️ Activé la búsqueda Viaje Octubre.');
  });

  it('/borrar soft deletes the search', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(update('/borrar 1'));

    expect(manageSearches.softDeleteByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '🗑️ Alerta borrada: Viaje Octubre.');
  });

  it('/borrar does not affect searches from another chat', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ name: 'Otro chat', telegramChatId: '999' })],
    });

    await service.processUpdate(update('/borrar 1'));

    expect(manageSearches.softDeleteByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
  });

  it('delete callback asks for confirmation without deleting', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('search:delete:1'));

    expect(manageSearches.getByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(manageSearches.softDeleteByDisplayIndex).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', '¿Seguro que querés borrar "Viaje Octubre"?', {
      replyMarkup: {
        inline_keyboard: [
          [{ text: '✅ Sí, borrar', callback_data: 'search:confirm_delete:1' }],
          [{ text: '❌ Cancelar', callback_data: 'search:cancel_delete:1' }],
        ],
      },
    });
  });

  it('confirm delete callback soft deletes the search', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('search:confirm_delete:1'));

    expect(manageSearches.softDeleteByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', '🗑️ Alerta borrada: Viaje Octubre.');
  });

  it('cancel delete callback does not delete and returns to the list', async () => {
    const { service, client, manageSearches } = fixture({ searches: [search({ telegramChatId: '123' })] });

    await service.processUpdate(callbackUpdate('search:cancel_delete:1'));

    expect(manageSearches.softDeleteByDisplayIndex).not.toHaveBeenCalled();
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'Operación cancelada.');
    expect(client.sendMessage).toHaveBeenCalledWith('123', expect.stringContaining('📋 Mis alertas'), expect.any(Object));
  });

  it('delete confirmation does not affect searches from another chat', async () => {
    const { service, client, manageSearches } = fixture({
      searches: [search({ name: 'Otro chat', telegramChatId: '999' })],
    });

    await service.processUpdate(callbackUpdate('search:confirm_delete:1'));

    expect(manageSearches.softDeleteByDisplayIndex).toHaveBeenCalledWith(1, '123');
    expect(client.sendMessage).toHaveBeenCalledWith('123', 'No encontré esa búsqueda. Usá /listar para ver los números disponibles.');
  });

  it('/listar does not show deleted searches', async () => {
    const { service, client } = fixture({
      searches: [
        search({ telegramChatId: '123' }),
        search({ name: 'Borrada', telegramChatId: '123', deletedAt: new Date('2026-05-24T00:00:00.000Z') }),
      ],
    });

    await service.processUpdate(update('/listar'));

    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Viaje Octubre');
    expect(message).not.toContain('Borrada');
  });

  it('/ver shows latest watch run when present', async () => {
    const { service, client, latestWatchRun } = fixture({
      searches: [search({ telegramChatId: '123', providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS })],
      latestRun: watchRun(),
    });

    await service.processUpdate(update('/ver 1'));

    expect(latestWatchRun.execute).toHaveBeenCalledWith('search-1');
    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Última consulta — 24/05/2026');
    expect(message).toContain('💰 Precio más barato');
    expect(message).toContain('$230.000 ARS');
    expect(message).toContain('⭐ Recomendado');
    expect(message).toContain('$240.000 ARS · Base');
    expect(message).toContain('Ida recomendada:');
    expect(message).toContain('AR1517 | JUJ → AEP');
    expect(message).toContain('10/10/2026 12:00');
    expect(message).toContain('Vuelta recomendada:');
    expect(message).toContain('AR1512 | AEP → JUJ');
    expect(message).toContain('15/10/2026 08:00');
    expect(message).toContain('✅ Opciones válidas: 5');
    expect(message).not.toContain('2026-10-10T12:00:00');
  });

  it('/ver one way does not show return flight details', async () => {
    const { service, client } = fixture({
      searches: [search({
        telegramChatId: '123',
        returnDate: undefined,
        tripType: TripType.ONE_WAY,
        providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
      })],
      latestRun: watchRun({ returnDate: undefined, inboundSummary: undefined }),
    });

    await service.processUpdate(update('/ver 1'));

    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('JUJ → AEP');
    expect(message).toContain('Solo ida · 1 adulto');
    expect(message).toContain('Ida recomendada:');
    expect(message).not.toContain('Vuelta recomendada:');
  });

  it('/ver paused search shows Pausada', async () => {
    const { service, client } = fixture({
      searches: [search({ telegramChatId: '123', isActive: false })],
    });

    await service.processUpdate(update('/ver 1'));

    const message = (client.sendMessage as jest.Mock).mock.calls[0][1] as string;
    expect(message).toContain('Pausada');
  });

  it('defines TTL for conversation expiration', () => {
    const ttlIndexes = TelegramConversationStateSchema.indexes()
      .filter(([, options]) => options?.expireAfterSeconds === 0);

    expect(TelegramConversationStateSchema.path('expiresAt')).toBeDefined();
    expect(ttlIndexes).toContainEqual([{ expiresAt: 1 }, expect.objectContaining({ expireAfterSeconds: 0 })]);
  });
});

function fixture(params: {
  searches?: FlightSearch[];
  updates?: TelegramBotUpdate[][];
  state?: TelegramConversationState | null;
  latestRun?: FlightWatchRun | null;
  allowedChatIds?: string[];
  legacyAllowedChatId?: string;
  adminChatIds?: string[];
  accessMode?: string;
  botUsers?: BotUser[];
  runWatchAfterCreate?: boolean;
  manualWatchCooldownMinutes?: number;
  watchResult?: object;
  watchError?: Error;
} = {}): {
  service: TelegramBotService;
  client: jest.Mocked<TelegramBotClient>;
  createFlightSearch: jest.Mocked<CreateFlightSearchUseCase>;
  manageSearches: jest.Mocked<ManageFlightSearchesUseCase>;
  latestWatchRun: jest.Mocked<GetLatestWatchRunUseCase>;
  flightPriceWatch: jest.Mocked<FlightPriceWatchService>;
  conversations: jest.Mocked<TelegramConversationStateRepository>;
  botUsers: jest.Mocked<BotUserRepository>;
} {
  let currentState = params.state ?? null;
  let searches = (params.searches ?? []).filter((item) => !item.deletedAt);
  const visibleSearches = (chatId?: string): FlightSearch[] => searches.filter((item) => {
    const itemChatId = item.telegramChatId;
    return Boolean(chatId) && itemChatId === chatId;
  });
  const client = {
    getUpdates: jest.fn()
      .mockResolvedValueOnce(params.updates?.[0] ?? [])
      .mockResolvedValueOnce(params.updates?.[1] ?? []),
    sendMessage: jest.fn().mockResolvedValue(undefined),
    answerCallbackQuery: jest.fn().mockResolvedValue(undefined),
  } as unknown as jest.Mocked<TelegramBotClient>;
  const createFlightSearch = {
    execute: jest.fn().mockResolvedValue(search()),
  } as unknown as jest.Mocked<CreateFlightSearchUseCase>;
  const manageSearches = {
    listManageable: jest.fn(async (chatId?: string) => visibleSearches(chatId)),
    getByDisplayIndex: jest.fn(async (index: number, chatId?: string) => visibleSearches(chatId)[index - 1] ?? null),
    findByIdForChat: jest.fn(async (id: string, chatId?: string) => visibleSearches(chatId).find((item) => item.id === id) ?? null),
    pauseByDisplayIndex: jest.fn(async (index: number, chatId?: string) => {
      const item = visibleSearches(chatId)[index - 1];
      return item ? search({ ...item.toPrimitives(), isActive: false }) : null;
    }),
    activateByDisplayIndex: jest.fn(async (index: number, chatId?: string) => {
      const item = visibleSearches(chatId)[index - 1];
      return item ? search({ ...item.toPrimitives(), isActive: true }) : null;
    }),
    softDeleteByDisplayIndex: jest.fn(async (index: number, chatId?: string) => {
      const item = visibleSearches(chatId)[index - 1];
      if (!item) {
        return null;
      }
      searches = searches.filter((candidate) => candidate.id !== item.id);
      return search({ ...item.toPrimitives(), isActive: false, deletedAt: new Date('2026-05-24T00:00:00.000Z') });
    }),
    softDeleteByIdForChat: jest.fn(async (id: string, chatId?: string) => {
      const item = visibleSearches(chatId).find((candidate) => candidate.id === id);
      if (!item) {
        return null;
      }
      searches = searches.filter((candidate) => candidate.id !== item.id);
      return search({ ...item.toPrimitives(), isActive: false, deletedAt: new Date('2026-05-24T00:00:00.000Z') });
    }),
    touchManualWatchByDisplayIndex: jest.fn(async (index: number, chatId?: string, watchedAt?: Date) => {
      const item = visibleSearches(chatId)[index - 1];
      return item ? search({ ...item.toPrimitives(), lastManualWatchAt: watchedAt }) : null;
    }),
    renewByDisplayIndex: jest.fn(async (index: number, chatId?: string) => {
      const item = visibleSearches(chatId)[index - 1];
      return item ? search({
        ...item.toPrimitives(),
        isActive: true,
        requiresRenewal: false,
        notificationCountSinceRenewal: 0,
      }) : null;
    }),
    renewById: jest.fn(async (id: string, chatId?: string) => {
      const item = visibleSearches(chatId).find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive: true, requiresRenewal: false, notificationCountSinceRenewal: 0 }) : null;
    }),
    keepPausedById: jest.fn(async (id: string, chatId?: string) => {
      const item = visibleSearches(chatId).find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive: false, requiresRenewal: false }) : null;
    }),
    markPurchasedById: jest.fn(async (id: string, chatId?: string) => {
      const item = visibleSearches(chatId).find((candidate) => candidate.id === id);
      return item ? search({ ...item.toPrimitives(), isActive: false, requiresRenewal: false }) : null;
    }),
  } as unknown as jest.Mocked<ManageFlightSearchesUseCase>;
  const latestWatchRun = {
    execute: jest.fn().mockResolvedValue(params.latestRun ?? null),
  } as unknown as jest.Mocked<GetLatestWatchRunUseCase>;
  const flightPriceWatch = {
    runOnceForSearch: params.watchError
      ? jest.fn().mockRejectedValue(params.watchError)
      : jest.fn().mockResolvedValue(params.watchResult ?? {
        activeSearches: 1,
        providerCodes: [FlightProviderCode.AEROLINEAS_ARGENTINAS],
        snapshotsSaved: 0,
        alertsGenerated: 0,
        watchRunsSaved: 1,
        notificationsSent: 0,
        notificationAttempts: 0,
        notificationSuccesses: 0,
        notificationFailures: 0,
        errors: 0,
        noResultsRuns: 0,
        validOptionsFound: 1,
      }),
  } as unknown as jest.Mocked<FlightPriceWatchService>;
  const conversations = {
    findByChatId: jest.fn(async (chatId: string) => currentState?.chatId === chatId ? currentState : null),
    upsert: jest.fn(async (nextState: TelegramConversationState) => {
      currentState = nextState;
      return nextState;
    }),
    deleteByChatId: jest.fn(async () => {
      currentState = null;
    }),
  } as unknown as jest.Mocked<TelegramConversationStateRepository>;
  let users = params.botUsers ?? [];
  const botUsers = {
    findByChatId: jest.fn(async (chatId: string) => users.find((user) => user.telegramChatId === chatId) ?? null),
    upsert: jest.fn(async (user: BotUser) => {
      users = users.filter((item) => item.telegramChatId !== user.telegramChatId);
      users.push(user);
      return user;
    }),
    updateStatus: jest.fn(async (chatId: string, status: BotUserStatus, approvedBy?: string) => {
      const existing = users.find((user) => user.telegramChatId === chatId);
      if (!existing) {
        return null;
      }
      const updated = botUser({
        ...existing.toPrimitives(),
        status,
        approvedBy,
        approvedAt: status === BotUserStatus.APPROVED ? new Date('2026-05-24T00:00:00.000Z') : existing.approvedAt,
      });
      users = users.map((user) => user.telegramChatId === chatId ? updated : user);
      return updated;
    }),
    findByStatus: jest.fn(async (status: BotUserStatus) => users.filter((user) => user.status === status)),
  } as unknown as jest.Mocked<BotUserRepository>;
  const config = {
    get: jest.fn((key: string) => {
      if (key === 'telegramAllowedChatId') {
        return params.legacyAllowedChatId ?? '123';
      }
      if (key === 'telegramAllowedChatIds') {
        return params.allowedChatIds ?? ['123'];
      }
      if (key === 'telegramAdminChatIds') {
        return params.adminChatIds ?? [];
      }
      if (key === 'telegramAccessMode') {
        return params.accessMode ?? 'approval';
      }
      if (key === 'enableTelegramBot') {
        return true;
      }
      if (key === 'telegramPollingIntervalMs') {
        return 3000;
      }
      if (key === 'enableVerboseWatchLogs') {
        return false;
      }
      if (key === 'nodeEnv') {
        return 'test';
      }
      if (key === 'runWatchAfterCreate') {
        return params.runWatchAfterCreate ?? true;
      }
      if (key === 'maxSearchesPerUser') {
        return 5;
      }
      if (key === 'manualWatchCooldownMinutes') {
        return params.manualWatchCooldownMinutes ?? 10;
      }
      if (key === 'enableScheduler') {
        return true;
      }
      return undefined;
    }),
  } as unknown as ConfigService;
  const accessControl = new TelegramAccessControlService(config, botUsers);

  return {
    service: new TelegramBotService(
      config,
      client,
      createFlightSearch,
      manageSearches,
      latestWatchRun,
      flightPriceWatch,
      new AirportResolverService(),
      accessControl,
      conversations,
    ),
    client,
    createFlightSearch,
    manageSearches,
    latestWatchRun,
    flightPriceWatch,
    conversations,
    botUsers,
  };
}

function update(text: string, chatId = 123, updateId = 1): TelegramBotUpdate {
  return {
    update_id: updateId,
    message: {
      chat: { id: chatId },
      from: { id: chatId, first_name: 'Tester', username: 'tester' },
      text,
    },
  };
}

function callbackUpdate(data: string, chatId = 123, updateId = 1): TelegramBotUpdate {
  return {
    update_id: updateId,
    callback_query: {
      id: 'callback-1',
      data,
      from: { id: chatId, first_name: 'Tester', username: 'tester' },
      message: {
        chat: { id: chatId },
      },
    },
  };
}

function state(step: CreateSearchStep, draft: CreateSearchDraft): TelegramConversationState {
  return new TelegramConversationState({
    chatId: '123',
    currentCommand: TelegramConversationCommand.CREATE_SEARCH,
    step,
    draft,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
  });
}

function botUser(props: Partial<{
  telegramChatId: string;
  firstName: string;
  lastName: string;
  username: string;
  status: BotUserStatus;
  isAdmin: boolean;
  approvedAt: Date;
  approvedBy: string;
  createdAt: Date;
}> = {}): BotUser {
  return new BotUser({
    telegramChatId: props.telegramChatId ?? '123',
    firstName: props.firstName ?? 'Tester',
    lastName: props.lastName,
    username: props.username ?? 'tester',
    status: props.status ?? BotUserStatus.APPROVED,
    isAdmin: props.isAdmin,
    approvedAt: props.approvedAt,
    approvedBy: props.approvedBy,
    createdAt: props.createdAt ?? new Date('2026-05-24T00:00:00.000Z'),
  });
}

function completeDraft(overrides: Partial<CreateSearchDraft> = {}): CreateSearchDraft {
  return {
    name: 'Viaje Test',
    origin: 'JUJ',
    destination: 'AEP',
    tripType: TripType.ROUND_TRIP,
    departureDate: new Date('2026-10-10T12:00:00.000Z').toISOString(),
    returnDate: new Date('2026-10-15T12:00:00.000Z').toISOString(),
    adults: 1,
    ...overrides,
  };
}

function search(overrides: Partial<ReturnType<FlightSearch['toPrimitives']>> = {}): FlightSearch {
  return new FlightSearch({
    id: 'search-1',
    name: 'Viaje Octubre',
    origin: 'JUJ',
    destination: 'AEP',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    returnDate: new Date('2026-10-15T12:00:00.000Z'),
    tripType: TripType.ROUND_TRIP,
    cabinClass: CabinClass.ECONOMY,
    currency: Currency.ARS,
    adults: 1,
    notifyOnPriceDrop: true,
    notifyAlways: true,
    isActive: true,
    ...overrides,
  });
}

function watchRun(overrides: {
  returnDate?: Date;
  inboundSummary?: string;
} = {}): FlightWatchRun {
  return new FlightWatchRun({
    id: 'run-1',
    searchId: 'search-1',
    providerCode: FlightProviderCode.AEROLINEAS_ARGENTINAS,
    ranAt: new Date('2026-05-24T12:00:00.000Z'),
    status: FlightWatchRunStatus.SUCCESS,
    route: 'JUJ-AEP',
    departureDate: new Date('2026-10-10T12:00:00.000Z'),
    returnDate: Object.prototype.hasOwnProperty.call(overrides, 'returnDate')
      ? overrides.returnDate
      : new Date('2026-10-15T12:00:00.000Z'),
    validOptionsCount: 5,
    currency: Currency.ARS,
    cheapestPrice: 230_000,
    recommendedPrice: 240_000,
    cheapestOptionCount: 1,
    topOptions: [],
    recommendedOption: {
      price: 240_000,
      currency: Currency.ARS,
      fareName: 'Base',
      seatsAvailable: 3,
      outboundSummary: 'AR1517 JUJ-AEP 2026-10-10T12:00:00',
      inboundSummary: Object.prototype.hasOwnProperty.call(overrides, 'inboundSummary')
        ? overrides.inboundSummary
        : 'AR1512 AEP-JUJ 2026-10-15T08:00:00',
      tags: ['RECOMMENDED'],
    },
  });
}
