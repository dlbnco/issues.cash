type LogContext = Record<string, unknown>;

function write(level: "error" | "warn" | "info", message: string, context?: LogContext) {
  const payload = context ? { message, ...context } : { message };

  console[level](JSON.stringify(payload));
}

export const logger = {
  error(message: string, context?: LogContext) {
    write("error", message, context);
  },
  warn(message: string, context?: LogContext) {
    write("warn", message, context);
  },
  info(message: string, context?: LogContext) {
    write("info", message, context);
  },
};
