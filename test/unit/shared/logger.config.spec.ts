import { resolveNestLogLevels } from '../../../src/shared/config/logger.config';

describe('resolveNestLogLevels', () => {
  it('maps info to production-friendly Nest log levels', () => {
    expect(resolveNestLogLevels('info')).toEqual(['log', 'error', 'warn', 'fatal']);
  });

  it('maps verbose to all useful Nest log levels', () => {
    expect(resolveNestLogLevels('verbose')).toEqual(['log', 'error', 'warn', 'debug', 'verbose', 'fatal']);
  });

  it('falls back to info for unknown values', () => {
    expect(resolveNestLogLevels('loud')).toEqual(['log', 'error', 'warn', 'fatal']);
  });
});
