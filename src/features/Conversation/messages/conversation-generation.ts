import { createAgentResourceProvider } from "@/features/Plugin/agent/runtime/default-agent";
import { pluginConfigValue, buildPluginGenerationEnvironment } from "@/features/Plugin/runtime/environment";
import { builtinCorePluginId, usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { usePackageStore } from "@/features/Package/package-store";
import { formatChatMessageError, type ChatMessageContainer } from "./conversation-types";
import { modelMessagesFromPath, useMessageStore } from "./message-store";
import { useChatStore } from "../chats/chat-store";
import { toRaw } from "vue";

/**
 * Runs a main Plugin only after Conversation has requested and persisted its
 * assistant container. The Plugin may mutate only the supplied reply target.
 */
export async function generateRequestedAssistantReply(input: {
  chatId: string;
  containerId: string;
  activePath: ChatMessageContainer[];
  prompt: string;
}) {
  const chats = useChatStore();
  const messages = useMessageStore();
  const packages = usePackageStore();
  const plugins = usePluginStore();
  const chat = chats.chats.find((item) => item.id === input.chatId);
  const container = messages.containers.find((item) => item.id === input.containerId);
  const message = container ? messages.currentMessage(container) : null;
  if (!chat || !container || !message || container.role !== "assistant") {
    throw new Error("生成必须先请求一个有效的助手消息容器。");
  }

  chats.startGeneration(chat.id);
  const startedAt = Date.now();
  message.meta.generateInfo = { modelName: "default-agent", startTime: new Date(startedAt).toISOString() };
  let persistQueue = Promise.resolve();
  const persistReply = () => {
    persistQueue = persistQueue.then(() => messages.persist(container));
    return persistQueue;
  };
  const reply = Object.freeze({
    read: () => ({ container: structuredClone(toRaw(container)), message: structuredClone(toRaw(message)) }),
    setContent: async (content: string) => { message.content = String(content); await persistReply(); },
    clear: async () => { message.type = "message"; message.content = ""; message.parts = undefined; message.meta.steps = []; await persistReply(); },
    appendContent: async (delta: string) => { message.content += String(delta); await persistReply(); },
    addPart: async (part: NonNullable<typeof message.parts>[number]) => { message.parts ??= []; message.parts.push(structuredClone(part)); await persistReply(); },
    addStep: async (step: typeof message.meta.steps[number]) => { message.meta.steps.push(structuredClone(step)); await persistReply(); },
    updateThinking: async (id: string, content: string) => {
      const step = message.meta.steps.find((candidate) => candidate.type === "thinking" && candidate.id === id);
      if (step?.type === "thinking") step.message = content;
      await persistReply();
    },
    completeToolCall: async (result: Extract<typeof message.meta.steps[number], { type: "tool-result" }>) => {
      const index = message.meta.steps.findIndex((candidate) => candidate.type === "tool-call" && candidate.toolCallId === result.toolCallId);
      if (index >= 0) message.meta.steps.splice(index, 1, structuredClone(result));
      else message.meta.steps.push(structuredClone(result));
      await persistReply();
    },
    setModelName: async (modelName: string) => { message.meta.generateInfo!.modelName = modelName; await persistReply(); },
    fail: async (reason: string) => { message.type = "error"; message.content = formatChatMessageError(reason); await persistReply(); },
  });

  try {
    await plugins.initialize();
    const packageItem = packages.packages.find((item) => item.id === chat.packageId);
    const mainPluginId = packageItem?.mainPluginId || builtinCorePluginId;
    const enabledPlugins = plugins.enabledPluginsForPackage(
      chat.packageId,
      packageItem?.enabledGlobalPluginIds,
      mainPluginId,
    );
    const generation = await buildPluginGenerationEnvironment(enabledPlugins, {
      activePath: input.activePath,
      chat: modelMessagesFromPath(input.activePath),
      conversationId: chat.id,
      conversation: chat,
      packageId: chat.packageId,
      mainPluginId,
      containerId: container.id,
      prompt: input.prompt,
    });
    const processPlugin = generation.processPlugin;
    if (!processPlugin) throw new Error("主要插件不存在或未启用。");
    const modelOverride = pluginConfigValue(processPlugin, "generation/model");
    const environment = generation.environment;
    environment.agent = createAgentResourceProvider({
      environment,
      ...(typeof modelOverride === "string" && modelOverride.trim() ? { modelName: modelOverride } : {}),
    });
    environment.AGENT = environment.agent;
    Object.assign(environment, {
      bootstrapMessages: [],
      reply,
      ctx: environment,
    });
    if (!generation.generatePath) throw new Error("主要插件没有可执行的 generatePath。");
    await generation.selfApi.import(generation.generatePath, environment);
  } catch (error) {
    message.type = "error";
    message.content = formatChatMessageError(error);
  } finally {
    message.meta.generateInfo!.timeUsed = Date.now() - startedAt;
    await persistReply();
    await persistQueue;
    chats.finishGeneration(chat.id);
  }
}
