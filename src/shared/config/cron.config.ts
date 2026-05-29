const DEFAULT_DAILY_RUN_TIME = '08:00';

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
