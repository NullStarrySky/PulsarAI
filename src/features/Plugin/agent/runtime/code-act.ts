import {
  executeSandboxCodeAsync,
  type SandboxEnvironment,
} from "@/features/Sandbox/sandbox";

export interface CodeActSuccess {
  ok: true;
  value: unknown;
}

export interface CodeActFailure {
  ok: false;
  error: string;
}

export type CodeActResult = CodeActSuccess | CodeActFailure;

function validateCodeActFunction(source: string) {
  const code = source.trim();
  const isFunction =
    /^(async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{[\s\S]*\}\s*$/.test(
      code,
    )
    || /^(async\s*)?(\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{[\s\S]*\}\s*$/.test(
      code,
    );
  if (!isFunction) {
    throw new Error(
      "CodeAct 只接受一个函数。请返回 `async function () { ... return value; }`。",
    );
  }
  if (!/(?:^|[;{}]\s*|\)\s*)return\b/m.test(maskCodeActLiteralsAndComments(code))) {
    throw new Error("CodeAct 函数必须显式包含 return，并返回本次执行结果。");
  }
  return code;
}

export async function executeCodeAct(
  source: string,
  environment: SandboxEnvironment,
): Promise<CodeActResult> {
  try {
    const code = validateCodeActFunction(source);
    const value = await executeSandboxCodeAsync(code, [environment]);
    return {
      ok: true,
      value: normalizeCodeActValue(value),
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeCodeActValue(
  value: unknown,
  seen = new WeakSet<object>(),
): unknown {
  if (value == null || typeof value === "string" || typeof value === "boolean") {
    return value ?? null;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : String(value);
  }
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "function" || typeof value === "symbol") {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  if (seen.has(value)) return "[Circular]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.map((item) => normalizeCodeActValue(item, seen));
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, item]) =>
        typeof item !== "function" && typeof item !== "symbol"
      )
      .map(([key, item]) => [
        key,
        normalizeCodeActValue(item, seen),
      ]),
  );
}

function maskCodeActLiteralsAndComments(source: string) {
  let result = "";
  let index = 0;
  let mode: "code" | "line" | "block" | "single" | "double" | "template" =
    "code";

  while (index < source.length) {
    const char = source[index] ?? "";
    const next = source[index + 1] ?? "";

    if (mode === "code") {
      if (char === "/" && next === "/") {
        result += "  ";
        index += 2;
        mode = "line";
        continue;
      }
      if (char === "/" && next === "*") {
        result += "  ";
        index += 2;
        mode = "block";
        continue;
      }
      if (char === "'" || char === '"' || char === "`") {
        result += " ";
        index += 1;
        mode = char === "'" ? "single" : char === '"' ? "double" : "template";
        continue;
      }
      result += char;
      index += 1;
      continue;
    }

    if (mode === "line") {
      if (char === "\n") {
        result += "\n";
        mode = "code";
      } else {
        result += " ";
      }
      index += 1;
      continue;
    }

    if (mode === "block") {
      if (char === "*" && next === "/") {
        result += "  ";
        index += 2;
        mode = "code";
      } else {
        result += char === "\n" ? "\n" : " ";
        index += 1;
      }
      continue;
    }

    if (char === "\\") {
      result += "  ";
      index += 2;
      continue;
    }
    result += char === "\n" ? "\n" : " ";
    if (
      (mode === "single" && char === "'")
      || (mode === "double" && char === '"')
      || (mode === "template" && char === "`")
    ) {
      mode = "code";
    }
    index += 1;
  }

  return result;
}
