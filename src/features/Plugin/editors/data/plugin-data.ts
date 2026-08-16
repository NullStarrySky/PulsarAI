export type PluginDataIsolation = "resource" | "conversation";

export type PluginDataValue =
  | string
  | number
  | boolean
  | null
  | PluginDataValue[]
  | { [key: string]: PluginDataValue };

/**
 * A `.data` file is a reusable definition. Runtime values do not belong to the
 * file and must be supplied by Conversation branch replay.
 */
export interface PluginDataDefinition {
  version: 1;
  isolation: PluginDataIsolation;
  description: string;
  initialValue: PluginDataValue;
  enableUpdater: boolean;
  wrapperSource: string;
  varName?: string;
}

export interface PluginDataDiagnostic {
  path: string;
  message: string;
}

export interface PluginDataParseResult {
  definition: PluginDataDefinition;
  diagnostics: PluginDataDiagnostic[];
}

export interface PluginDataInstanceAddress {
  dataId: string;
  /** Present only when the definition uses resource isolation. */
  resourceId?: string;
}

export interface PluginDataRuntimeBinding {
  read(address: PluginDataInstanceAddress): PluginDataValue | undefined;
  write(address: PluginDataInstanceAddress, value: PluginDataValue): void;
}

/**
 * A deterministic view over Conversation-owned state. The caller injects the
 * active branch reader/writer; this object never persists global plugin state.
 */
export interface PluginDataContainer {
  readonly dataId: string;
  readonly definition: PluginDataDefinition;
  readForResource(resourceId: string): PluginDataValue;
  writeForResource(resourceId: string, value: PluginDataValue): void;
}

const defaultDefinition: PluginDataDefinition = {
  version: 1,
  isolation: "resource",
  description: "",
  initialValue: {},
  enableUpdater: false,
  wrapperSource: "",
};

export function parsePluginDataDefinition(
  input: unknown,
): PluginDataParseResult {
  const diagnostics: PluginDataDiagnostic[] = [];
  const source = parseSource(input, diagnostics);
  if (!isRecord(source)) {
    diagnostics.push({ path: "$", message: ".data 根节点必须是 JSON 对象。" });
    return {
      definition: structuredClone(defaultDefinition),
      diagnostics,
    };
  }

  if (source.version !== undefined && source.version !== 1) {
    diagnostics.push({
      path: "$.version",
      message: "当前只支持 version: 1 的 .data 定义。",
    });
  }

  const isolation = normalizeIsolation(source.isolation, diagnostics);
  const initialValue = normalizeValue(
    source.initialValue,
    "$.initialValue",
    diagnostics,
  );
  const description = normalizeString(
    source.description,
    "$.description",
    diagnostics,
  );
  const wrapperSource = normalizeString(
    source.wrapperSource,
    "$.wrapperSource",
    diagnostics,
  );
  const enableUpdater = normalizeBoolean(
    source.enableUpdater,
    "$.enableUpdater",
    diagnostics,
  );
  const varName = normalizeString(
    source.varName,
    "$.varName",
    diagnostics,
  ) || undefined;

  return {
    definition: {
      version: 1,
      isolation,
      description,
      initialValue,
      enableUpdater,
      wrapperSource,
      ...(varName ? { varName } : {}),
    },
    diagnostics,
  };
}

export function pluginDataInstanceKey(
  dataId: string,
  isolation: PluginDataIsolation,
  resourceId: string,
) {
  const normalizedDataId = dataId.trim();
  if (!normalizedDataId) throw new Error("Data 资源 ID 不能为空。");
  if (isolation === "conversation") return `data:${normalizedDataId}`;
  const normalizedResourceId = resourceId.trim();
  if (!normalizedResourceId) {
    throw new Error(`Data ${normalizedDataId} 按资源隔离，必须提供资源 ID。`);
  }
  return `data:${normalizedDataId}:resource:${normalizedResourceId}`;
}

export function serializePluginDataDefinition(
  definition: PluginDataDefinition,
): string {
  return JSON.stringify(definition, null, 2);
}

export function createPluginDataContainer(input: {
  dataId: string;
  definition: PluginDataDefinition;
  runtime: PluginDataRuntimeBinding;
}): PluginDataContainer {
  const dataId = input.dataId.trim();
  if (!dataId) throw new Error("Data 资源 ID 不能为空。");
  const definition = structuredClone(input.definition);

  const addressFor = (resourceId: string): PluginDataInstanceAddress => {
    if (definition.isolation === "conversation") return { dataId };
    const normalizedResourceId = resourceId.trim();
    if (!normalizedResourceId) {
      throw new Error(`Data ${dataId} 按资源隔离，必须提供资源 ID。`);
    }
    return { dataId, resourceId: normalizedResourceId };
  };

  return {
    dataId,
    definition,
    readForResource(resourceId: string) {
      const value = input.runtime.read(addressFor(resourceId));
      return structuredClone(value ?? definition.initialValue);
    },
    writeForResource(resourceId: string, value: PluginDataValue) {
      input.runtime.write(
        addressFor(resourceId),
        structuredClone(assertPluginDataValue(value)),
      );
    },
  };
}

export function assertPluginDataValue(value: unknown): PluginDataValue {
  const diagnostics: PluginDataDiagnostic[] = [];
  const normalized = normalizeValue(value, "$", diagnostics);
  if (diagnostics.length) {
    throw new Error(diagnostics.map((item) => item.message).join(" "));
  }
  return normalized;
}

function parseSource(
  input: unknown,
  diagnostics: PluginDataDiagnostic[],
): unknown {
  if (typeof input !== "string") return input;
  try {
    return JSON.parse(input) as unknown;
  } catch (error) {
    diagnostics.push({
      path: "$",
      message: `无法解析 .data JSON：${error instanceof Error ? error.message : String(error)}`,
    });
    return null;
  }
}

function normalizeIsolation(
  value: unknown,
  diagnostics: PluginDataDiagnostic[],
): PluginDataIsolation {
  if (value === "resource" || value === "conversation") return value;
  if (value !== undefined) {
    diagnostics.push({
      path: "$.isolation",
      message: "isolation 只能是 resource 或 conversation。",
    });
  }
  return defaultDefinition.isolation;
}

function normalizeString(
  value: unknown,
  path: string,
  diagnostics: PluginDataDiagnostic[],
) {
  if (value === undefined) return "";
  if (typeof value === "string") return value;
  diagnostics.push({ path, message: `${path} 必须是字符串。` });
  return "";
}

function normalizeBoolean(
  value: unknown,
  path: string,
  diagnostics: PluginDataDiagnostic[],
) {
  if (value === undefined) return false;
  if (typeof value === "boolean") return value;
  diagnostics.push({ path, message: `${path} 必须是布尔值。` });
  return false;
}

function normalizeValue(
  value: unknown,
  path: string,
  diagnostics: PluginDataDiagnostic[],
): PluginDataValue {
  if (value === undefined) return {};
  if (
    value === null
    || typeof value === "string"
    || typeof value === "boolean"
  ) return value;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    diagnostics.push({ path, message: `${path} 的数字必须是有限值。` });
    return null;
  }
  if (Array.isArray(value)) {
    return value.map((item, index) =>
      normalizeValue(item, `${path}[${index}]`, diagnostics)
    );
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        normalizeValue(item, `${path}.${key}`, diagnostics),
      ]),
    );
  }
  diagnostics.push({ path, message: `${path} 必须是 JSON 可序列化值。` });
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
