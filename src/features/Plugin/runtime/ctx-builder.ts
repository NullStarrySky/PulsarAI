import { useChatStore } from "@/features/Conversation/chats/chat-store";
import { createComposerApi } from "@/features/Conversation/composer/composer-api";
import {
  modelMessagesFromPath,
  useMessageStore,
} from "@/features/Conversation/messages/message-store";
import type {
  ChatMessage,
  ChatMessageContainer,
  Role,
} from "@/features/Conversation/messages/conversation-types";
import { usePackageStore } from "@/features/Package/package-store";
import { createAgentResourceProvider, type AgentOutputContainer } from "@/features/Plugin/agent/runtime/default-agent";
import { parsePluginDataDefinition } from "@/features/Plugin/editors/data/plugin-data";
import { environmentTools } from "@/features/Plugin/runtime";
import { createPluginSelfApi } from "@/features/Plugin/runtime/self-api";
import { pluginConfigValue, readBuiltinAgentDocs } from "@/features/Plugin/runtime/environment";
import type { Plugin } from "@/features/Plugin/tree/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";
import { createSandboxFunction } from "@/features/Sandbox/sandbox";
import { toRaw } from "vue";

export interface CtxMessageFeature {
  containerId?: string;
  role?: Role;
  /** Create the requested role container from the chat tail when absent. */
  create?: boolean;
}

export interface CtxToolFunctionFeature {
  /** Overrides only this run's model; omitted uses the main Plugin config. */
  modelName?: string;
}

/** Every feature is opt-in. `plugin` and `toolFunction` require `message`. */
export interface CtxBuilderConfig {
  chat?: boolean | Record<string, never>;
  /** Conversation record plus a scoped management API. */
  conversation?: boolean | Record<string, never>;
  /** Current character package plus character-package management. */
  role?: boolean | Record<string, never>;
  /** The persisted composer draft API. */
  input?: boolean | Record<string, never>;
  message?: boolean | CtxMessageFeature;
  plugin?: boolean | Record<string, never>;
  toolFunction?: boolean | CtxToolFunctionFeature;
}

export interface CtxBuilderResult {
  chat?: ReturnType<typeof useChatStore>["chats"][number];
  activePath?: ChatMessageContainer[];
  container?: ChatMessageContainer;
  message?: ChatMessage;
  plugins?: Plugin[];
  selfApi?: ReturnType<typeof createPluginSelfApi>;
  reply?: AgentOutputContainer;
  flush: () => Promise<void>;
}

function feature<T extends object>(value: boolean | T | undefined): T | null {
  return value ? (value === true ? {} as T : value) : null;
}

function contextIds(ctx: SandboxEnvironment) {
  const conversationId = String(ctx.conversationId ?? "").trim();
  const pluginId = String(ctx.pluginId ?? "").trim();
  if (!conversationId) throw new Error("ctxbuilder 需要 ctx.conversationId。");
  if (!pluginId) throw new Error("ctxbuilder 需要 ctx.pluginId。");
  return { conversationId, pluginId };
}

function snapshot<T>(value: T): T {
  return structuredClone(toRaw(value));
}

function conversationManagementApi(conversationId: string) {
  const chats = useChatStore();
  const current = () => chats.chats.find((item) => item.id === conversationId) ?? null;
  return Object.freeze({
    read: () => {
      const chat = current();
      return chat ? snapshot(chat) : null;
    },
    list: () => {
      const chat = current();
      return chat
        ? chats.chatsForPackage(chat.packageId).map(snapshot)
        : [];
    },
    create: (input: Parameters<typeof chats.create>[0] = { packageId: current()?.packageId ?? "" }) =>
      chats.create(input),
    update: (patch: Parameters<typeof chats.update>[1]) => chats.update(conversationId, patch),
    remove: () => chats.remove(conversationId),
  });
}

function roleManagementApi(roleId: string) {
  const packages = usePackageStore();
  return Object.freeze({
    read: () => {
      const role = packages.packages.find((item) => item.id === roleId);
      return role ? snapshot(role) : null;
    },
    list: () => packages.sortedPackages.map(snapshot),
    create: (input?: Parameters<typeof packages.create>[0]) => packages.create(input),
    update: (patch: Parameters<typeof packages.update>[1]) => packages.update(roleId, patch),
    remove: () => packages.remove(roleId),
  });
}

function injectSelectedData(
  context: SandboxEnvironment,
  selfApi: ReturnType<typeof createPluginSelfApi>,
) {
  for (const path of selfApi.slot.paths("DATA_INJECT", "global")) {
    const definition = parsePluginDataDefinition(selfApi.read(path));
    const name = definition.varName?.trim();
    if (!name) continue;
    if (name in context) throw new Error(`数据变量名冲突：${name}`);
    const value = selfApi.import(path, context);
    if (value instanceof Promise) throw new Error(`数据注入必须同步：${path}`);
    if (value !== null) context[name] = value;
  }
}

function createReply(
  container: ChatMessageContainer,
  message: ChatMessage,
) {
  const messages = useMessageStore();
  let queue = Promise.resolve();
  const persist = () => {
    queue = queue.then(() => messages.persist(container));
    return queue;
  };
  const reply: AgentOutputContainer & Record<string, unknown> = {
    read: () => ({
      container: structuredClone(toRaw(container)),
      message: structuredClone(toRaw(message)),
    }),
    setContent: async (content: string) => {
      message.content = String(content);
      await persist();
    },
    clear: async () => {
      message.type = "message";
      message.content = "";
      message.parts = undefined;
      message.meta.steps = [];
      await persist();
    },
    addPart: async (part: NonNullable<ChatMessage["parts"]>[number]) => {
      message.parts ??= [];
      message.parts.push(structuredClone(part));
      await persist();
    },
    setModelName: async (modelName) => {
      message.meta.generateInfo ??= { modelName, startTime: new Date().toISOString() };
      message.meta.generateInfo.modelName = modelName;
      await persist();
    },
    appendContent: async (delta) => { message.content += String(delta); await persist(); },
    addStep: async (step) => { message.meta.steps.push(structuredClone(step)); await persist(); },
    updateThinking: async (id, content) => {
      const step = message.meta.steps.find((item) => item.type === "thinking" && item.id === id);
      if (step?.type === "thinking") step.message = content;
      await persist();
    },
    completeToolCall: async (result) => {
      const index = message.meta.steps.findIndex((item) =>
        item.type === "tool-call" && item.toolCallId === result.toolCallId,
      );
      if (index >= 0) message.meta.steps.splice(index, 1, structuredClone(result));
      else message.meta.steps.push(structuredClone(result));
      await persist();
    },
  };
  return { reply, flush: () => queue };
}

/**
 * Mutates `ctx` with exactly the requested capabilities.  Plugin APIs are
 * deliberately unavailable until a concrete message version is selected.
 */
export async function ctxbuilder(
  ctx: SandboxEnvironment,
  config: CtxBuilderConfig,
): Promise<CtxBuilderResult> {
  const { conversationId, pluginId } = contextIds(ctx);
  const result: CtxBuilderResult = { flush: async () => {} };
  const chatFeature = feature(config.chat);
  const conversationFeature = feature(config.conversation);
  const roleFeature = feature(config.role);
  const inputFeature = feature(config.input);
  const messageFeature = feature<CtxMessageFeature>(config.message);
  const pluginFeature = feature(config.plugin);
  const toolFeature = feature<CtxToolFunctionFeature>(config.toolFunction);

  if ((pluginFeature || toolFeature) && !messageFeature)
    throw new Error("plugin 与 toolFunction feature 必须同时请求 message feature。");

  if (chatFeature || conversationFeature || roleFeature || inputFeature || messageFeature) {
    const chat = useChatStore().chats.find((item) => item.id === conversationId);
    if (!chat) throw new Error("会话不存在。");
    const activePath = useMessageStore().pathFor(chat.lastContainerId);
    result.chat = chat;
    result.activePath = activePath;
    if (chatFeature) {
      const modelMessages = modelMessagesFromPath(activePath);
      Object.assign(ctx, { chat: modelMessages, CHAT: modelMessages, activePath });
    }
    if (conversationFeature)
      Object.assign(ctx, { conversation: snapshot(chat), conversations: conversationManagementApi(conversationId) });
    if (roleFeature) {
      const roleId = String(ctx.roleId ?? chat.packageId).trim();
      const role = usePackageStore().packages.find((item) => item.id === roleId);
      if (!role) throw new Error("角色不存在。");
      Object.assign(ctx, {
        roleId,
        role: snapshot(role),
        packageId: role.id,
        package: snapshot(role),
        roles: roleManagementApi(role.id),
      });
    }
    if (inputFeature) ctx.input = createComposerApi(conversationId);
  }

  if (messageFeature) {
    const chats = useChatStore();
    const messages = useMessageStore();
    const chat = result.chat!;
    const role = messageFeature.role ?? "assistant";
    let container = messageFeature.containerId
      ? messages.containers.find((item) => item.id === messageFeature.containerId)
      : null;
    if (!container && messageFeature.create) {
      container = await messages.append({
        conversationId,
        role,
        content: "",
        previousContainer: chat.lastContainerId,
      });
      chat.lastContainerId = container.id;
      chat.updatedAt = new Date().toISOString();
      await chats.persist(chat);
    }
    if (!container || container.conversationid !== conversationId || container.role !== role)
      throw new Error("找不到指定角色的消息容器。");
    const message = messages.currentMessage(container);
    if (!message) throw new Error("消息容器没有活动版本。");
    const replyState = createReply(container, message);
    result.container = container;
    result.message = message;
    result.reply = replyState.reply;
    result.flush = replyState.flush;
    Object.assign(ctx, { container, message, reply: replyState.reply });
  }

  if (pluginFeature) {
    const selfApi = createPluginSelfApi(pluginId, {
      conversationId,
      container: result.container,
      messageVersion: result.message,
    });
    const plugins = selfApi.plugins;
    Object.assign(ctx, {
      utils: environmentTools,
      imports: selfApi.import,
      parse: (path: string | string[], extra: SandboxEnvironment = {}) =>
        selfApi.parse(path, { ...ctx, ...extra }),
      fs: selfApi,
      read: selfApi.read,
      write: selfApi.write,
      edit: selfApi.edit,
      ls: selfApi.ls,
      exists: selfApi.exists,
      mkdir: selfApi.mkdir,
      move: selfApi.move,
      remove: selfApi.remove,
      open: selfApi.open,
      close: selfApi.close,
      toggle: selfApi.toggle,
      slot: selfApi.slot,
      logger: selfApi.logger,
      read_docs: readBuiltinAgentDocs,
      ctx,
    });
    injectSelectedData(ctx, selfApi);
    const previousFlush = result.flush;
    result.flush = async () => {
      await selfApi.flush?.();
      await previousFlush();
    };
    result.selfApi = selfApi;
    result.plugins = plugins;
  }

  if (toolFeature) {
    const plugins = result.plugins;
    const plugin = plugins?.find((item) => item.id === pluginId);
    if (!plugin || !plugins || !result.selfApi)
      throw new Error("toolFunction feature 需要已绑定的 Plugin。 ");
    const toolFiles = plugins.flatMap((owner) => owner.files.flatMap((file) => {
      const match = /^tools\/([^/]+)\/tool\.js$/i.exec(file.path);
      const promptPath = match ? `tools/${match[1]}/prompt.md` : "";
      return match && owner.files.some((candidate) => candidate.path === promptPath)
        ? [{ owner, file, name: match[1]! }]
        : [];
    })).sort((left, right) =>
      right.file.order - left.file.order || left.owner.id.localeCompare(right.owner.id) ||
      left.file.id.localeCompare(right.file.id),
    );
    for (const toolFile of toolFiles) {
      if (toolFile.name in ctx)
        throw new Error(`工具函数名称与 ctx 冲突：${toolFile.name}`);
      const source = result.selfApi.read(`@${toolFile.owner.id}/${toolFile.file.path}`);
      if (typeof source !== "string") continue;
      ctx[toolFile.name] = createSandboxFunction(source, [ctx]);
    }
    const configuredModel = pluginConfigValue(plugin, "generation/model");
    const modelName = toolFeature.modelName ??
      (typeof configuredModel === "string" && configuredModel.trim() ? configuredModel : undefined);
    const agent = createAgentResourceProvider({
      environment: ctx,
      onCodeAct: result.selfApi.recordCodeAct,
      ...(modelName ? { modelName } : {}),
    });
    Object.assign(ctx, { agent, AGENT: agent });
  }

  return result;
}
