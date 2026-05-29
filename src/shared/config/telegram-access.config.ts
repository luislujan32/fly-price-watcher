export function parseTelegramAllowedChatIds(env: NodeJS.ProcessEnv = process.env): string[] {
  const values = [
    ...(env.TELEGRAM_ALLOWED_CHAT_IDS ?? '')
      .split(',')
      .map((chatId) => chatId.trim())
      .filter(Boolean),
    ...(env.TELEGRAM_ALLOWED_CHAT_ID ? [env.TELEGRAM_ALLOWED_CHAT_ID.trim()] : []),
  ].filter(Boolean);

  return [...new Set(values)];
}

export function parseTelegramAdminChatIds(env: NodeJS.ProcessEnv = process.env): string[] {
  return [...new Set(
    (env.TELEGRAM_ADMIN_CHAT_IDS ?? '')
      .split(',')
      .map((chatId) => chatId.trim())
      .filter(Boolean),
  )];
}
