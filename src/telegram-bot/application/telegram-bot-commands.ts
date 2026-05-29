export type TelegramBotCommand = {
  command: string;
  description: string;
};

type TelegramSetCommandsResponse = {
  ok?: boolean;
  description?: string;
};

type TelegramGetCommandsResponse = {
  ok?: boolean;
  result?: TelegramBotCommand[];
  description?: string;
};

export type TelegramBotMe = {
  id: number;
  is_bot: boolean;
  first_name: string;
  username?: string;
};

type TelegramGetMeResponse = {
  ok?: boolean;
  result?: TelegramBotMe;
  description?: string;
};

export const TELEGRAM_BOT_COMMANDS: TelegramBotCommand[] = [
  { command: 'start', description: 'Iniciar el bot' },
  { command: 'ayuda', description: 'Ver ayuda' },
  { command: 'crear', description: 'Crear una alerta de vuelo' },
  { command: 'listar', description: 'Ver mis alertas' },
  { command: 'estado', description: 'Ver estado del bot' },
  { command: 'cancelar', description: 'Cancelar operación actual' },
  { command: 'mi_chat_id', description: 'Ver tu chatId' },
];

export async function setTelegramBotCommands(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to set Telegram bot commands.');
  }

  const response = await fetchFn(`https://api.telegram.org/bot${normalizedToken}/setMyCommands`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ commands: TELEGRAM_BOT_COMMANDS }),
  });

  if (!response.ok) {
    throw new Error(`Telegram setMyCommands error: ${response.status} ${await response.text()}`);
  }

  const body = await response.json() as TelegramSetCommandsResponse;
  if (!body.ok) {
    throw new Error(`Telegram setMyCommands error: ${body.description ?? 'unknown error'}`);
  }
}

export async function getTelegramBotCommands(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramBotCommand[]> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to get Telegram bot commands.');
  }

  const response = await fetchFn(`https://api.telegram.org/bot${normalizedToken}/getMyCommands`);
  if (!response.ok) {
    throw new Error(`Telegram getMyCommands error: ${response.status} ${await response.text()}`);
  }

  const body = await response.json() as TelegramGetCommandsResponse;
  if (!body.ok) {
    throw new Error(`Telegram getMyCommands error: ${body.description ?? 'unknown error'}`);
  }
  return body.result ?? [];
}

export async function getTelegramBotMe(
  token: string,
  fetchFn: typeof fetch = fetch,
): Promise<TelegramBotMe> {
  const normalizedToken = token.trim();
  if (!normalizedToken) {
    throw new Error('TELEGRAM_BOT_TOKEN is required to call Telegram getMe.');
  }

  const response = await fetchFn(`https://api.telegram.org/bot${normalizedToken}/getMe`);
  if (!response.ok) {
    throw new Error(`Telegram getMe error: ${response.status} ${await response.text()}`);
  }

  const body = await response.json() as TelegramGetMeResponse;
  if (!body.ok || !body.result) {
    throw new Error(`Telegram getMe error: ${body.description ?? 'unknown error'}`);
  }
  return body.result;
}
