export function localTelegramAccessWarnings(params: {
  enableTelegramBot: boolean;
  accessMode: string;
  adminChatCount: number;
  allowedChatCount: number;
  legacyAllowedChatConfigured: boolean;
}): string[] {
  const warnings: string[] = [];
  if (params.enableTelegramBot && params.accessMode === 'approval' && params.adminChatCount === 0) {
    warnings.push('No TELEGRAM_ADMIN_CHAT_IDS configured. Las solicitudes no podrán notificarse.');
  }
  if (params.enableTelegramBot && (params.allowedChatCount > 0 || params.legacyAllowedChatConfigured)) {
    warnings.push('Legacy allowlist configured. TELEGRAM_ADMIN_CHAT_IDS is the official admin variable; TELEGRAM_ALLOWED_CHAT_IDS/TELEGRAM_ALLOWED_CHAT_ID are legacy allowlists.');
  }
  return warnings;
}
