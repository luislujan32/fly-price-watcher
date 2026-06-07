import {
  DEFAULT_APP_TIMEZONE,
  dailyCronFromRunTime,
  isValidTimezone,
  resolveAppTimezone,
  resolveDailyCronExpression,
  resolveDailySchedule,
  timezoneValidationErrors,
} from '../../../src/shared/config/cron.config';

describe('cron config', () => {
  it('parses DAILY_RUN_TIME into a cron expression', () => {
    expect(dailyCronFromRunTime('08:00')).toBe('0 8 * * *');
    expect(dailyCronFromRunTime('22:52')).toBe('52 22 * * *');
  });

  it('prioritizes DAILY_CRON over DAILY_RUN_TIME', () => {
    expect(resolveDailyCronExpression({ DAILY_CRON: '15 9 * * *', DAILY_RUN_TIME: '22:52' })).toBe('15 9 * * *');
  });

  it('uses Argentina as the default timezone', () => {
    expect(resolveAppTimezone({})).toBe(DEFAULT_APP_TIMEZONE);
  });

  it('keeps DAILY_RUN_TIME in the configured timezone', () => {
    expect(resolveDailySchedule({
      DAILY_RUN_TIME: '08:00',
      APP_TIMEZONE: 'America/Argentina/Buenos_Aires',
    })).toEqual({
      cron: '0 8 * * *',
      timeZone: 'America/Argentina/Buenos_Aires',
    });
  });

  it('applies APP_TIMEZONE when DAILY_CRON is used', () => {
    expect(resolveDailySchedule({
      DAILY_CRON: '15 9 * * *',
      APP_TIMEZONE: 'Europe/Berlin',
    })).toEqual({
      cron: '15 9 * * *',
      timeZone: 'Europe/Berlin',
    });
  });

  it('rejects an invalid timezone for checks and scheduling', () => {
    expect(isValidTimezone('Argentina/Not-Real')).toBe(false);
    expect(timezoneValidationErrors('Argentina/Not-Real')).toEqual([
      'APP_TIMEZONE "Argentina/Not-Real" is invalid. Use a valid IANA timezone, for example America/Argentina/Buenos_Aires.',
    ]);
    expect(() => resolveDailySchedule({ APP_TIMEZONE: 'Argentina/Not-Real' }))
      .toThrow('APP_TIMEZONE "Argentina/Not-Real" is invalid');
  });

  it('rejects invalid run time', () => {
    expect(() => dailyCronFromRunTime('25:99')).toThrow('DAILY_RUN_TIME must use HH:mm format');
  });
});
