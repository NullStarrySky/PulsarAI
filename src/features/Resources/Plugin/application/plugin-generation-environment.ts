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
  findPluginNodeByPath,
  pluginConventions,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginFolder,
  type PluginTreeNode,
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
  content: unknown;
  pluginId: string;
  pluginName: string;
  path: string;
  type: ReturnType<typeof pluginFileType>;
  toString(): string;
}

export interface PluginGenerationEnvironment {
  pathEnvironment: SandboxEnvironment;
  resourceEnvironment: SandboxEnvironment;
  finalEnvironment: SandboxEnvironment;
  enabledPlugins: Plugin[];
  processPlugin: Plugin | null;
  processResource: GenerationResourceValue | null;
  contextResource: GenerationResourceValue | null;
  selectedResources: GenerationResourceValue[];
  insertedResources: GenerationResourceValue[];
  actionProcessResource: GenerationResourceValue | null;
  diagnostics: PluginGenerationDiagnostic[];
}

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
  const insertedResources: GenerationResourceValue[] = [];
  const diagnostics: PluginGenerationDiagnostic[] = [];
  let contextResource: GenerationResourceValue | null = null;
  let actionProcessResource: GenerationResourceValue | null = null;
  let processPlugin: Plugin | null = null;
  let processResource: GenerationResourceValue | null = null;

  for (const plugin of enabledPlugins) {
    if (!processResource) {
      const generation = findPluginNodeByPath(
        plugin.root,
        pluginConventions.generation,
      );
      if (
        generation?.kind === "file"
        && pluginFileType(generation.name) === "javascript"
        && generationContent(generation).trim()
      ) {
        processPlugin = plugin;
        processResource = createGenerationResourceValue(plugin, generation);
      }
    }

    const insertedNodes = collectInsertedNodes(plugin.root);
    for (const node of insertedNodes) {
      const passed = await conditionsPass(
        plugin,
        node,
        pathEnvironment,
        diagnostics,
      );
      if (!passed) continue;

      const position = node.insertPosition.trim();
      if (!position) {
        diagnostics.push({
          pluginId: plugin.id,
          resourceId: node.id,
          message: "节点已标记注入，但没有指定注入位置。",
        });
        continue;
      }

      if (node.kind === "file") {
        const value = createGenerationResourceValue(plugin, node);
        insertedResources.push(value);
        appendPosition(resourceEnvironment, position, value);

        if (position === "CONTEXT_STRUCTURE" && !contextResource) {
          contextResource = value;
        }
        if (
          input.action?.pluginId === plugin.id
          && input.action.resourceId === node.id
        ) {
          actionProcessResource = value;
        }
        continue;
      }

      const values = await collectFolderValues(
        plugin,
        node,
        pathEnvironment,
        diagnostics,
      );
      insertedResources.push(...values);
      appendPosition(resourceEnvironment, position, values);
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
    processPlugin,
    processResource,
    contextResource,
    selectedResources: [],
    insertedResources,
    actionProcessResource,
    diagnostics,
  };
}

function collectInsertedNodes(folder: PluginFolder): PluginTreeNode[] {
  return [
    ...(folder.inserted ? [folder] : []),
    ...sortPluginTreeNodes(folder.children).flatMap((child) =>
      child.kind === "folder"
        ? collectInsertedNodes(child)
        : child.inserted
          ? [child]
          : [],
    ),
  ];
}

async function collectFolderValues(
  plugin: Plugin,
  folder: PluginFolder,
  environment: SandboxEnvironment,
  diagnostics: PluginGenerationDiagnostic[],
): Promise<GenerationResourceValue[]> {
  const values: GenerationResourceValue[] = [];
  for (const child of sortPluginTreeNodes(folder.children)) {
    if (
      !(await conditionsPass(plugin, child, environment, diagnostics))
    ) {
      continue;
    }
    if (child.kind === "file") {
      values.push(createGenerationResourceValue(plugin, child));
    } else {
      values.push(
        ...(await collectFolderValues(
          plugin,
          child,
          environment,
          diagnostics,
        )),
      );
    }
  }
  return values;
}

async function conditionsPass(
  plugin: Plugin,
  node: PluginTreeNode,
  environment: SandboxEnvironment,
  diagnostics: PluginGenerationDiagnostic[],
) {
  const conditionEnvironment = mergeSandboxEnvironments([
    environment,
    createPluginConditionEnvironment({
      chat: Array.isArray(environment.chat)
        ? environment.chat as ModelMessage[]
        : [],
      depth: node.insertDepth,
    }),
  ]);

  for (const condition of node.insertCondition) {
    const conditionLabel =
      `${condition.functionName}(${condition.arguments.join(", ")})`;
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
      if (!passed) return false;
    } catch (error) {
      diagnostics.push({
        pluginId: plugin.id,
        resourceId: node.id,
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
  value: GenerationResourceValue | GenerationResourceValue[],
) {
  const current = environment[position];
  if (current === undefined) {
    environment[position] = value;
    return;
  }
  const incoming = Array.isArray(value) ? value : [value];
  environment[position] = Array.isArray(current)
    ? [...current, ...incoming]
    : [current, ...incoming];
}

function createGenerationResourceValue(
  plugin: Plugin,
  resource: PluginFile,
): GenerationResourceValue {
  const interactiveDocument = isInteractiveDocumentData(resource.content)
    ? createInteractiveDocument(resource.content)
    : null;
  return {
    id: resource.id,
    name: resource.name,
    icon: resource.icon,
    content: resource.content,
    pluginId: plugin.id,
    pluginName: plugin.name,
    path: pluginNodePath(plugin.root, resource.id).join("/"),
    type: pluginFileType(resource.name),
    toString() {
      if (interactiveDocument) return interactiveDocument.toString();
      if (typeof resource.content === "string") return resource.content;
      if (resource.content == null) return "";
      return JSON.stringify(resource.content);
    },
  };
}

function generationContent(resource: PluginFile) {
  return typeof resource.content === "string" ? resource.content : "";
}

function isInteractiveDocumentData(
  value: unknown,
): value is InteractiveDocumentData {
  if (!value || typeof value !== "object") return false;
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
