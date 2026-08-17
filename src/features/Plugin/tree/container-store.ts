import { defineStore } from "pinia";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { findPluginNodeByPath, pluginFileType, type Plugin, type PluginFile } from "@/features/Plugin/tree/plugin-types";
import coreContainersRaw from "@/features/Plugin/builtIn/core/containers.json";
import defaultContainersRaw from "@/features/Plugin/builtIn/default/containers.json";

export type PluginContainerScope = "local" | "global";
export type PluginContainerSelectionMode = "single" | "multiple" | "none";
export type PluginContainerOverrideStrategy = "override" | "merge" | "intersection";

export interface PluginContainerDeclaration {
  id: string;
  title: string;
  scope: PluginContainerScope;
  description: string;
  contentSuffixes: string[];
  selectionMode?: PluginContainerSelectionMode;
  overrideStrategy?: PluginContainerOverrideStrategy;
  selectedPaths?: string[];
}

export interface PluginContainerDefinitions {
  containers: PluginContainerDeclaration[];
  diagnostics: Array<{ path: string; message: string }>;
}

export function parsePluginContainerDefinitions(
  source: unknown,
): PluginContainerDefinitions {
  let value = source;
  const diagnostics: PluginContainerDefinitions["diagnostics"] = [];
  if (typeof source === "string") {
    try {
      value = JSON.parse(source);
    } catch (error) {
      return {
        containers: [],
        diagnostics: [{
          path: "$",
          message: error instanceof Error ? error.message : "containers.json 语法错误。",
        }],
      };
    }
  }
  if (!isRecord(value)) {
    return {
      containers: [],
      diagnostics: [{ path: "$", message: "containers.json 根节点必须是对象。" }],
    };
  }
  return {
    containers: parseContainerDeclarations(value.containers, diagnostics),
    diagnostics,
  };
}

function parseContainerDeclarations(
  value: unknown,
  diagnostics: PluginContainerDefinitions["diagnostics"],
) {
  const containers: PluginContainerDeclaration[] = [];
  if (!Array.isArray(value)) {
    diagnostics.push({ path: "$.containers", message: "containers 必须是数组。" });
    return containers;
  }
  value.forEach((rawContainer, containerIndex) => {
    const path = `$.containers[${containerIndex}]`;
    if (!isRecord(rawContainer)) {
      diagnostics.push({ path, message: "容器声明必须是对象。" });
      return;
    }
    const id = normalizedText(rawContainer.id);
    if (!id) {
      diagnostics.push({ path: `${path}.id`, message: "容器 ID 不能为空。" });
      return;
    }
    const scope = rawContainer.scope;
    if (scope !== "local" && scope !== "global") {
      diagnostics.push({ path: `${path}.scope`, message: "scope 必须是 local 或 global。" });
      return;
    }
    if (
      rawContainer.description !== undefined
      && typeof rawContainer.description !== "string"
    ) {
      diagnostics.push({ path: `${path}.description`, message: "description 必须是字符串。" });
    }
    const title = normalizedText(rawContainer.title);
    if (!title) diagnostics.push({ path: `${path}.title`, message: "title 不能为空。" });
    const description = normalizedText(rawContainer.description);
    const contentSuffixes = Array.isArray(rawContainer.contentSuffixes)
      ? rawContainer.contentSuffixes.filter((item): item is string => typeof item === "string").map((item) => item.trim().toLowerCase()).filter(Boolean)
      : [];
    if (!Array.isArray(rawContainer.contentSuffixes)) {
      diagnostics.push({ path: `${path}.contentSuffixes`, message: "contentSuffixes 必须是字符串数组。" });
    }

    let selectionMode: PluginContainerSelectionMode = "none";
    if (rawContainer.selectionMode === "single" || rawContainer.selectionMode === "multiple" || rawContainer.selectionMode === "none") {
      selectionMode = rawContainer.selectionMode;
    } else if (rawContainer.selectionMode !== undefined) {
      diagnostics.push({ path: `${path}.selectionMode`, message: "selectionMode 必须是 single、multiple 或 none。" });
    }

    let overrideStrategy: PluginContainerOverrideStrategy = "override";
    if (rawContainer.overrideStrategy === "override" || rawContainer.overrideStrategy === "merge" || rawContainer.overrideStrategy === "intersection") {
      overrideStrategy = rawContainer.overrideStrategy;
    } else if (rawContainer.overrideStrategy !== undefined) {
      diagnostics.push({ path: `${path}.overrideStrategy`, message: "overrideStrategy 必须是 override、merge 或 intersection。" });
    }

    const selectedPaths = Array.isArray(rawContainer.selectedPaths)
      ? rawContainer.selectedPaths.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
      : undefined;

    containers.push({
      id,
      title: title || id,
      scope,
      description,
      contentSuffixes,
      selectionMode,
      overrideStrategy,
      ...(selectedPaths !== undefined ? { selectedPaths } : {}),
    });
  });
  return containers;
}

export function serializePluginContainerDefinitions(
  definitions: Pick<PluginContainerDefinitions, "containers">,
) {
  return JSON.stringify({ containers: definitions.containers }, null, 2);
}



export function pluginFileMatchesContainerSuffix(
  name: string,
  suffixes: string[],
) {
  const normalized = name.trim().toLowerCase();
  const media = pluginFileType(name) === "media";
  return suffixes.some((suffix) => {
    const expected = suffix.trim().toLowerCase().replace(/^\./, "");
    return expected === "*"
      || (expected === "media" && media)
      || normalized.endsWith(`.${expected}`);
  });
}

function normalizedText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

export interface ContainerResource {
  id: string;
  pluginId: string;
  pluginName?: string;
  name: string;
  type?: string;
  path: string;
  order: number;
  condition?: string;
  conditionPath?: string;
  content?: unknown;
}

export interface ContainerQueryResult {
  id: string;
  definitionId?: string;
  name: string;
  title: string;
  scope: PluginContainerScope;
  description: string;
  contentSuffixes: string[];
  selectionMode?: string;
  overrideStrategy?: string;
  pluginId: string;
  pluginName?: string;
  selectedPaths?: string[];
  resources: ContainerResource[];
  contents: ContainerResource[];
  contentCount: number;
}

export const useContainerStore = defineStore("container", {
  state: () => ({}),
  getters: {
    activePlugins(): Plugin[] {
      const pluginStore = usePluginStore();
      const conversationStore = useConversationStore();
      return pluginStore.sortedPluginsForPackage(
        conversationStore.activePackageId,
        conversationStore.activePackage?.enabledGlobalPluginIds,
        conversationStore.activePackage?.mainPluginId,
      );
    },
    activeContainers(): ContainerQueryResult[] {
      return (useContainerStore() as any).listContainers();
    },
    activeBackgroundResource(): PluginFile | null {
      const pluginStore = usePluginStore();
      const conversationStore = useConversationStore();
      return pluginStore.activeBackgroundResourceForPackage(
        conversationStore.activePackageId,
        conversationStore.activePackage?.enabledGlobalPluginIds,
        conversationStore.activePackage?.mainPluginId,
      );
    },
  },
  actions: {
    allDeclarations(targetPlugins?: Plugin[]): Array<{ declaration: PluginContainerDeclaration; pluginId: string }> {
      const active = targetPlugins ?? this.activePlugins;
      const declarations: Array<{ declaration: PluginContainerDeclaration; pluginId: string }> = [];

      const coreDecls = parsePluginContainerDefinitions(coreContainersRaw).containers;
      for (const d of coreDecls) {
        declarations.push({ declaration: d, pluginId: "builtin-core-plugin" });
      }

      const defaultDecls = parsePluginContainerDefinitions(defaultContainersRaw).containers;
      for (const d of defaultDecls) {
        if (!declarations.some((existing) => existing.declaration.id === d.id)) {
          declarations.push({ declaration: d, pluginId: "builtin-default-plugin" });
        }
      }

      for (const plugin of active) {
        const containersNode = findPluginNodeByPath(plugin, "containers.json");
        if (containersNode && containersNode.kind === "file") {
          const decls = parsePluginContainerDefinitions(containersNode.content).containers;
          for (const d of decls) {
            if (!declarations.some((existing) => existing.declaration.id === d.id)) {
              declarations.push({ declaration: d, pluginId: plugin.id });
            }
          }
        }
      }

      return declarations;
    },

    listContainers(targetPlugins?: Plugin[]): ContainerQueryResult[] {
      const decls = this.allDeclarations(targetPlugins);
      const active = targetPlugins ?? this.activePlugins;
      return decls.map(({ declaration, pluginId }) => {
        const resources = this.getResourcesForContainer(declaration, targetPlugins);
        const plugin = active.find((p) => p.id === pluginId);
        return {
          id: declaration.id,
          definitionId: declaration.id,
          name: declaration.id,
          title: declaration.title,
          scope: declaration.scope,
          description: declaration.description,
          contentSuffixes: declaration.contentSuffixes,
          selectionMode: declaration.selectionMode,
          overrideStrategy: declaration.overrideStrategy,
          pluginId,
          pluginName: plugin?.name,
          selectedPaths: declaration.selectedPaths ?? [],
          resources,
          contents: resources,
          contentCount: resources.length,
        };
      });
    },

    getContainer(id: string, scope?: "local" | "global", targetPlugins?: Plugin[]): ContainerQueryResult | null {
      const containers = this.listContainers(targetPlugins);
      return containers.find((c) => c.id === id && (!scope || c.scope === scope)) ?? null;
    },

    getResourcesForContainer(declaration: PluginContainerDeclaration, targetPlugins?: Plugin[]): ContainerResource[] {
      const active = targetPlugins ?? this.activePlugins;
      const collected: ContainerResource[] = [];

      for (const plugin of active) {
        for (const node of plugin.nodes) {
          if (node.kind !== "file") continue;
          if (
            node.insertion?.target === declaration.id
            && pluginFileMatchesContainerSuffix(node.name, declaration.contentSuffixes)
          ) {
            collected.push({
              id: node.id,
              pluginId: plugin.id,
              pluginName: plugin.name,
              name: node.name,
              type: pluginFileType(node.name),
              path: node.path,
              order: node.order ?? 100,
              condition: node.insertion.condition,
              conditionPath: node.insertion.conditionPath,
              content: node.content,
            });
          }
        }
      }

      collected.sort((a, b) => a.order - b.order || a.pluginId.localeCompare(b.pluginId) || a.path.localeCompare(b.path));

      if (declaration.selectionMode === "single" && collected.length > 1) {
        return [collected[0]!];
      }

      return collected;
    },
  },
});
