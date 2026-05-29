import { resolveDailyCronExpression, resolveDailyRunTime } from './cron.config';
import { parseTelegramAdminChatIds, parseTelegramAllowedChatIds } from './telegram-access.config';

export const appConfig = () => ({
  nodeEnv: process.env.NODE_ENV ?? 'development',
  logLevel: process.env.LOG_LEVEL ?? 'info',
  enableVerboseWatchLogs: process.env.ENABLE_VERBOSE_WATCH_LOGS === 'true',
  port: Number(process.env.PORT ?? 3000),
  dataRetentionDaysAfterTrip: Number(process.env.DATA_RETENTION_DAYS_AFTER_TRIP ?? 30),
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/flight-price-watcher',
  enableScheduler: process.env.ENABLE_SCHEDULER !== 'false',
  enableTelegramBot: process.env.ENABLE_TELEGRAM_BOT === 'true',
  dailyRunTime: resolveDailyRunTime(),
  dailyCron: resolveDailyCronExpression(),
  enabledFlightProviders: (process.env.ENABLED_FLIGHT_PROVIDERS ?? 'FAKE')
    .split(',')
    .map((provider) => provider.trim())
    .filter(Boolean),
  notificationChannels: (process.env.NOTIFICATION_CHANNELS ?? 'console')
    .split(',')
    .map((channel) => channel.trim())
    .filter(Boolean),
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChatId: process.env.TELEGRAM_CHAT_ID,
  telegramParseMode: process.env.TELEGRAM_PARSE_MODE ?? 'none',
  telegramAccessMode: process.env.TELEGRAM_ACCESS_MODE ?? 'approval',
  telegramAdminChatIds: parseTelegramAdminChatIds(),
  telegramAllowedChatIds: parseTelegramAllowedChatIds(),
  telegramAllowedChatId: process.env.TELEGRAM_ALLOWED_CHAT_ID,
  telegramPollingIntervalMs: Number(process.env.TELEGRAM_POLLING_INTERVAL_MS ?? 3000),
  telegramHttpTimeoutMs: Number(process.env.TELEGRAM_HTTP_TIMEOUT_MS ?? 10000),
  telegramHttpRetries: Number(process.env.TELEGRAM_HTTP_RETRIES ?? 1),
  telegramWizardTtlMinutes: Number(process.env.TELEGRAM_WIZARD_TTL_MINUTES ?? 15),
  runWatchAfterCreate: process.env.RUN_WATCH_AFTER_CREATE !== 'false',
  maxSearchesPerUser: Number(process.env.MAX_SEARCHES_PER_USER ?? 5),
  forceDailySummary: process.env.FORCE_DAILY_SUMMARY === 'true',
  persistPriceSnapshots: process.env.PERSIST_PRICE_SNAPSHOTS === 'true',
  persistProviderDiagnostics: process.env.PERSIST_PROVIDER_DIAGNOSTICS === 'true',
  fakeProviderScenario: process.env.FAKE_PROVIDER_SCENARIO ?? 'normal',
  aerolineasApiBaseUrl: process.env.AEROLINEAS_API_BASE_URL ?? 'https://api.aerolineas.com.ar',
  aerolineasWebBaseUrl: process.env.AEROLINEAS_WEB_BASE_URL ?? 'https://www.aerolineas.com.ar',
  aerolineasHttpTimeoutMs: Number(process.env.AEROLINEAS_HTTP_TIMEOUT_MS ?? 15000),
  aerolineasHttpRetries: Number(process.env.AEROLINEAS_HTTP_RETRIES ?? 1),
  aerolineasTokenTtlSeconds: Number(process.env.AEROLINEAS_TOKEN_TTL_SECONDS ?? 900),
  jetsmartApiBaseUrl: process.env.JETSMART_API_BASE_URL ?? 'https://origin.jsrtff.it.jetsm.art',
  jetsmartHttpTimeoutMs: Number(process.env.JETSMART_HTTP_TIMEOUT_MS ?? 15000),
  jetsmartHttpRetries: Number(process.env.JETSMART_HTTP_RETRIES ?? 1),
  jetsmartPointOfSaleCountry: process.env.JETSMART_POINT_OF_SALE_COUNTRY ?? 'AR',
  maxQuotesPerSearch: Number(process.env.MAX_QUOTES_PER_SEARCH ?? 5),
  maxLegOptionsInAlert: Number(process.env.MAX_LEG_OPTIONS_IN_ALERT ?? 3),
});
