const DEFAULT_DAILY_RUN_TIME = '08:00';
export const DEFAULT_APP_TIMEZONE = 'America/Argentina/Buenos_Aires';

export type DailyScheduleConfig = {
  cron: string;
  timeZone: string;
};

export function resolveDailyRunTime(env: NodeJS.ProcessEnv = process.env): string {
  return env.DAILY_RUN_TIME?.trim() || DEFAULT_DAILY_RUN_TIME;
}

export function dailyCronFromRunTime(runTime: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(runTime.trim());
  if (!match) {
    throw new Error('DAILY_RUN_TIME must use HH:mm format, for example 08:00.');
  }

  const [, hour, minute] = match;
  return `${Number(minute)} ${Number(hour)} * * *`;
}

export function resolveDailyCronExpression(env: NodeJS.ProcessEnv = process.env): string {
  const advancedCron = env.DAILY_CRON?.trim();
  if (advancedCron) {
    return advancedCron;
  }

  return dailyCronFromRunTime(resolveDailyRunTime(env));
}

export function resolveAppTimezone(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_TIMEZONE?.trim() || DEFAULT_APP_TIMEZONE;
}

export function isValidTimezone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone }).format();
    return true;
  } catch {
    return false;
  }
}

export function timezoneValidationErrors(timeZone: string): string[] {
  return isValidTimezone(timeZone)
    ? []
    : [`APP_TIMEZONE "${timeZone}" is invalid. Use a valid IANA timezone, for example ${DEFAULT_APP_TIMEZONE}.`];
}

export function resolveDailySchedule(env: NodeJS.ProcessEnv = process.env): DailyScheduleConfig {
  const timeZone = resolveAppTimezone(env);
  const [timezoneError] = timezoneValidationErrors(timeZone);
  if (timezoneError) {
    throw new Error(timezoneError);
  }
  return {
    cron: resolveDailyCronExpression(env),
    timeZone,
  };
}
