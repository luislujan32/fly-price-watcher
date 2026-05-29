export type TelegramAdminNotificationFailure = {
  chatId: string;
  error: string;
};

export type TelegramAdminNotificationResult = {
  attempts: number;
  successes: number;
  failures: TelegramAdminNotificationFailure[];
};

export async function sendTelegramAdminNotification(params: {
  token: string;
  adminChatIds: string[];
  text: string;
  fetchFn?: typeof fetch;
}): Promise<TelegramAdminNotificationResult> {
  const token = params.token.trim();
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is required.');
  }

  const fetchFn = params.fetchFn ?? fetch;
  const uniqueAdminChatIds = [...new Set(params.adminChatIds.map((chatId) => chatId.trim()).filter(Boolean))];
  const failures: TelegramAdminNotificationFailure[] = [];
  let successes = 0;

  for (const chatId of uniqueAdminChatIds) {
    try {
      const response = await fetchFn(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: params.text,
        }),
      });
      if (!response.ok) {
        throw new Error(`Telegram sendMessage error: ${response.status} ${await response.text()}`);
      }
      const body = await response.json() as { ok?: boolean; description?: string };
      if (!body.ok) {
        throw new Error(`Telegram sendMessage error: ${body.description ?? 'unknown error'}`);
      }
      successes += 1;
    } catch (error) {
      failures.push({
        chatId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    attempts: uniqueAdminChatIds.length,
    successes,
    failures,
  };
}
