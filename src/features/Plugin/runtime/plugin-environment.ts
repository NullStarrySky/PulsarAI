import {
  modelMessagesFromPath,
  useConversationStore,
} from "@/features/Conversation/store/conversation-store";
import { buildConversationResourceContext } from "@/features/Conversation/store/conversation-resource-context";
import {
  createConversationResourceOverlay,
} from "@/features/Conversation/store/conversation-resource-overlay";
import { evaluateConversationData } from "@/features/Conversation/generation/conversation-memory";
import { createPluginReferenceResolver } from "./plugin-reference-resolver";
import { usePluginStore } from "../tree/plugin-store";
import type { Plugin } from "../tree/plugin-types";

export function resolveEnvironment(
  envInput?: string | Record<string, unknown>,
): Record<string, unknown> {
  if (!envInput) return {};
  if (typeof envInput === "string") {
    const conversationStore = useConversationStore() as any;
    const pluginStore = usePluginStore() as any;
    const conv = conversationStore.conversations?.find((c: any) => c.id === envInput);
    if (!conv) return { conversationId: envInput, chat: [] };

    const chat = modelMessagesFromPath(conversationStore.containerPathForConversation(conv));

    const resourceContext = buildConversationResourceContext(
      conv,
      pluginStore.plugins || [],
      conversationStore.packages || [],
      conversationStore.conversations || [],
      conversationStore.containers || [],
    );

    return {
      conversationId: conv.id,
      conversation: conv,
      chat,
      CHAT: chat,
      packageId: conv.packageId ?? conv.binding?.packageId ?? "",
      resourceContext,
      PROJECT_AGENT_PROMPT: resourceContext,
    };
  }
  return envInput;
}

export async function ensureDataPreparsed(
  environment: Record<string, unknown>,
  visiblePlugins: Plugin[],
) {
  if (environment.dataPreparsed) return;

  const conversationStore = useConversationStore() as any;
  const conversationId = environment.conversationId as string | undefined;
  const activePath = conversationId
    ? conversationStore.activePathFor?.(conversationId) || conversationStore.activePath || []
    : [];
  const overlay = createConversationResourceOverlay(visiblePlugins, activePath);
  const resolver = createPluginReferenceResolver(overlay.plugins);
  const definitions = [...new Map(
    resolver.listDataBindings().map((definition) => [definition.id, definition]),
  ).values()];
  const evaluation = evaluateConversationData(definitions, overlay.dataValues);

  const facades: Record<string, unknown> = { ...evaluation.facades };
  for (const def of definitions) {
    facades[def.dataId] ??= evaluation.facades[def.id];
  }

  environment.dataFacades = facades;
  environment.dataDefinitions = definitions;
  environment.dataPreparsed = true;
}
