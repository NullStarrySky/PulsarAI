import { type ModelMessage } from "ai";
import {
  remove,
  selectAll,
  upsert,
} from "@/features/Database/application/database-service";
import { getFastModel } from "@/features/defaultConfigs/application/default-config-service";
import { generateText } from "@/features/ModelConnection/application/model-ai";
import {
  createContextDataFacade,
  type ContextDataValue,
  type ContextDataDefinition,
} from "@/features/Resources/Plugin/domain/plugin-chat";
import {
  executeCodeAct,
  maskCodeActLiteralsAndComments,
} from "@/features/Agent/application/code-act";
import type {
  ChatMessage,
  ChatMessageContainer,
  ConversationVariableUpdate,
} from "@/features/Resources/Conversation/domain/conversation-types";

export interface ConversationVariableEvaluation {
  definitionHash: string;
  state: Record<string, ContextDataValue>;
  facades: Record<string, unknown>;
  versionKey: string;
}

export interface ConversationDataApi {
  readForResource(resourceId: string, dataId: string): ContextDataValue;
  writeForResource(resourceId: string, dataId: string, value: ContextDataValue): ContextDataValue;
  listForResource(resourceId: string): Array<{
    id: string;
    path: string;
    isolation: "resource" | "conversation";
    writable: boolean;
    pluginId: string;
    pluginName: string;
    value: ContextDataValue;
  }>;
}

export interface VariableUpdateExecutionSuccess {
  ok: true;
  state: Record<string, ContextDataValue>;
  facades: Record<string, unknown>;
  update: ConversationVariableUpdate;
  value: unknown;
}

export interface VariableUpdateExecutionFailure {
  ok: false;
  error: string;
}

export type VariableUpdateExecutionResult =
  | VariableUpdateExecutionSuccess
  | VariableUpdateExecutionFailure;

export interface ConversationMemorySegment {
  id: string;
  conversationId: string;
  level: number;
  startContainerId: string;
  endContainerId: string;
  source:
    | {
        kind: "containers";
        containerIds: string[];
        messageVersionIds: string[];
      }
    | {
        kind: "segments";
        segmentIds: string[];
      };
  sourceHash: string;
  content: string;
  leafContainerCount: number;
  sourceTokenCount: number;
  compressedTokenCount: number;
  status: "ready" | "failed" | "superseded";
  compressorId: string;
  compressorVersion: string;
  createdAt: string;
  error?: string;
}

export interface ConversationMemoryContextResult {
  messages: ModelMessage[];
  segments: ConversationMemorySegment[];
  diagnostics: string[];
}

const memoryTable = "resource_conversation_memory_segments";
const stateCacheLimit = 64;
const compressionConcurrency = 3;
const compressionBranchingFactor = 4;
const compressionAgentVersion = "conversation-memory-v1";
const stateCache = new Map<string, Record<string, ContextDataValue>>();

export async function evaluateConversationVariables(
  definitions: ContextDataDefinition[],
  activePath: ChatMessageContainer[],
): Promise<ConversationVariableEvaluation> {
  const definitionHash = hashText(JSON.stringify(definitions.map((item) => ({
    id: item.id,
    dataId: item.dataId,
    resourceId: item.resourceId,
    isolation: item.isolation,
    enableUpdater: item.enableUpdater,
    initialValue: item.initialValue,
    wrapperSource: item.wrapperSource,
  }))));
  let versionKey = `variables:${definitionHash}`;
  let state = readStateCache(versionKey) ?? Object.fromEntries(
    definitions.map((item) => [item.id, structuredClone(item.initialValue)]),
  );
  writeStateCache(versionKey, state);
  for (const container of activePath) {
    const message = currentMessage(container);
    const update = message?.meta.variableUpdate;
    if (update) {
      if (update.definitionHash !== definitionHash) {
        throw new Error(
          `消息 ${message.id} 的变量定义版本已经失效，请重新生成该消息的变量更新。`,
        );
      }
      const nextKey = hashText([
        versionKey,
        container.id,
        message.id,
        update.sourceHash,
      ].join("\n"));
      const cached = readStateCache(nextKey);
      if (cached) {
        state = cached;
      } else {
        for (const source of update.sources) {
          const result = await applyVariableUpdate(source, definitions, state);
          if (!result.ok) {
            throw new Error(`消息 ${message.id} 的变量更新失败：${result.error}`);
          }
          state = result.state;
        }
        writeStateCache(nextKey, state);
      }
      versionKey = nextKey;
    }
  }

  return {
    definitionHash,
    state: structuredClone(state),
    facades: createVariableFacades(definitions, state, true),
    versionKey,
  };
}

export async function executeVariableUpdateIntent(
  source: string,
  definitions: ContextDataDefinition[],
  evaluation: ConversationVariableEvaluation,
): Promise<VariableUpdateExecutionResult> {
  const result = await applyVariableUpdate(source, definitions, evaluation.state);
  if (!result.ok) return result;
  const sourceHash = hashText(JSON.stringify([source.trim()]));
  return {
    ...result,
    update: {
      sources: [source.trim()],
      sourceHash,
      definitionHash: evaluation.definitionHash,
      createdAt: new Date().toISOString(),
    },
  };
}

export function appendConversationVariableUpdate(
  previous: ConversationVariableUpdate | undefined,
  next: ConversationVariableUpdate,
): ConversationVariableUpdate {
  if (!previous) return next;
  const sources = [
    ...previous.sources,
    ...next.sources,
  ];
  return {
    ...next,
    sourceHash: hashText(JSON.stringify(sources)),
    sources,
  };
}

export async function prepareConversationMemoryContext(input: {
  conversationId: string;
  activePath: ChatMessageContainer[];
  compressionThreshold: number;
}): Promise<ConversationMemoryContextResult> {
  const diagnostics: string[] = [];
  if (input.compressionThreshold <= 0) {
    return {
      messages: input.activePath.flatMap(containerToModelMessages),
      segments: [],
      diagnostics,
    };
  }

  let segments = await loadConversationMemorySegments(input.conversationId);
  let compressionFailed = false;
  try {
    const created = await ensureConversationCompression({
      ...input,
      segments,
    });
    segments = [...segments, ...created];
  } catch (error) {
    compressionFailed = true;
    diagnostics.push(
      `压缩式记忆更新失败，已回退原始消息：${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return {
    messages: compressionFailed
      ? input.activePath.flatMap(containerToModelMessages)
      : selectMemoryFrontier(input.activePath, segments),
    segments,
    diagnostics,
  };
}

export async function deleteConversationMemory(conversationId: string) {
  const segments = await loadConversationMemorySegments(conversationId);
  await Promise.all(segments.map((segment) => remove(memoryTable, segment.id)));
}

async function applyVariableUpdate(
  source: string,
  definitions: ContextDataDefinition[],
  previousState: Record<string, ContextDataValue>,
): Promise<VariableUpdateExecutionResult> {
  const sourceError = validateVariableUpdateSource(source);
  if (sourceError) return { ok: false, error: sourceError };
  try {
    const state = structuredClone(previousState);
    const facades = createVariableFacades(definitions, state, false);
    const data = createConversationDataApi(definitions, state, false);
    const result = await executeCodeAct(
      source,
      createVariableUpdateEnvironment(facades, data),
    );
    if (!result.ok) return result;
    assertVariableState(state);
    return {
      ok: true,
      state,
      facades: createVariableFacades(definitions, state, true),
      update: {
        sources: [source.trim()],
        sourceHash: hashText(JSON.stringify([source.trim()])),
        definitionHash: "",
        createdAt: "",
      },
      value: result.value,
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createVariableFacades(
  definitions: ContextDataDefinition[],
  sourceState: Record<string, ContextDataValue>,
  readonly: boolean,
) {
  const state = readonly
    ? deepFreeze(structuredClone(sourceState))
    : sourceState;
  return Object.fromEntries(definitions.map((definition) => [
    definition.id,
    createContextDataFacade(
      { name: definition.name, wrapper: definition.wrapperSource },
      state[definition.id] ?? null,
      {
        readonly,
        onReplace: (value) => {
          state[definition.id] = value;
        },
      },
    ),
  ]));
}

export function createConversationDataApi(
  definitions: ContextDataDefinition[],
  state: Record<string, ContextDataValue>,
  readonly: boolean,
): ConversationDataApi {
  const definitionFor = (resourceId: string, dataId: string) => {
    const definition = definitions.find((item) =>
      item.dataId === dataId
      && item.resourceId === resourceId
    );
    if (!definition) {
      throw new Error(`资源 ${resourceId} 没有引用 Data ${dataId}。`);
    }
    return definition;
  };
  return Object.freeze({
    readForResource(resourceId: string, dataId: string) {
      const definition = definitionFor(resourceId, dataId);
      return structuredClone(state[definition.id] ?? definition.initialValue);
    },
    writeForResource(resourceId: string, dataId: string, value: ContextDataValue) {
      if (readonly) throw new Error("当前 Data 容器是只读的。");
      const definition = definitionFor(resourceId, dataId);
      if (!definition.enableUpdater) {
        throw new Error(`Data ${dataId} 未启用更新。`);
      }
      state[definition.id] = structuredClone(value);
      return structuredClone(state[definition.id]!);
    },
    listForResource(resourceId: string) {
      return definitions.flatMap((definition) =>
        definition.resourceId === resourceId
          ? [{
              id: definition.dataId,
              path: definition.path,
              isolation: definition.isolation,
              writable: definition.enableUpdater,
              pluginId: definition.pluginId,
              pluginName: definition.pluginName,
              value: structuredClone(state[definition.id] ?? definition.initialValue),
            }]
          : [],
      );
    },
  });
}

function createVariableUpdateEnvironment(
  facades: Record<string, unknown>,
  data: ConversationDataApi,
) {
  const denied = (name: string) => () => {
    throw new Error(`变量更新意图不能使用 ${name}。`);
  };
  const deterministicMath = new Proxy(Math, {
    get(target, property, receiver) {
      if (property === "random") return denied("Math.random") as Math["random"];
      return Reflect.get(target, property, receiver);
    },
    set: () => {
      throw new Error("变量更新意图不能修改 Math。");
    },
    defineProperty: () => {
      throw new Error("变量更新意图不能修改 Math。");
    },
    deleteProperty: () => {
      throw new Error("变量更新意图不能修改 Math。");
    },
    setPrototypeOf: () => {
      throw new Error("变量更新意图不能修改 Math。");
    },
  });
  class VariableDate extends Date {
    constructor(value?: string | number | Date) {
      if (value === undefined) {
        throw new Error("变量更新意图不能读取当前时间。");
      }
      super(value instanceof Date ? value.getTime() : value);
    }

    static now(): number {
      throw new Error("变量更新意图不能读取当前时间。");
    }
  }
  return {
    variables: facades,
    VARIABLES: facades,
    data,
    DATA: data,
    Math: deterministicMath,
    Date: VariableDate,
    crypto: new Proxy({}, {
      get: (_target, property) => denied(`crypto.${String(property)}`),
    }),
    Promise: denied("Promise"),
    console: new Proxy({}, {
      get: (_target, property) => denied(`console.${String(property)}`),
    }),
    performance: new Proxy({}, {
      get: (_target, property) => denied(`performance.${String(property)}`),
    }),
    setTimeout: denied("setTimeout"),
    clearTimeout: denied("clearTimeout"),
    setInterval: denied("setInterval"),
    clearInterval: denied("clearInterval"),
    queueMicrotask: denied("queueMicrotask"),
    requestAnimationFrame: denied("requestAnimationFrame"),
    requestIdleCallback: denied("requestIdleCallback"),
    SharedArrayBuffer: denied("SharedArrayBuffer"),
    Atomics: new Proxy({}, {
      get: (_target, property) => denied(`Atomics.${String(property)}`),
    }),
  };
}

function validateVariableUpdateSource(source: string) {
  const code = source.trim();
  if (/^async\b/.test(code) || /^async\s*(?:\(|[A-Za-z_$])/.test(code)) {
    return "变量更新意图必须使用同步函数，不能声明为 async。";
  }
  const forbiddenMatch = maskCodeActLiteralsAndComments(code).match(
    /\b(Promise|setTimeout|setInterval|queueMicrotask|requestAnimationFrame|requestIdleCallback|console|performance|SharedArrayBuffer|Atomics|globalThis|window|self|Object|Reflect|Function|eval|Array|JSON)\b|(__proto__|prototype|constructor)/,
  );
  const forbidden = forbiddenMatch?.[1] ?? forbiddenMatch?.[2];
  return forbidden
    ? `变量更新意图不能引用 ${forbidden}。`
    : null;
}

function assertVariableState(state: Record<string, ContextDataValue>) {
  const visiting = new WeakSet<object>();
  const visit = (value: unknown, path: string) => {
    if (
      value === null
      || typeof value === "string"
      || typeof value === "boolean"
      || (typeof value === "number" && Number.isFinite(value))
    ) return;
    if (!value || typeof value !== "object") {
      throw new Error(`${path} 必须保持为可序列化 JSON 值。`);
    }
    if (visiting.has(value)) {
      throw new Error(`${path} 不能包含循环引用。`);
    }
    visiting.add(value);
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}[${index}]`));
    } else {
      const prototype = Object.getPrototypeOf(value);
      if (prototype !== Object.prototype && prototype !== null) {
        throw new Error(`${path} 必须保持为普通 JSON 对象。`);
      }
      for (const [key, item] of Object.entries(value)) {
        visit(item, `${path}.${key}`);
      }
    }
    visiting.delete(value);
  };
  for (const [name, value] of Object.entries(state)) {
    visit(value, `data[${JSON.stringify(name)}]`);
  }
}

async function loadConversationMemorySegments(conversationId: string) {
  const records = await selectAll<ConversationMemorySegment>(memoryTable);
  return records
    .map((record) => record.value)
    .filter((segment) => segment.conversationId === conversationId);
}

async function ensureConversationCompression(input: {
  conversationId: string;
  activePath: ChatMessageContainer[];
  compressionThreshold: number;
  segments: ConversationMemorySegment[];
}) {
  const created: ConversationMemorySegment[] = [];
  const threshold = Math.max(4, input.compressionThreshold);
  const compressibleEnd = Math.max(0, input.activePath.length - threshold);
  const leafJobs: Array<() => Promise<ConversationMemorySegment>> = [];

  for (let start = 0; start + threshold <= compressibleEnd; start += threshold) {
    const containers = input.activePath.slice(start, start + threshold);
    if (!isCompressibleContainerRange(containers)) continue;
    const sourceHash = hashContainerRange(containers);
    const exists = input.segments.some(
      (segment) => segment.level === 1 && segment.sourceHash === sourceHash,
    );
    if (!exists) {
      leafJobs.push(() => summarizeContainerRange(
        input.conversationId,
        containers,
        sourceHash,
      ));
    }
  }

  created.push(...await runWithConcurrency(leafJobs, compressionConcurrency));
  let allSegments = [...input.segments, ...created];
  let level = 1;
  while (true) {
    const candidates = validSegmentsForPath(input.activePath, allSegments)
      .filter((segment) => segment.level === level)
      .sort((a, b) => pathIndex(input.activePath, a.startContainerId)
        - pathIndex(input.activePath, b.startContainerId));
    const parentJobs: Array<() => Promise<ConversationMemorySegment>> = [];
    for (
      let index = 0;
      index + compressionBranchingFactor <= candidates.length;
      index += compressionBranchingFactor
    ) {
      const children = candidates.slice(index, index + compressionBranchingFactor);
      if (!segmentsAreContiguous(input.activePath, children)) continue;
      const sourceHash = hashText(children.map((item) => item.sourceHash).join("\n"));
      if (allSegments.some((segment) => segment.sourceHash === sourceHash)) continue;
      parentJobs.push(() => summarizeSegmentRange(
        input.conversationId,
        children,
        sourceHash,
      ));
    }
    if (!parentJobs.length) break;
    const parents = await runWithConcurrency(parentJobs, compressionConcurrency);
    created.push(...parents);
    allSegments = [...allSegments, ...parents];
    level += 1;
  }
  return created;
}

function isCompressibleContainerRange(containers: ChatMessageContainer[]) {
  return containers.every((container) => {
    const message = currentMessage(container);
    return Boolean(
      message
      && message.type !== "error"
      && !(message.parts?.length),
    );
  });
}

async function summarizeContainerRange(
  conversationId: string,
  containers: ChatMessageContainer[],
  sourceHash: string,
) {
  const sourceText = containers.flatMap((container) => {
    const message = currentMessage(container);
    if (!message) return [];
    return [`[${container.role} · ${container.id}]\n${message.content}`];
  }).join("\n\n");
  return persistSummary({
    conversationId,
    level: 1,
    startContainerId: containers[0]?.id ?? "",
    endContainerId: containers[containers.length - 1]?.id ?? "",
    source: {
      kind: "containers",
      containerIds: containers.map((item) => item.id),
      messageVersionIds: containers.map((item) => currentMessage(item)?.id ?? ""),
    },
    sourceHash,
    leafContainerCount: containers.length,
    sourceText,
  });
}

async function summarizeSegmentRange(
  conversationId: string,
  children: ConversationMemorySegment[],
  sourceHash: string,
) {
  return persistSummary({
    conversationId,
    level: Math.max(...children.map((item) => item.level)) + 1,
    startContainerId: children[0]?.startContainerId ?? "",
    endContainerId: children[children.length - 1]?.endContainerId ?? "",
    source: {
      kind: "segments",
      segmentIds: children.map((item) => item.id),
    },
    sourceHash,
    leafContainerCount: children.reduce(
      (total, item) => total + item.leafContainerCount,
      0,
    ),
    sourceText: children.map((item) => [
      `[memory level=${item.level} range=${item.startContainerId}..${item.endContainerId}]`,
      item.content,
    ].join("\n")).join("\n\n"),
  });
}

async function persistSummary(input: {
  conversationId: string;
  level: number;
  startContainerId: string;
  endContainerId: string;
  source: ConversationMemorySegment["source"];
  sourceHash: string;
  leafContainerCount: number;
  sourceText: string;
}) {
  const modelName = await getFastModel();
  const result = await generateText({
    model: modelName,
    instructions: [
      "你是会话压缩记忆 Agent。",
      "把给定的连续历史区间压缩成可继续递归摘要的中文记忆。",
      "保留已经确认的事实、人物和关系变化、关键事件及因果、用户意图、未完成目标、承诺、约束、冲突和不确定信息。",
      "不要虚构，不要执行工具，不要修改会话，不要输出 JSON 或解释压缩过程。",
    ].join("\n"),
    prompt: input.sourceText,
  });
  const content = result.text.trim();
  if (!content) {
    throw new Error("压缩 Agent 返回了空记忆。");
  }
  const segment: ConversationMemorySegment = {
    id: crypto.randomUUID(),
    conversationId: input.conversationId,
    level: input.level,
    startContainerId: input.startContainerId,
    endContainerId: input.endContainerId,
    source: input.source,
    sourceHash: input.sourceHash,
    content,
    leafContainerCount: input.leafContainerCount,
    sourceTokenCount: estimateTokens(input.sourceText),
    compressedTokenCount: estimateTokens(content),
    status: "ready",
    compressorId: modelName,
    compressorVersion: compressionAgentVersion,
    createdAt: new Date().toISOString(),
  };
  await upsert(memoryTable, segment.id, segment);
  return segment;
}

function selectMemoryFrontier(
  path: ChatMessageContainer[],
  segments: ConversationMemorySegment[],
) {
  const valid = validSegmentsForPath(path, segments);
  const byStart = new Map<number, ConversationMemorySegment[]>();
  for (const segment of valid) {
    const start = pathIndex(path, segment.startContainerId);
    if (start < 0) continue;
    const group = byStart.get(start) ?? [];
    group.push(segment);
    byStart.set(start, group);
  }

  const messages: ModelMessage[] = [];
  for (let index = 0; index < path.length;) {
    const candidates = (byStart.get(index) ?? []).sort((a, b) => {
      const endDifference = pathIndex(path, b.endContainerId)
        - pathIndex(path, a.endContainerId);
      return endDifference || b.level - a.level;
    });
    const selected = candidates[0];
    if (selected) {
      messages.push({
        role: "system",
        content: [
          `<conversation_memory segment="${selected.id}" range="${selected.startContainerId}..${selected.endContainerId}" level="${selected.level}">`,
          selected.content,
          "</conversation_memory>",
        ].join("\n"),
      });
      index = pathIndex(path, selected.endContainerId) + 1;
      continue;
    }
    messages.push(...containerToModelMessages(path[index]!));
    index += 1;
  }
  return messages;
}

function validSegmentsForPath(
  path: ChatMessageContainer[],
  segments: ConversationMemorySegment[],
) {
  const byId = new Map(segments.map((segment) => [segment.id, segment]));
  const validMemo = new Map<string, boolean>();
  const visiting = new Set<string>();
  const validate = (segment: ConversationMemorySegment): boolean => {
    const cached = validMemo.get(segment.id);
    if (cached !== undefined) return cached;
    if (visiting.has(segment.id)) return false;
    visiting.add(segment.id);
    if (segment.status !== "ready") {
      visiting.delete(segment.id);
      validMemo.set(segment.id, false);
      return false;
    }
    const start = pathIndex(path, segment.startContainerId);
    const end = pathIndex(path, segment.endContainerId);
    if (start < 0 || end < start) {
      visiting.delete(segment.id);
      validMemo.set(segment.id, false);
      return false;
    }
    let valid = false;
    if (segment.source.kind === "containers") {
      const source = segment.source;
      const containers = path.slice(start, end + 1);
      valid = containers.length === source.containerIds.length
        && containers.every((container, index) =>
          container.id === source.containerIds[index]
          && currentMessage(container)?.id === source.messageVersionIds[index]
        );
      if (valid) valid = hashContainerRange(containers) === segment.sourceHash;
    } else {
      const children = segment.source.segmentIds.flatMap((id) => {
        const child = byId.get(id);
        return child ? [child] : [];
      });
      valid = children.length === segment.source.segmentIds.length
        && children.every(validate)
        && segmentsAreContiguous(path, children)
        && hashText(children.map((item) => item.sourceHash).join("\n"))
          === segment.sourceHash;
    }
    visiting.delete(segment.id);
    validMemo.set(segment.id, valid);
    return valid;
  };
  return segments.filter(validate);
}

function containerToModelMessages(container: ChatMessageContainer): ModelMessage[] {
  const message = currentMessage(container);
  if (!message || message.type === "error") return [];
  const content = message.content.trim();
  const fileParts = message.parts?.filter(
    (part) => part.type === "file" || part.type === "image",
  ) ?? [];
  if (!content && !fileParts.length) return [];
  if (container.role === "system") {
    return content ? [{ role: "system", content }] : [];
  }
  if (container.role === "assistant") {
    return content ? [{ role: "assistant", content }] : [];
  }
  if (!fileParts.length) return [{ role: "user", content }];
  return [{
    role: "user",
    content: [
      ...(content ? [{ type: "text" as const, text: content }] : []),
      ...fileParts.map((part) => part.type === "image"
        ? {
            type: "image" as const,
            image: part.image,
            mediaType: part.mediaType,
          }
        : {
            type: "file" as const,
            data: part.data,
            filename: part.filename,
            mediaType: part.mediaType,
          }),
    ],
  }];
}

function hashContainerRange(containers: ChatMessageContainer[]) {
  return hashText(JSON.stringify(containers.map((container) => {
    const message = currentMessage(container);
    return {
      containerId: container.id,
      messageId: message?.id ?? "",
      type: message?.type ?? "message",
      content: message?.content ?? "",
      parts: message?.parts ?? [],
    };
  })));
}

function currentMessage(container: ChatMessageContainer): ChatMessage | null {
  if (container.activeMessage == null) return null;
  return container.content[container.activeMessage] ?? null;
}

function pathIndex(path: ChatMessageContainer[], containerId: string) {
  return path.findIndex((container) => container.id === containerId);
}

function segmentsAreContiguous(
  path: ChatMessageContainer[],
  segments: ConversationMemorySegment[],
) {
  if (!segments.length) return false;
  for (let index = 1; index < segments.length; index += 1) {
    const previousEnd = pathIndex(path, segments[index - 1]!.endContainerId);
    const currentStart = pathIndex(path, segments[index]!.startContainerId);
    if (previousEnd < 0 || currentStart !== previousEnd + 1) return false;
  }
  return true;
}

function readStateCache(key: string) {
  const value = stateCache.get(key);
  if (!value) return null;
  stateCache.delete(key);
  stateCache.set(key, value);
  return structuredClone(value);
}

function writeStateCache(key: string, value: Record<string, ContextDataValue>) {
  stateCache.delete(key);
  stateCache.set(key, structuredClone(value));
  while (stateCache.size > stateCacheLimit) {
    const oldest = stateCache.keys().next().value as string | undefined;
    if (!oldest) break;
    stateCache.delete(oldest);
  }
}

function deepFreeze<T>(value: T, seen = new WeakSet<object>()): T {
  if (!value || typeof value !== "object" || seen.has(value)) return value;
  seen.add(value);
  for (const child of Object.values(value)) deepFreeze(child, seen);
  return Object.freeze(value);
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function estimateTokens(value: string) {
  return Math.max(1, Math.ceil(value.length / 3));
}

async function runWithConcurrency<T>(
  jobs: Array<() => Promise<T>>,
  concurrency: number,
) {
  const results: T[] = [];
  for (let index = 0; index < jobs.length; index += concurrency) {
    results.push(...await Promise.all(
      jobs.slice(index, index + concurrency).map((job) => job()),
    ));
  }
  return results;
}
