export type ConditionResults = {
  content: { conditionCode: string; result: boolean };
  conditionType: "and" | "or";
  finalResult: boolean;
} | null;

export interface TraceLogEntry {
  depth: number;
  type: "import" | "container" | "config" | "condition" | "error" | "info";
  path?: string;
  message: string;
  timestamp?: string;
}

export class TraceLogger {
  public logs: TraceLogEntry[] = [];

  append(message: string, depth = 0, type: TraceLogEntry["type"] = "info", path?: string) {
    this.logs.push({
      depth,
      type,
      path,
      message,
      timestamp: new Date().toISOString(),
    });
  }

  toFormattedText(indent = true): string {
    return this.logs
      .map((entry) => {
        const prefix = indent ? "  ".repeat(entry.depth) : "";
        return `${prefix}[${entry.type.toUpperCase()}] ${entry.message}`;
      })
      .join("\n");
  }
}
