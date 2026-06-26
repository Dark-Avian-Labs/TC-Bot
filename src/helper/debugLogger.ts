import { serializeErrorForLog } from './logError.js';

type LogLevel = 'INFO' | 'DEBUG' | 'WARN' | 'ERROR' | 'STEP';

interface LogContext {
  [key: string]: unknown;
}

class DebugLogger {
  private readonly debugEnabled: boolean;

  constructor() {
    this.debugEnabled = process.env.DEBUG === 'true' || process.env.DEBUG === '1';
    this.initializeDebug();
  }

  private initializeDebug(): void {
    if (this.debugEnabled) {
      console.log('[DEBUG] Debug logging enabled');
    }
  }

  private get enabled(): boolean {
    return this.debugEnabled;
  }

  private serializeContext(context: LogContext): string {
    const serialized: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(context)) {
      if (value instanceof Error) {
        serialized[key] = serializeErrorForLog(value);
      } else {
        serialized[key] = value;
      }
    }

    return JSON.stringify(serialized);
  }

  private formatMessage(
    level: LogLevel,
    category: string,
    message: string,
    context?: LogContext,
  ): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${this.serializeContext(context)}` : '';
    return `[${timestamp}] [${level}] [${category}] ${message}${contextStr}`;
  }

  private log(level: LogLevel, category: string, message: string, context?: LogContext): void {
    if (!this.enabled && level !== 'ERROR' && level !== 'WARN') {
      return;
    }

    const formattedMessage = this.formatMessage(level, category, message, context);

    switch (level) {
      case 'ERROR':
        console.error(formattedMessage);
        break;
      case 'WARN':
        console.warn(formattedMessage);
        break;
      default:
        console.log(formattedMessage);
    }
  }

  info(category: string, message: string, context?: LogContext): void {
    this.log('INFO', category, message, context);
  }

  debug(category: string, message: string, context?: LogContext): void {
    this.log('DEBUG', category, message, context);
  }

  step(category: string, message: string, context?: LogContext): void {
    this.log('STEP', category, message, context);
  }

  warn(category: string, message: string, context?: LogContext): void {
    this.log('WARN', category, message, context);
  }

  error(category: string, message: string, context?: LogContext): void {
    this.log('ERROR', category, message, context);
  }

  command(commandName: string, action: string, context?: LogContext): void {
    this.debug('COMMAND', `[${commandName}] ${action}`, context);
  }

  event(eventName: string, action: string, context?: LogContext): void {
    this.debug('EVENT', `[${eventName}] ${action}`, context);
  }

  boot(action: string, context?: LogContext): void {
    this.step('BOOT', action, context);
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

export const debugLogger = new DebugLogger();
