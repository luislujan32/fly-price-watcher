import { LogLevel } from '@nestjs/common';

export function resolveNestLogLevels(level = process.env.LOG_LEVEL ?? 'info'): LogLevel[] {
  const normalized = level.trim().toLowerCase();
  const levels: Record<string, LogLevel[]> = {
    silent: [],
    error: ['error', 'fatal'],
    warn: ['error', 'warn', 'fatal'],
    info: ['log', 'error', 'warn', 'fatal'],
    log: ['log', 'error', 'warn', 'fatal'],
    debug: ['log', 'error', 'warn', 'debug', 'fatal'],
    verbose: ['log', 'error', 'warn', 'debug', 'verbose', 'fatal'],
  };

  return levels[normalized] ?? levels.info;
}
