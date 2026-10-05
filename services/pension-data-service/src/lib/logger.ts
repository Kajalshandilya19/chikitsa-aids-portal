import winston from 'winston';
import { getRequestContext } from './request-context';
import { redact } from './redact';

export type LogLevel = 'error' | 'warn' | 'info' | 'debug';

const contextFormat = winston.format((info) => {
  const ctx = getRequestContext();
  if (ctx) {
    for (const [k, v] of Object.entries(ctx)) {
      if (info[k] === undefined) info[k] = v as unknown as string;
    }
  }
  return info;
});

const redactFormat = winston.format((info) => {
  const redacted = redact({ ...info }) as Record<string, unknown>;
  for (const key of Object.keys(info)) delete info[key];
  Object.assign(info, redacted);
  return info;
});

const prettyPrinter = winston.format.printf((info) => {
  const { timestamp, level, message, service, ...rest } = info as Record<string, unknown> & {
    timestamp?: string;
    level: string;
    message: unknown;
    service?: string;
  };
  const ts = typeof timestamp === 'string' ? timestamp : new Date().toISOString();
  const tail = Object.keys(rest).length ? ` ${JSON.stringify(rest)}` : '';
  return `[${ts}] ${level} ${service ?? '-'} ${typeof message === 'string' ? message : JSON.stringify(message)}${tail}`;
});

export interface LoggerOptions {
  service: string;
  level?: LogLevel;
  pretty?: boolean;
  silent?: boolean;
}

export const createLogger = (options: LoggerOptions): winston.Logger => {
  const level = options.level ?? ((process.env['LOG_LEVEL'] as LogLevel | undefined) ?? 'info');
  const usePretty = options.pretty ?? process.env['NODE_ENV'] !== 'production';
  return winston.createLogger({
    level,
    silent: options.silent ?? false,
    defaultMeta: { service: options.service },
    format: winston.format.combine(
      winston.format.timestamp(),
      contextFormat(),
      redactFormat(),
      usePretty ? prettyPrinter : winston.format.json(),
    ),
    transports: [new winston.transports.Console({ handleExceptions: true })],
  });
};
