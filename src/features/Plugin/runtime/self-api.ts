import { getActivePinia } from "pinia";
import type { ConversationResourceOperation } from "@/features/Conversation/messages/conversation-types";
import { useConversationStore } from "@/features/Conversation/store/conversation-store";
import { useContainerStore } from "@/features/Plugin/tree/container-store";
import {
  executeSandboxCode,
  executeSandboxCodeAsync,
  resolveSandboxMessages,
  resolveSandboxText,
} from "@/features/Sandbox/sandbox";
import {
  createContextDataFacade,
  parsePluginChatContext,
} from "../editors/chat/plugin-chat";
import { parsePluginDataDefinition } from "../editors/data/plugin-data";
import {
  type PluginManifestValue,
  parsePluginManifest,
  setManifestValue,
} from "../editors/manifest/plugin-manifest";
import { usePluginStore } from "../tree/plugin-store";
import {
  findPluginNodeByPath,
  type Plugin,
  type PluginTreeNode,
  pluginChildNodes,
  pluginFileType,
  pluginParentPath,
} from "../tree/plugin-types";
import {
  createPluginConditionEnvironment,
  pluginGenerateFile,
} from "./environment";
import { TraceLogger } from "./trace-logger";
import {
  globMatcher,
  normalizePath,
  parseUriPath,
  resolveRelativePluginPath,
} from "./uri";

export interface PluginSelfApiOptions {
  plugins?: Plugin[];
  onResourceOperation?: (
    operation: ConversationResourceOperation,
  ) => void | Promise<void>;
}

function plugins() {
  return getActivePinia()
    ? (usePluginStore() as unknown as { plugins: Plugin[] }).plugins
    : [];
}

function nodeMeta(node: PluginTreeNode) {
  return {
    id: node.id,
    name: node.name,
    path: `/${node.path}`,
    kind: node.kind,
    icon: node.icon,
    treeOrder: node.treeOrder,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          order: node.order,
          insertion: node.insertion
            ? structuredClone(node.insertion)
            : undefined,
        }
      : {}),
  };
}

function rootMeta(plugin: Plugin) {
  return {
    id: "",
    name: plugin.id,
    path: "/",
    kind: "folder" as const,
    icon: plugin.icon,
    treeOrder: 0,
  };
}

export function createPluginSelfApi(
  pluginId: string,
  options: PluginSelfApiOptions = {},
) {
  const store = () => usePluginStore();
  const overlayMode = Boolean(options.plugins);
  const pluginList = () => options.plugins ?? plugins();
  const record = async (operation: ConversationResourceOperation) => {
    await options.onResourceOperation?.(operation);
  };

  const requirePlugin = (targetId: string = pluginId) => {
    const plugin = pluginList().find((item) => item.id === targetId);
    if (!plugin) throw new Error(`插件不存在：${targetId}`);
    return plugin;
  };

  const resolveNode = (rawPath: string) => {
    const { targetPluginId, relPath } = parseUriPath(rawPath, pluginId);
    const plugin = requirePlugin(targetPluginId);
    const normalized = normalizePath(relPath).join("/");
    const node = findPluginNodeByPath(plugin, normalized);
    return {
      plugin,
      node,
      targetPluginId,
      canonicalPath: normalized
        ? `@${plugin.id}/${normalized}`
        : `@${plugin.id}`,
    };
  };

  const containerApi = {
    list: (input?: { scope?: "local" | "global"; pattern?: string }) => {
      const containerStore = useContainerStore();
      const all = containerStore.listContainers(pluginList());
      return all.filter((c) => {
        if (input?.scope && c.scope !== input.scope) return false;
        if (
          input?.pattern &&
          !globMatcher(input.pattern).test(c.id) &&
          !globMatcher(input.pattern).test(c.title)
        )
          return false;
        return true;
      });
    },
    get: (id: string, scope?: "local" | "global") => {
      const containerStore = useContainerStore();
      return containerStore.getContainer(id, scope, pluginList());
    },
    read: async (
      id: string,
      scope?: "local" | "global",
      envInput?: Record<string, unknown>,
    ) => {
      const containerStore = useContainerStore();
      const container = containerStore.getContainer(id, scope, pluginList());
      if (!container) return [];
      const results: Array<{ resource: string; content: unknown }> = [];
      for (const res of container.resources) {
        const canonical = `@${res.pluginId}/${res.path}`;
        const content = await importResource(canonical, envInput);
        if (content != null) {
          results.push({ resource: canonical, content });
        }
      }
      return results;
    },
    import: async (
      id: string,
      scope?: "local" | "global",
      envInput?: Record<string, unknown>,
    ) => {
      return containerApi.read(id, scope, envInput);
    },
  };

  const configApi = {
    list: (targetId: string = pluginId) => {
      const plugin = requirePlugin(targetId);
      const manifestNode = findPluginNodeByPath(plugin, "manifest.json");
      if (!manifestNode || manifestNode.kind !== "file") return [];
      const parsed = parsePluginManifest(manifestNode.content);
      return parsed.manifest;
    },
    get: (keyOrGroupId: string, contentId?: string) => {
      const plugin = requirePlugin(pluginId);
      const manifestNode = findPluginNodeByPath(plugin, "manifest.json");
      if (!manifestNode || manifestNode.kind !== "file") return null;
      const parsed = parsePluginManifest(manifestNode.content);
      if (!contentId) {
        for (const group of parsed.manifest) {
          for (const item of group.content) {
            if (item.id === keyOrGroupId) return item.value;
          }
        }
        return null;
      }
      const group = parsed.manifest.find(
        (item) => item.group.id === keyOrGroupId,
      );
      const item = group?.content.find((entry) => entry.id === contentId);
      return item?.value ?? null;
    },
    set: async (groupId: string, contentId: string, value: unknown) => {
      const plugin = requirePlugin(pluginId);
      const manifestNode = findPluginNodeByPath(plugin, "manifest.json");
      if (!manifestNode || manifestNode.kind !== "file") {
        throw new Error(`插件 ${pluginId} 未包含 manifest.json 文件。`);
      }
      const parsed = parsePluginManifest(manifestNode.content);
      setManifestValue(
        parsed.manifest,
        groupId,
        contentId,
        value as PluginManifestValue,
      );
      manifestNode.content = parsed.manifest;
      if (overlayMode) {
        await record({
          type: "edit",
          target: {
            kind: "plugin-node",
            pluginId,
            resourceId: manifestNode.id,
          },
          value: {
            id: manifestNode.id,
            name: manifestNode.name,
            path: manifestNode.path,
            icon: manifestNode.icon ?? "",
            treeOrder: manifestNode.treeOrder,
            kind: "file",
            content: structuredClone(parsed.manifest),
            order: manifestNode.order,
            insertion: manifestNode.insertion
              ? structuredClone(manifestNode.insertion)
              : undefined,
          },
        });
      } else {
        await store().updateNode(pluginId, manifestNode.id, {
          content: parsed.manifest,
        });
      }
    },
  };

  const importResource = async (
    path: string,
    envInput?: string | Record<string, unknown>,
  ) => {
    const { plugin, node, canonicalPath } = resolveNode(path);
    if (!node || node.kind !== "file") {
      throw new Error(`import 只接受文件节点：${path}`);
    }

    const currentEnvironment: Record<string, any> =
      typeof envInput === "string"
        ? { conversationId: envInput }
        : { ...(envInput ?? {}) };
    const logger: TraceLogger | undefined = (currentEnvironment as any).logger;

    logger?.append(`Import: ${canonicalPath}`, 0, "import", canonicalPath);

    if (node.insertion?.condition || node.insertion?.conditionPath) {
      let pass = true;
      if (node.insertion.conditionPath) {
        const condNode = findPluginNodeByPath(
          plugin,
          node.insertion.conditionPath,
        );
        if (
          condNode &&
          condNode.kind === "file" &&
          typeof condNode.content === "string"
        ) {
          const result = executeSandboxCode(condNode.content, [
            createPluginConditionEnvironment(currentEnvironment.chat),
            currentEnvironment,
          ]);
          pass = Boolean(result);
        }
      }
      if (pass && node.insertion.condition) {
        const result = executeSandboxCode(node.insertion.condition, [
          createPluginConditionEnvironment(currentEnvironment.chat),
          currentEnvironment,
        ]);
        pass = Boolean(result);
      }

      logger?.append(
        `Condition evaluated: ${pass}`,
        1,
        "condition",
        canonicalPath,
      );

      if (!pass) {
        return null;
      }
    }

    const rawContent = node.content;
    const fileType = pluginFileType(node.name);

    if (fileType === "data") {
      const def = parsePluginDataDefinition(rawContent).definition;
      return createContextDataFacade(
        { name: node.name, wrapperSource: def.wrapperSource },
        def.initialValue,
        { readonly: true },
      );
    }

    if (fileType === "chat") {
      const parsed = parsePluginChatContext(rawContent);
      const enabledMessages = parsed.message.filter((m) => m.enabled !== false);
      const compiledMessages = resolveSandboxMessages(enabledMessages as any, [
        currentEnvironment,
      ]);
      return { message: compiledMessages };
    }

    if (fileType === "markdown") {
      const text =
        typeof rawContent === "string"
          ? rawContent
          : JSON.stringify(rawContent);
      return resolveSandboxText(text, [currentEnvironment]);
    }

    if (fileType === "javascript") {
      const code =
        typeof rawContent === "string" ? rawContent : String(rawContent ?? "");
      const res = await executeSandboxCodeAsync(code, [
        {
          ...currentEnvironment,
          imports: (importPath: string) => {
            const trimmed = importPath.trim();
            const resolvedPath = trimmed.startsWith("@")
              ? trimmed
              : `@/${resolveRelativePluginPath(node.path.split("/").slice(0, -1), trimmed)}`;
            return importResource(resolvedPath, currentEnvironment);
          },
          container: containerApi,
          config: configApi,
        },
      ]);
      return res;
    }

    if (fileType === "json") {
      if (typeof rawContent === "string") {
        try {
          return JSON.parse(rawContent);
        } catch {
          return rawContent;
        }
      }
      return rawContent;
    }

    return rawContent;
  };

  const runResource = async (
    path: string,
    envInput?: string | Record<string, unknown>,
  ) => {
    const { plugin, node } = resolveNode(path);
    if (!node || node.kind !== "file") throw new Error("run 只接受文件节点。");

    const fileType = pluginFileType(node.name);
    if (fileType === "component") {
      store().openFileEditor(plugin, node, node.path, "preview");
      return;
    }

    if (fileType !== "javascript")
      throw new Error("run 只接受 JavaScript 文件或 .vue 组件文件。");
    const environment =
      typeof envInput === "string"
        ? { conversationId: envInput }
        : { ...(envInput ?? {}) };
    const code =
      typeof node.content === "string"
        ? node.content
        : JSON.stringify(node.content ?? "");
    return executeSandboxCodeAsync(code, [
      { ...environment, container: containerApi, config: configApi },
    ]);
  };

  return {
    read: async (path: string) => {
      const { plugin, node } = resolveNode(path);
      if (!node) return rootMeta(plugin);
      if (node.kind === "folder") return nodeMeta(node);
      return typeof node.content === "string"
        ? node.content
        : JSON.stringify(node.content);
    },

    readMeta: async (path: string) => {
      const { plugin, node } = resolveNode(path);
      if (!node) return rootMeta(plugin);
      return nodeMeta(node);
    },

    write: async (path: string, content: unknown, meta?: object) => {
      const { targetPluginId, relPath } = parseUriPath(path, pluginId);
      const normalizedPath = normalizePath(relPath).join("/");
      let plugin = pluginList().find((item) => item.id === targetPluginId);

      if (!plugin) {
        plugin = {
          id: targetPluginId,
          packageId: null,
          name: targetPluginId,
          icon: "",
          shortDescription: "",
          nodes: [],
          enabled: true,
          builtIn: false,
        };
        if (!overlayMode) await store().persistPlugin(plugin);
      }

      const fileName = normalizedPath.split("/").pop()!;
      const parentPath = pluginParentPath(normalizedPath);
      if (overlayMode) {
        await record({
          type: "create",
          pluginId: plugin.id,
          parentPath,
          node: {
            id: crypto.randomUUID(),
            name: fileName,
            path: normalizedPath,
            icon: "",
            treeOrder: 0,
            kind: "file",
            content,
            order: (meta as any)?.order ?? 100,
            insertion: (meta as any)?.insertion
              ? structuredClone((meta as any).insertion)
              : undefined,
          },
        });
      } else {
        await store().createFile(plugin.id, parentPath, {
          name: fileName,
          content,
        });
      }
    },

    edit: async (path: string, find: string, replace: string) => {
      const { plugin, node } = resolveNode(path);
      if (!node || node.kind !== "file" || typeof node.content !== "string") {
        throw new Error(`edit 只接受文本文件：${path}`);
      }
      if (!node.content.includes(find)) {
        throw new Error(`未匹配到待替换目标：${find}`);
      }
      const updated = node.content.replace(find, replace);
      if (overlayMode) {
        await record({
          type: "edit",
          target: {
            kind: "plugin-node",
            pluginId: plugin.id,
            resourceId: node.id,
          },
          value: {
            id: node.id,
            name: node.name,
            path: node.path,
            icon: node.icon ?? "",
            treeOrder: node.treeOrder,
            kind: "file",
            content: updated,
            order: node.order,
            insertion: node.insertion
              ? structuredClone(node.insertion)
              : undefined,
          },
        });
      } else {
        node.content = updated;
        await store().updateNode(plugin.id, node.id, { content: updated });
      }
    },

    ls: async (path?: string) => {
      if (!path || path === "@" || path === "@/") {
        return pluginList().map(rootMeta);
      }
      const { plugin, node } = resolveNode(path);
      const children = pluginChildNodes(plugin, node ? node.path : "");
      return children.map(nodeMeta);
    },

    exists: async (path: string) => {
      try {
        const { node } = resolveNode(path);
        return Boolean(node);
      } catch {
        return false;
      }
    },

    mkdir: async (path: string) => {
      const { plugin, node } = resolveNode(path);
      if (node) return;
      const { relPath } = parseUriPath(path, pluginId);
      const normalizedPath = normalizePath(relPath).join("/");
      const folderName = normalizedPath.split("/").pop()!;
      const parentPath = pluginParentPath(normalizedPath);
      if (overlayMode) {
        await record({
          type: "create",
          pluginId: plugin.id,
          parentPath,
          node: {
            id: crypto.randomUUID(),
            name: folderName,
            path: normalizedPath,
            icon: "",
            treeOrder: 0,
            kind: "folder",
          },
        });
      } else {
        await store().createFolder(plugin.id, parentPath, folderName);
      }
    },

    move: async (from: string, to: string) => {
      const source = resolveNode(from);
      if (!source.node) throw new Error(`源路径不存在：${from}`);
      const { targetPluginId, relPath } = parseUriPath(to, pluginId);
      const targetNormalized = normalizePath(relPath).join("/");
      const targetParentPath = pluginParentPath(targetNormalized);
      const targetName = targetNormalized.split("/").pop()!;
      if (overlayMode) {
        await record({
          type: "move",
          pluginId: source.plugin.id,
          resourceId: source.node.id,
          targetPluginId: targetPluginId || source.plugin.id,
          targetParentPath,
          name: targetName,
        });
      } else {
        await store().moveNode(
          source.plugin.id,
          source.node.id,
          targetParentPath,
        );
      }
    },

    remove: async (targetPath: string) => {
      const { targetPluginId, relPath } = parseUriPath(targetPath, pluginId);
      const normalizedPath = normalizePath(relPath).join("/");
      if (!normalizedPath) {
        if (overlayMode) throw new Error("Overlay 模式下不支持删除整个插件。");
        await store().deletePlugin(targetPluginId);
        return;
      }
      const targetPlugin = pluginList().find((p) => p.id === targetPluginId);
      const targetNode = targetPlugin
        ? findPluginNodeByPath(targetPlugin, normalizedPath)
        : null;
      if (!targetNode) return;

      if (overlayMode) {
        await record({
          type: "remove",
          target: {
            kind: "plugin-node",
            pluginId: targetPluginId,
            resourceId: targetNode.id,
          },
        });
      } else {
        await store().deleteNode(targetPluginId, targetNode.id);
      }
    },

    import: importResource,
    run: runResource,
    test: async (path: string, envInput?: string | Record<string, unknown>) => {
      const logger = new TraceLogger();
      const environment =
        typeof envInput === "string"
          ? { conversationId: envInput }
          : { ...(envInput ?? {}) };
      let error: string | undefined;
      let value: unknown;
      try {
        value = await importResource(path, { ...environment, logger });
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      return {
        value,
        error,
        logs: logger.logs,
        formattedText: logger.toFormattedText(),
      };
    },
    container: containerApi,
    config: configApi,
    getMainPlugin: (packageId?: string) => {
      const conversationStore = useConversationStore();
      const targetPackageId = packageId ?? conversationStore.activePackageId;
      const pkg = conversationStore.activePackage;
      const mainId = pkg?.mainPluginId;
      const available = store().sortedPluginsForPackage(
        targetPackageId,
        pkg?.enabledGlobalPluginIds,
        mainId,
      );
      const mainPlugin = available.find((p) => p.id === mainId) ?? available[0];
      if (!mainPlugin) return null;
      const generateFile = pluginGenerateFile(mainPlugin);
      return {
        id: mainPlugin.id,
        name: mainPlugin.name,
        generatePath: generateFile ? generateFile.path : null,
      };
    },
  };
}
