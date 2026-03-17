/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         UMKM-Helper — Structured Logger Utility          ║
 * ╠══════════════════════════════════════════════════════════╣
 * ║  Zero-dependency, server+client safe, production-ready.  ║
 * ║                                                          ║
 * ║  Features:                                               ║
 * ║  • Log levels: debug, info, warn, error, fatal           ║
 * ║  • Structured JSON output in production                  ║
 * ║  • Pretty colored output in development                  ║
 * ║  • Child loggers with context (module, requestId, etc.)  ║
 * ║  • Automatic timestamp + duration tracking               ║
 * ║  • Sensitive field redaction                              ║
 * ║  • API request/response logging helpers                  ║
 * ╚══════════════════════════════════════════════════════════╝
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *
 *   // Basic
 *   logger.info("Server started", { port: 3000 });
 *   logger.error("Payment failed", { orderId: "TXN-001", error: err });
 *
 *   // Child logger with context
 *   const log = logger.child({ module: "midtrans", requestId: "abc-123" });
 *   log.info("Webhook received");        // auto-includes module + requestId
 *   log.warn("Retry attempt", { attempt: 2 });
 *
 *   // API route helper
 *   const log = logger.api("POST", "/api/sales");
 *   log.info("Creating sale", { items: 3 });
 *   log.done(201, { saleId: 42 });       // logs response status + duration
 *
 *   // Timer
 *   const end = logger.time("db-query");
 *   await prisma.sale.findMany();
 *   end();                                // logs "[db-query] completed in 124ms"
 */

// ─── Types ───────────────────────────────────────────────────

type LogLevel = "debug" | "info" | "warn" | "error" | "fatal";

interface LogContext {
  [key: string]: unknown;
}

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: LogContext;
}

interface ChildOptions {
  module?: string;
  requestId?: string;
  [key: string]: unknown;
}

// ─── Config ──────────────────────────────────────────────────

const IS_SERVER = typeof window === "undefined";
const IS_PROD = process.env.NODE_ENV === "production";

/** Minimum level that gets printed. Override with LOG_LEVEL env var. */
const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  fatal: 4,
};

function getMinLevel(): LogLevel {
  const envLevel = (IS_SERVER ? process.env.LOG_LEVEL : undefined) as LogLevel | undefined;
  if (envLevel && envLevel in LEVEL_PRIORITY) return envLevel;
  return IS_PROD ? "info" : "debug";
}

/** Fields that should be redacted from log output. */
const SENSITIVE_KEYS = new Set([
  "password",
  "secret",
  "token",
  "authorization",
  "cookie",
  "creditCard",
  "cardNumber",
  "cvv",
  "apiKey",
  "api_key",
  "private_key",
  "privateKey",
  "signature_key",
]);

// ─── Formatting ──────────────────────────────────────────────

const LEVEL_COLORS: Record<LogLevel, string> = {
  debug: "\x1b[90m",   // gray
  info: "\x1b[36m",    // cyan
  warn: "\x1b[33m",    // yellow
  error: "\x1b[31m",   // red
  fatal: "\x1b[35m",   // magenta
};

const LEVEL_ICONS: Record<LogLevel, string> = {
  debug: "🔍",
  info: "ℹ️ ",
  warn: "⚠️ ",
  error: "❌",
  fatal: "💀",
};

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";

// ─── Helpers ─────────────────────────────────────────────────

function redact(obj: unknown, depth = 0): unknown {
  if (depth > 6) return "[max depth]";
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === "string") return obj;
  if (typeof obj === "number" || typeof obj === "boolean") return obj;

  if (obj instanceof Error) {
    return {
      name: obj.name,
      message: obj.message,
      stack: IS_PROD ? undefined : obj.stack?.split("\n").slice(0, 5).join("\n"),
      ...(("code" in obj) ? { code: (obj as Record<string, unknown>).code } : {}),
    };
  }

  if (Array.isArray(obj)) {
    return obj.length > 20
      ? [...obj.slice(0, 5).map(i => redact(i, depth + 1)), `...and ${obj.length - 5} more`]
      : obj.map(i => redact(i, depth + 1));
  }

  if (typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (SENSITIVE_KEYS.has(key.toLowerCase())) {
        result[key] = "[REDACTED]";
      } else {
        result[key] = redact(value, depth + 1);
      }
    }
    return result;
  }

  return String(obj);
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatContextPretty(ctx: LogContext): string {
  const entries = Object.entries(ctx);
  if (entries.length === 0) return "";

  const parts = entries.map(([k, v]) => {
    const val = typeof v === "object" ? JSON.stringify(redact(v), null, 0) : String(v);
    return `${DIM}${k}=${RESET}${val}`;
  });

  return ` ${DIM}│${RESET} ${parts.join(" ")}`;
}

function formatPretty(entry: LogEntry, parentCtx?: LogContext): string {
  const color = LEVEL_COLORS[entry.level];
  const icon = LEVEL_ICONS[entry.level];
  const levelTag = `${color}${BOLD}${entry.level.toUpperCase().padEnd(5)}${RESET}`;
  const time = `${DIM}${entry.timestamp.slice(11, 23)}${RESET}`;

  const mergedCtx = { ...parentCtx, ...entry.context };
  const ctxStr = formatContextPretty(mergedCtx);

  return `${icon} ${time} ${levelTag} ${entry.message}${ctxStr}`;
}

function formatJSON(entry: LogEntry, parentCtx?: LogContext): string {
  const payload = {
    level: entry.level,
    msg: entry.message,
    time: entry.timestamp,
    ...redact({ ...parentCtx, ...entry.context }) as object,
  };
  return JSON.stringify(payload);
}

// ─── Core Logger ─────────────────────────────────────────────

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[getMinLevel()];
}

function write(entry: LogEntry, parentCtx?: LogContext): void {
  if (!shouldLog(entry.level)) return;

  const output = IS_PROD
    ? formatJSON(entry, parentCtx)
    : formatPretty(entry, parentCtx);

  switch (entry.level) {
    case "error":
    case "fatal":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    case "debug":
      console.debug(output);
      break;
    default:
      console.log(output);
  }
}

function createLogFn(level: LogLevel, parentCtx?: LogContext) {
  return (message: string, context?: LogContext) => {
    write(
      {
        level,
        message,
        timestamp: formatTimestamp(),
        context,
      },
      parentCtx,
    );
  };
}

// ─── API Request Logger ──────────────────────────────────────

interface ApiLogger {
  debug: (msg: string, ctx?: LogContext) => void;
  info: (msg: string, ctx?: LogContext) => void;
  warn: (msg: string, ctx?: LogContext) => void;
  error: (msg: string, ctx?: LogContext) => void;
  /** Log the API response and duration */
  done: (status: number, ctx?: LogContext) => void;
  /** Log an API error response and duration */
  fail: (status: number, error: unknown, ctx?: LogContext) => void;
}

function createApiLogger(method: string, path: string, parentCtx?: LogContext): ApiLogger {
  const start = Date.now();
  const apiCtx: LogContext = { ...parentCtx, method, path };

  const child = createChildLogger(apiCtx);

  return {
    debug: child.debug,
    info: child.info,
    warn: child.warn,
    error: child.error,

    done(status: number, ctx?: LogContext) {
      const ms = Date.now() - start;
      const level: LogLevel = status >= 400 ? "warn" : "info";
      write(
        {
          level,
          message: `${method} ${path} → ${status}`,
          timestamp: formatTimestamp(),
          context: { ...ctx, status, durationMs: ms },
        },
        apiCtx,
      );
    },

    fail(status: number, error: unknown, ctx?: LogContext) {
      const ms = Date.now() - start;
      write(
        {
          level: "error",
          message: `${method} ${path} → ${status} FAILED`,
          timestamp: formatTimestamp(),
          context: {
            ...ctx,
            status,
            durationMs: ms,
            error: error instanceof Error
              ? { name: error.name, message: error.message }
              : String(error),
          },
        },
        apiCtx,
      );
    },
  };
}

// ─── Child Logger ────────────────────────────────────────────

interface Logger {
  debug: (msg: string, ctx?: LogContext) => void;
  info: (msg: string, ctx?: LogContext) => void;
  warn: (msg: string, ctx?: LogContext) => void;
  error: (msg: string, ctx?: LogContext) => void;
  fatal: (msg: string, ctx?: LogContext) => void;

  /** Create a child logger that inherits context */
  child: (ctx: ChildOptions) => Logger;

  /** Create an API request logger with timing */
  api: (method: string, path: string) => ApiLogger;

  /**
   * Start a timer. Returns a function that logs the elapsed time.
   *
   * ```ts
   * const end = logger.time("db-query");
   * await doSomething();
   * end(); // logs: "[db-query] completed in 42ms"
   * ```
   */
  time: (label: string, ctx?: LogContext) => () => void;
}

function createChildLogger(parentCtx?: LogContext): Logger {
  return {
    debug: createLogFn("debug", parentCtx),
    info: createLogFn("info", parentCtx),
    warn: createLogFn("warn", parentCtx),
    error: createLogFn("error", parentCtx),
    fatal: createLogFn("fatal", parentCtx),

    child(ctx: ChildOptions): Logger {
      return createChildLogger({ ...parentCtx, ...ctx });
    },

    api(method: string, path: string): ApiLogger {
      return createApiLogger(method, path, parentCtx);
    },

    time(label: string, ctx?: LogContext): () => void {
      const start = Date.now();
      return () => {
        const ms = Date.now() - start;
        write(
          {
            level: "debug",
            message: `[${label}] completed in ${ms}ms`,
            timestamp: formatTimestamp(),
            context: { ...ctx, durationMs: ms },
          },
          parentCtx,
        );
      };
    },
  };
}

// ─── Singleton Export ────────────────────────────────────────

/** Root logger instance */
export const logger: Logger = createChildLogger();

export default logger;

/**
 * Pre-built child loggers for common modules.
 * Import what you need:
 *
 *   import { logSales, logAI } from "@/lib/logger";
 *   logSales.info("Sale created", { id: 1 });
 */
export const logAuth      = logger.child({ module: "auth" });
export const logSales     = logger.child({ module: "sales" });
export const logInventory = logger.child({ module: "inventory" });
export const logPayment   = logger.child({ module: "payment" });
export const logAI        = logger.child({ module: "ai" });
export const logWebhook   = logger.child({ module: "webhook" });
export const logCron      = logger.child({ module: "cron" });
export const logDB        = logger.child({ module: "db" });
export const logImageKit  = logger.child({ module: "imagekit" });

