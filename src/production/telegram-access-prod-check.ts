export function validateProductionTelegramAccessConfig(params: {
  enableTelegramBot: boolean;
  accessMode: string;
  adminChatCount: number;
  allowedChatCount: number;
}): string[] {
  const errors: string[] = [];
  if (params.enableTelegramBot && (params.accessMode === 'approval' || params.accessMode === 'closed') && params.adminChatCount === 0) {
    errors.push('TELEGRAM_ADMIN_CHAT_IDS is required when ENABLE_TELEGRAM_BOT=true and TELEGRAM_ACCESS_MODE is approval or closed in production.');
  }
  if (params.enableTelegramBot && params.accessMode === 'closed' && params.allowedChatCount === 0 && params.adminChatCount === 0) {
    errors.push('TELEGRAM_ALLOWED_CHAT_IDS or TELEGRAM_ADMIN_CHAT_IDS is required when TELEGRAM_ACCESS_MODE=closed.');
  }
  return errors;
}

export function productionTelegramAccessWarnings(params: {
  enableTelegramBot: boolean;
  accessMode: string;
}): string[] {
  if (params.enableTelegramBot && params.accessMode === 'open') {
    return ['TELEGRAM_ACCESS_MODE=open: cualquier usuario podrá usar el bot. Usalo sólo si realmente querés acceso público.'];
  }
  return [];
}
