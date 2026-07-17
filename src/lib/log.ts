// Tiny leveled logger. Honors LOG_LEVEL (debug|info|warn|error), default "info".
// Keeps output on the console but adds a level tag and a single silence knob.
type Level = "debug" | "info" | "warn" | "error";

const ORDER: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 };
const threshold =
  ORDER[(process.env.LOG_LEVEL as Level | undefined) ?? "info"] ?? ORDER.info;

function emit(level: Level, args: unknown[]) {
  if (ORDER[level] < threshold) return;
  const sink =
    level === "error"
      ? console.error
      : level === "warn"
        ? console.warn
        : console.log;
  sink(`[${level}]`, ...args);
}

export const log = {
  debug: (...args: unknown[]) => emit("debug", args),
  info: (...args: unknown[]) => emit("info", args),
  warn: (...args: unknown[]) => emit("warn", args),
  error: (...args: unknown[]) => emit("error", args),
};
