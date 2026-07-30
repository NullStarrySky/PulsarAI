import type { ModelMessage } from "ai";
import {
  createPluginReferenceResolver,
  type GenerationResourceValue,
  type PluginReferenceDiagnostic,
  type PluginReferenceResolver,
} from "@/features/Resources/Plugin/application/plugin-reference-resolver";
import {
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  type Plugin,
} from "@/features/Resources/Plugin/domain/plugin-types";
import type { SandboxEnvironment } from "@/features/Sandbox/domain/sandbox";

export interface GenerationPathEnvironmentInput {
  activePath: unknown[];
  chat: ModelMessage[];
  conversationId: string;
  conversation: unknown;
  packageId: string;
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
  contextResource: GenerationResourceValue | null;
  actionProcessResource: GenerationResourceValue | null;
  diagnostics: PluginGenerationDiagnostic[];
}

export async function buildPluginGenerationEnvironment(
  plugins: Plugin[],
  input: GenerationPathEnvironmentInput,
): Promise<PluginGenerationEnvironment> {
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled);
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

  let processPlugin: Plugin | null = null;
  let processResource: GenerationResourceValue | null = null;
  let contextResource: GenerationResourceValue | null = null;

  for (const plugin of enabledPlugins) {
    if (!contextResource) {
      const context = findPluginNodeByPath(
        plugin.root,
        pluginConventions.context,
      );
      if (
        context?.kind === "file"
        && pluginFileType(context.name) === "interactive-document"
      ) {
        contextResource = resolver.resourceById(context.id);
      }
    }

    if (!processResource) {
      const agentProcess = findPluginNodeByPath(
        plugin.root,
        [
          pluginConventions.agentProcessFolder,
          pluginConventions.agentProcessEntry,
        ],
      );
      if (
        agentProcess?.kind === "file"
        && pluginFileType(agentProcess.name) === "javascript"
        && typeof agentProcess.content === "string"
        && agentProcess.content.trim()
      ) {
        processPlugin = plugin;
        processResource = resolver.resourceById(agentProcess.id);
        continue;
      }

    }
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
    contextResource,
    actionProcessResource,
    diagnostics: resolver.diagnostics,
  };
}

export type { GenerationResourceValue };
