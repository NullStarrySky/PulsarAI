import type { ModelMessage } from "ai";
import {
  createPluginReferenceResolver,
  type GenerationResourceValue,
  type PluginReferenceDiagnostic,
  type PluginReferenceResolver,
} from "@/features/Resources/Plugin/runtime/plugin-reference-resolver";
import type { Plugin } from "@/features/Resources/Plugin/tree/plugin-types";
import { pluginGenerateFile } from "@/features/Resources/Plugin/runtime/plugin-generate-path";
import type { SandboxEnvironment } from "@/features/Sandbox/sandbox";

export interface GenerationPathEnvironmentInput {
  activePath: unknown[];
  chat: ModelMessage[];
  conversationId: string;
  conversation: unknown;
  packageId: string;
  mainPluginId: string;
  containerId: string;
  action?: {
    pluginId: string;
    resourceId: string;
    name: string;
  };
  prompt: string;
  now?: () => string;
  baseEnvironment?: SandboxEnvironment;
}

export type PluginGenerationDiagnostic = PluginReferenceDiagnostic;

export interface PluginGenerationEnvironment {
  environment: SandboxEnvironment;
  resolver: PluginReferenceResolver;
  enabledPlugins: Plugin[];
  processPlugin: Plugin | null;
  processResource: GenerationResourceValue | null;
  actionProcessResource: GenerationResourceValue | null;
  diagnostics: PluginGenerationDiagnostic[];
}

export async function buildPluginGenerationEnvironment(
  plugins: Plugin[],
  input: GenerationPathEnvironmentInput,
): Promise<PluginGenerationEnvironment> {
  const enabledPlugins = plugins.filter(
    (plugin) =>
      plugin.enabled
      || plugin.id === input.mainPluginId
      || plugin.packageId === input.packageId,
  );
  const environment: SandboxEnvironment = {
    ...(input.baseEnvironment ?? {}),
    activePath: input.activePath,
    chat: input.chat,
    CHAT: input.chat,
    conversationId: input.conversationId,
    conversation: input.conversation,
    packageId: input.packageId,
    containerId: input.containerId,
    action: input.action?.name ?? "",
    prompt: input.prompt,
    now: input.now ?? (() => new Date().toISOString()),
  };
  const resolver = createPluginReferenceResolver(enabledPlugins, {
    environment,
  });
  const blockingConflict = resolver.diagnostics.find((item) =>
    item.message.includes("冲突")
  );
  if (blockingConflict) {
    throw new Error(`插件组合冲突：${blockingConflict.message}`);
  }

  const processPlugin = enabledPlugins.find(
    (plugin) => plugin.id === input.mainPluginId,
  ) ?? null;
  let processResource: GenerationResourceValue | null = null;

  if (!processPlugin) {
    throw new Error(`主要插件不存在或未启用：${input.mainPluginId}`);
  }
  const agentProcess = pluginGenerateFile(processPlugin);
  if (agentProcess) {
    processResource = resolver.resourceById(agentProcess.id);
  } else {
    throw new Error(
      `主要插件 ${processPlugin.name} 缺少有效的 runtime/generatePath。`,
    );
  }

  const actionProcessResource = input.action
    ? enabledPlugins.find((plugin) => plugin.id === input.action?.pluginId)
      ? resolver.resourceById(input.action.resourceId)
      : null
    : null;

  return {
    environment,
    resolver,
    enabledPlugins,
    processPlugin,
    processResource,
    actionProcessResource,
    diagnostics: resolver.diagnostics,
  };
}

export type { GenerationResourceValue };
