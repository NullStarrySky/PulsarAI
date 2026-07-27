import type { ModelMessage } from "ai";
import {
  createInteractiveDocument,
  type InteractiveDocumentData,
} from "@/features/Resources/InteractiveDoc/domain/interactive-document";
import {
  executeSandboxCodeAsync,
  mergeSandboxEnvironments,
  type SandboxEnvironment,
} from "@/features/Sandbox/domain/sandbox";
import { createPluginConditionEnvironment } from "@/features/Resources/Plugin/application/plugin-condition-environment";
import {
  builtinPluginContainerIds,
  type Plugin,
  type PluginResource,
  type PluginResourceContainer,
} from "@/features/Resources/Plugin/domain/plugin-types";

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

export interface PluginGenerationDiagnostic {
  pluginId: string;
  resourceId: string;
  condition?: string;
  message: string;
}

export interface GenerationResourceValue {
  id: string;
  name: string;
  icon: string;
  description: string;
  meta: Record<string, unknown>;
  content: unknown;
  pluginId: string;
  pluginName: string;
  containerId: string;
  containerName: string;
  toString(): string;
}

export interface PluginGenerationEnvironment {
  pathEnvironment: SandboxEnvironment;
  resourceEnvironment: SandboxEnvironment;
  finalEnvironment: SandboxEnvironment;
  enabledPlugins: Plugin[];
  processPlugin: Plugin | null;
  contextResource: GenerationResourceValue | null;
  selectedResources: GenerationResourceValue[];
  insertedResources: GenerationResourceValue[];
  actionProcessResource: GenerationResourceValue | null;
  diagnostics: PluginGenerationDiagnostic[];
}

const containerAliases: Record<string, string> = {
  [builtinPluginContainerIds.background]: "background",
  [builtinPluginContainerIds.character]: "character",
  [builtinPluginContainerIds.contextStructure]: "contextStructure",
  [builtinPluginContainerIds.insertable]: "insertable",
  [builtinPluginContainerIds.action]: "actions",
  [builtinPluginContainerIds.tool]: "tools",
  [builtinPluginContainerIds.component]: "components",
};

export async function buildPluginGenerationEnvironment(
  plugins: Plugin[],
  input: GenerationPathEnvironmentInput,
): Promise<PluginGenerationEnvironment> {
  const enabledPlugins = plugins.filter((plugin) => plugin.enabled);
  const pathEnvironment: SandboxEnvironment = mergeSandboxEnvironments([
    input.baseEnvironment ?? {},
    {
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
    },
  ]);
  const resourceEnvironment: SandboxEnvironment = {};
  const selectedResources: GenerationResourceValue[] = [];
  const insertedResources: GenerationResourceValue[] = [];
  const diagnostics: PluginGenerationDiagnostic[] = [];
  const claimedContainers = new Set<string>();
  let contextResource: GenerationResourceValue | null = null;
  let actionProcessResource: GenerationResourceValue | null = null;

  for (const plugin of enabledPlugins) {
    for (const container of plugin.resources) {
      if (claimedContainers.has(container.id)) {
        continue;
      }
      claimedContainers.add(container.id);

      const values = selectedValues(plugin, container);
      selectedResources.push(...values);
      assignContainerValue(resourceEnvironment, container, values);

      if (
        container.id === builtinPluginContainerIds.contextStructure
        && values[0]
      ) {
        contextResource = values[0];
      }
    }
  }

  for (const plugin of enabledPlugins) {
    for (const container of plugin.resources) {
      for (const resource of sortResources(container.resources)) {
        if (!resource.inserted) {
          continue;
        }

        const passed = await conditionsPass(
          plugin,
          resource,
          pathEnvironment,
          diagnostics,
        );
        if (!passed) {
          continue;
        }

        const value = createGenerationResourceValue(plugin, container, resource);
        if (
          container.id === builtinPluginContainerIds.action
          && input.action?.pluginId === plugin.id
          && input.action.resourceId === resource.id
        ) {
          actionProcessResource = value;
        }

        const position = resourcePosition(resource);
        if (!position) {
          diagnostics.push({
            pluginId: plugin.id,
            resourceId: resource.id,
            message: "资源已标记插入，但元信息中没有“位置”或 position。",
          });
          continue;
        }

        insertedResources.push(value);
        appendPosition(resourceEnvironment, position, value);
      }
    }
  }

  const finalEnvironment = mergeSandboxEnvironments([
    pathEnvironment,
    resourceEnvironment,
  ]);

  return {
    pathEnvironment,
    resourceEnvironment,
    finalEnvironment,
    enabledPlugins,
    processPlugin:
      enabledPlugins.find((plugin) => plugin.generationProcess?.trim()) ?? null,
    contextResource,
    selectedResources,
    insertedResources,
    actionProcessResource,
    diagnostics,
  };
}

function selectedValues(plugin: Plugin, container: PluginResourceContainer) {
  const resources =
    container.contentControl.selectable === "none"
      ? sortResources(container.resources)
      : sortResources(container.resources).filter((resource) => resource.enabled);
  return resources.map((resource) =>
    createGenerationResourceValue(plugin, container, resource),
  );
}

function assignContainerValue(
  environment: SandboxEnvironment,
  container: PluginResourceContainer,
  values: GenerationResourceValue[],
) {
  if (container.id === builtinPluginContainerIds.action) {
    environment.actions = values;
    return;
  }
  const value =
    container.contentControl.selectable === "single"
      ? values[0] ?? null
      : values;
  environment[container.id] = value;
  const alias = containerAliases[container.id];
  if (alias) {
    environment[alias] = value;
  }
}

async function conditionsPass(
  plugin: Plugin,
  resource: PluginResource,
  environment: SandboxEnvironment,
  diagnostics: PluginGenerationDiagnostic[],
) {
  const conditionEnvironment = mergeSandboxEnvironments([
    environment,
    createPluginConditionEnvironment({
      chat: Array.isArray(environment.chat)
        ? environment.chat as ModelMessage[]
        : [],
      depth: resource.insertDepth,
    }),
  ]);

  for (const condition of resource.insertCondition) {
    const conditionLabel = `${condition.functionName}(${condition.arguments.join(", ")})`;
    try {
      let passed: unknown;
      if (condition.functionName === "custom") {
        passed = await executeSandboxCodeAsync(
          condition.arguments[0] ?? "",
          [conditionEnvironment],
        );
      } else {
        const matcher = conditionEnvironment[condition.functionName];
        if (typeof matcher !== "function") {
          throw new Error(`未知条件函数：${condition.functionName}`);
        }
        passed = await matcher(...condition.arguments);
      }
      if (!passed) {
        return false;
      }
    } catch (error) {
      diagnostics.push({
        pluginId: plugin.id,
        resourceId: resource.id,
        condition: conditionLabel,
        message: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
  return true;
}

function appendPosition(
  environment: SandboxEnvironment,
  position: string,
  value: GenerationResourceValue,
) {
  const current = environment[position];
  if (current === undefined) {
    environment[position] = value;
    return;
  }
  environment[position] = Array.isArray(current)
    ? [...current, value]
    : [current, value];
}

function resourcePosition(resource: PluginResource) {
  return resource.insertPosition.trim();
}

function createGenerationResourceValue(
  plugin: Plugin,
  container: PluginResourceContainer,
  resource: PluginResource,
): GenerationResourceValue {
  const interactiveDocument = isInteractiveDocumentData(resource.content)
    ? createInteractiveDocument(resource.content)
    : null;

  return {
    id: resource.id,
    name: resource.name,
    icon: resource.icon,
    description: resource.description,
    meta: resource.meta,
    content: resource.content,
    pluginId: plugin.id,
    pluginName: plugin.name,
    containerId: container.id,
    containerName: container.name,
    toString() {
      if (interactiveDocument) {
        return interactiveDocument.toString();
      }
      if (typeof resource.content === "string") {
        return resource.content;
      }
      if (resource.content == null) {
        return "";
      }
      return JSON.stringify(resource.content);
    },
  };
}

function isInteractiveDocumentData(value: unknown): value is InteractiveDocumentData {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Partial<InteractiveDocumentData>;
  return (
    typeof candidate.id === "string"
    && typeof candidate.name === "string"
    && Array.isArray(candidate.blocks)
    && candidate.blocks.every(
      (block) =>
        Boolean(block)
        && typeof block === "object"
        && "id" in block
        && "type" in block
        && ["text", "variable", "component"].includes(String(block.type)),
    )
  );
}

function sortResources(resources: PluginResource[]) {
  return [...resources].sort(
    (a, b) =>
      (a.order ?? 0) - (b.order ?? 0)
      || a.name.localeCompare(b.name, "zh-Hans")
      || a.id.localeCompare(b.id),
  );
}
