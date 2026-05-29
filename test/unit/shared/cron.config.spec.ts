import {
  dailyCronFromRunTime,
  resolveDailyCronExpression,
} from '../../../src/shared/config/cron.config';

describe('cron config', () => {
  it('parses DAILY_RUN_TIME into a cron expression', () => {
    expect(dailyCronFromRunTime('08:00')).toBe('0 8 * * *');
    expect(dailyCronFromRunTime('22:52')).toBe('52 22 * * *');
  });

  it('prioritizes DAILY_CRON over DAILY_RUN_TIME', () => {
    expect(resolveDailyCronExpression({ DAILY_CRON: '15 9 * * *', DAILY_RUN_TIME: '22:52' })).toBe('15 9 * * *');
  });

  it('rejects invalid run time', () => {
    expect(() => dailyCronFromRunTime('25:99')).toThrow('DAILY_RUN_TIME must use HH:mm format');
  });
});
