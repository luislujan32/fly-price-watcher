import {
  getTelegramBotMe,
  getTelegramBotCommands,
  setTelegramBotCommands,
  TELEGRAM_BOT_COMMANDS,
} from '../../../src/telegram-bot/application/telegram-bot-commands';
import { sendTelegramAdminNotification } from '../../../src/telegram-bot/application/telegram-admin-notification';

describe('telegram bot commands', () => {
  it('defines the command menu registered in Telegram', () => {
    expect(TELEGRAM_BOT_COMMANDS).toEqual([
      { command: 'start', description: 'Iniciar el bot' },
      { command: 'ayuda', description: 'Ver ayuda' },
      { command: 'crear', description: 'Crear una alerta de vuelo' },
      { command: 'listar', description: 'Ver mis alertas' },
      { command: 'estado', description: 'Ver estado del bot' },
      { command: 'cancelar', description: 'Cancelar operación actual' },
      { command: 'mi_chat_id', description: 'Ver tu chatId' },
    ]);
    expect(TELEGRAM_BOT_COMMANDS.map((item) => item.command)).not.toContain('sync_admins');
  });

  it('registers commands through Telegram setMyCommands', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true, result: true }),
    });

    await setTelegramBotCommands('token', fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledWith('https://api.telegram.org/bottoken/setMyCommands', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
    });
  });

  it('fails clearly when TELEGRAM_BOT_TOKEN is missing', async () => {
    await expect(setTelegramBotCommands('   ', jest.fn() as unknown as typeof fetch))
      .rejects
      .toThrow('TELEGRAM_BOT_TOKEN is required to set Telegram bot commands.');
  });

  it('surfaces Telegram API errors', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: jest.fn().mockResolvedValue('Unauthorized'),
    });

    await expect(setTelegramBotCommands('token', fetchFn as unknown as typeof fetch))
      .rejects
      .toThrow('Telegram setMyCommands error: 401 Unauthorized');
  });

  it('reads registered commands through Telegram getMyCommands', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true, result: TELEGRAM_BOT_COMMANDS }),
    });

    const commands = await getTelegramBotCommands('token', fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledWith('https://api.telegram.org/bottoken/getMyCommands');
    expect(commands).toEqual(TELEGRAM_BOT_COMMANDS);
  });

  it('checks bot identity through Telegram getMe', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({
        ok: true,
        result: { id: 123, is_bot: true, first_name: 'Flight Watcher', username: 'flight_bot' },
      }),
    });

    const me = await getTelegramBotMe('token', fetchFn as unknown as typeof fetch);

    expect(fetchFn).toHaveBeenCalledWith('https://api.telegram.org/bottoken/getMe');
    expect(me.username).toBe('flight_bot');
  });

  it('handles empty admin notification list without sending', async () => {
    const fetchFn = jest.fn();

    const result = await sendTelegramAdminNotification({
      token: 'token',
      adminChatIds: [],
      text: 'test',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result).toEqual({ attempts: 0, successes: 0, failures: [] });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('sends admin notification to multiple admins', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: jest.fn().mockResolvedValue({ ok: true, result: {} }),
    });

    const result = await sendTelegramAdminNotification({
      token: 'token',
      adminChatIds: ['111', '222'],
      text: '✅ Test de notificación admin OK',
      fetchFn: fetchFn as unknown as typeof fetch,
    });

    expect(result).toEqual({ attempts: 2, successes: 2, failures: [] });
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(fetchFn).toHaveBeenCalledWith('https://api.telegram.org/bottoken/sendMessage', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ chat_id: '111', text: '✅ Test de notificación admin OK' }),
    }));
  });
});
