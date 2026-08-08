const logPrefix = "[Pulsar DB]";

let sequence = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
let pending: Array<Record<string, unknown>> = [];

export function logDatabaseOperation(
  operation: string,
  details: Record<string, unknown>,
) {
  sequence += 1;
  pending.push({ sequence, operation, ...details });
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    const operations = pending;
    pending = [];
    const lines = operations.map((entry) => {
      const table = typeof entry.table === "string" ? ` ${entry.table}` : "";
      const id = typeof entry.id === "string" ? `/${entry.id}` : "";
      const duration = typeof entry.durationMs === "number" ? ` ${entry.durationMs}ms` : "";
      const count = typeof entry.count === "number" ? ` count=${entry.count}` : "";
      const status = entry.ok === false ? " failed" : "";
      return `#${entry.sequence} ${entry.operation}${table}${id}${duration}${count}${status}`;
    });
    console.info(`${logPrefix} batch=${operations.length}\n${lines.join("\n")}`);
  }, 200);
}

export async function traceDatabaseOperation<T>(
  operation: string,
  details: Record<string, unknown>,
  execute: () => Promise<T>,
  summarize?: (result: T) => Record<string, unknown>,
) {
  const startedAt = performance.now();
  try {
    const result = await execute();
    logDatabaseOperation(operation, {
      ...details,
      ...(summarize?.(result) ?? {}),
      ok: true,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
    });
    return result;
  } catch (error) {
    logDatabaseOperation(operation, {
      ...details,
      ok: false,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
