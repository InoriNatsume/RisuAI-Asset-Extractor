/**
 * Logger
 * 로깅 시스템
 * 
 * Development logger for parser and viewer diagnostics.
 */

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type LogCategory = 'charx' | 'risum' | 'risup' | 'cbs' | 'regex' | 'trigger' | 'validation' | 'app' | 'file' | 'asset' | 'lorebook' | 'schema';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  category: LogCategory;
  message: string;
  data?: unknown;
}

type LogListener = (entry: LogEntry) => void;

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private listeners: Set<LogListener> = new Set();
  private enabled = true;
  private verboseMode = true; // 기본으로 상세 모드 활성화

  log(level: LogLevel, category: LogCategory, message: string, data?: unknown): void {
    if (!this.enabled) return;

    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      category,
      message,
      data
    };

    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }

    // 리스너 알림
    this.listeners.forEach(fn => fn(entry));

    // 콘솔 출력 조건:
    // - verboseMode: 모든 로그 출력
    // - 아니면: WARN/ERROR만 출력
    const shouldLog = this.verboseMode || level === 'WARN' || level === 'ERROR';
    
    if (shouldLog && typeof console !== 'undefined') {
      const method = level === 'ERROR' ? 'error' : level === 'WARN' ? 'warn' : level === 'DEBUG' ? 'debug' : 'log';
      const prefix = `[${category}]`;
      const style = this.getStyle(level, category);
      
      if (data !== undefined) {
        console[method](`%c${prefix}`, style, message, data);
      } else {
        console[method](`%c${prefix}`, style, message);
      }
    }
  }

  private getStyle(level: LogLevel, category: LogCategory): string {
    const colors: Record<LogLevel, string> = {
      'DEBUG': '#888',
      'INFO': '#4682B4',
      'WARN': '#FFA500',
      'ERROR': '#FF4444'
    };
    
    const categoryColors: Partial<Record<LogCategory, string>> = {
      'charx': '#9B59B6',
      'risum': '#2ECC71',
      'risup': '#E74C3C',
      'asset': '#F39C12',
      'lorebook': '#3498DB',
      'schema': '#1ABC9C'
    };
    
    const color = categoryColors[category] || colors[level];
    return `color: ${color}; font-weight: bold;`;
  }

  debug(category: LogCategory, msg: string, data?: unknown): void {
    this.log('DEBUG', category, msg, data);
  }

  info(category: LogCategory, msg: string, data?: unknown): void {
    this.log('INFO', category, msg, data);
  }

  warn(category: LogCategory, msg: string, data?: unknown): void {
    this.log('WARN', category, msg, data);
  }

  error(category: LogCategory, msg: string, data?: unknown): void {
    this.log('ERROR', category, msg, data);
  }

  // 스키마 검증 실패 시 상세 로깅
  schemaError(category: LogCategory, field: string, expected: unknown, actual: unknown): void {
    this.log('ERROR', 'schema', `스키마 불일치: ${category}.${field}`, {
      field,
      expected,
      actual,
      actualType: typeof actual
    });
  }

  subscribe(fn: LogListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getByCategory(category: LogCategory, count = 50): LogEntry[] {
    return this.logs.filter(l => l.category === category).slice(-count);
  }

  getByLevel(level: LogLevel, count = 50): LogEntry[] {
    return this.logs.filter(l => l.level === level).slice(-count);
  }

  getRecent(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  exportForAI(options?: { categories?: LogCategory[]; levels?: LogLevel[] }): string {
    let filtered = this.logs;

    if (options?.categories) {
      filtered = filtered.filter(l => options.categories!.includes(l.category));
    }
    if (options?.levels) {
      filtered = filtered.filter(l => options.levels!.includes(l.level));
    }

    return filtered
      .map(l => {
        const time = new Date(l.timestamp).toISOString().slice(11, 19);
        const data = l.data ? ` | ${JSON.stringify(l.data)}` : '';
        return `[${time}] ${l.level} [${l.category}] ${l.message}${data}`;
      })
      .join('\n');
  }

  clear(): void {
    this.logs = [];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }
}

export const logger = new Logger();
