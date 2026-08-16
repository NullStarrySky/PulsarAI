import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { normalizeMarkdownLineBreaks } from "@/lib/markdown";
import { useConversationStore } from "@/features/Resources/Conversation/store/conversation-store";
import type { ConversationResourceOperation } from "@/features/Resources/Conversation/messages/conversation-types";
import { pluginNodeSnapshot } from "@/features/Resources/Conversation/store/conversation-resource-overlay";
import { createPluginReferenceResolver } from "./plugin-reference-resolver";
import {
  evaluateConditionResult,
  parseTextPartsWithMacros,
  renderPartsToString,
  resolvePluginChatMacros,
} from "./plugin-macros";
import { resolveEnvironment, ensureDataPreparsed } from "./plugin-environment";
import { globMatcher, normalizePath, parseUriPath, resolveRelativePluginPath } from "./plugin-uri";
import { pluginGenerateFile } from "./plugin-generate-path";
import { isJsonValue, parsePluginManifest, setManifestValue } from "../editors/manifest/plugin-manifest";
import { usePluginStore } from "../tree/plugin-store";
import {
  findPluginNodeByPath,
  findPluginTreeParent,
  findPluginTreeNode,
  flattenPluginFiles,
  pluginFileType,
  pluginNodePath,
  sortPluginTreeNodes,
  type Plugin,
  type PluginFile,
  type PluginFolder,
  type PluginTreeNode,
} from "../tree/plugin-types";
import { TraceLogger, type ConditionResults } from "./plugin-test";

export interface PluginSelfApiOptions {
  /** Supplying plugins enables Conversation overlay mode and prevents store persistence. */
  plugins?: Plugin[];
  onResourceOperation?: (operation: ConversationResourceOperation) => void | Promise<void>;
}

function plugins() {
  return (usePluginStore() as unknown as { plugins: Plugin[] }).plugins;
}

function nodeMeta(plugin: Plugin, node: PluginTreeNode) {
  return {
    id: node.id,
    name: node.name,
    path: `/${pluginNodePath(plugin.root, node.id).join("/")}`,
    kind: node.kind,
    icon: node.icon,
    treeOrder: node.treeOrder,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          order: node.order,
          insertion: node.insertion ? structuredClone(node.insertion) : undefined,
        }
      : {}),
  };
}

export function createPluginSelfApi(
  pluginId: string,
  options: PluginSelfApiOptions = {},
) {
  const store = usePluginStore();
  const overlayMode = Boolean(options.plugins);
  const pluginList = () => options.plugins ?? plugins();
  const record = async (operation: ConversationResourceOperation) => {
    await options.onResourceOperation?.(operation);
  };
  const currentResolver = () => createPluginReferenceResolver(pluginList());
  const currentContainer = (scope: "local" | "global", id: string) => {
    const resolver = currentResolver();
    const container = resolver.listContainers().find(
      (item) => item.scope === scope && (item.name === id || item.id === id),
    );
    return { resolver, container };
  };

  const requirePlugin = (targetId: string = pluginId) => {
    const plugin = pluginList().find((item) => item.id === targetId);
    if (!plugin) throw new Error(`插件不存在：${targetId}`);
    return plugin;
  };

  const requireNode = (rawPath: string) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(rawPath, pluginId);
    const plugin = requirePlugin(targetPluginId);
    if (isPluginRoot || relPath === "") {
      return { plugin, node: plugin.root, isRoot: true };
    }
    const node = findPluginNodeByPath(plugin.root, normalizePath(relPath));
    if (!node) throw new Error(`插件路径不存在：${rawPath}`);
    return { plugin, node, isRoot: false };
  };


  const read = (path: string) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(path, pluginId);
    const plugin = pluginList().find((item) => item.id === targetPluginId);
    if (isPluginRoot || relPath === "") {
      if (!plugin) throw new Error(`插件不存在：${targetPluginId}`);
      return summary(plugin);
    }
    if (!plugin) throw new Error(`插件不存在：${targetPluginId}`);
    const node = findPluginNodeByPath(plugin.root, normalizePath(relPath));
    if (!node) throw new Error(`插件路径不存在：${path}`);
    return node.kind === "file" ? structuredClone(node.content) : nodeMeta(plugin, node);
  };

  const readMeta = (path: string) => {
    const { plugin, node } = requireNode(path);
    return nodeMeta(plugin, node);
  };

  const exists = (path: string) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(path, pluginId);
    const plugin = pluginList().find((item) => item.id === targetPluginId);
    if (!plugin) return false;
    if (isPluginRoot || relPath === "") return true;
    return Boolean(findPluginNodeByPath(plugin.root, normalizePath(relPath)));
  };

  const ls = (path = "") => {
    const trimmed = path.trim();
    if (trimmed === "@") {
      return pluginList().map(summary);
    }
    const { plugin, node } = requireNode(path);
    if (node.kind !== "folder") throw new Error("目标路径不是文件夹。");
    return sortPluginTreeNodes(node.children).map((child) => nodeMeta(plugin, child));
  };

  const write = async (
    path: string,
    content: unknown,
    meta: Partial<Pick<PluginFile, "icon" | "treeOrder" | "order">> & {
      insertion?: PluginFile["insertion"] | null;
    } = {},
  ) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(path, pluginId);
    const targetPlugin = pluginList().find((item) => item.id === targetPluginId);

    // If writing to a non-existent plugin root, create global plugin
    if (!targetPlugin && isPluginRoot) {
      if (overlayMode) throw new Error("会话 Overlay 不支持创建插件根；请在插件管理器中创建插件。");
      const created = await store.createGlobalPlugin();
      const patchName = typeof content === "string" ? content : (meta as { name?: string }).name || targetPluginId;
      await store.updatePlugin(created.id, {
        name: patchName,
        shortDescription: (meta as { description?: string }).description,
        icon: meta.icon,
      });
      const finalPlugin = pluginList().find((p) => p.id === created.id) || created;
      return summary(finalPlugin);
    }

    if (!targetPlugin) throw new Error(`目标插件不存在：${targetPluginId}`);

    const node = findPluginNodeByPath(targetPlugin.root, normalizePath(relPath));
    if (!node) throw new Error(`目标文件路径不存在：${path}`);
    if (node.kind !== "file") throw new Error("只能写入文件。");

    const { insertion, ...restMeta } = meta;
    if (overlayMode) {
      Object.assign(node, {
        content: structuredClone(content),
        ...restMeta,
        ...(insertion !== undefined ? { insertion: insertion ?? undefined } : {}),
      });
      await record({
        type: "edit",
        target: { kind: "plugin-node", pluginId: targetPlugin.id, resourceId: node.id },
        value: pluginNodeSnapshot(node),
      });
    } else {
      await store.updateNode(targetPlugin.id, node.id, {
        content,
        ...restMeta,
        ...(insertion !== undefined ? { insertion: insertion ?? undefined } : {}),
      });
    }
    return nodeMeta(targetPlugin, node);
  };

  const edit = async (path: string, find: string, replace: string) => {
    const { node } = requireNode(path);
    if (node.kind !== "file" || typeof node.content !== "string") {
      throw new Error("精准编辑只支持文本文件。");
    }
    const first = node.content.indexOf(find);
    if (first < 0 || node.content.indexOf(find, first + find.length) >= 0) {
      throw new Error("find 必须在文件中唯一匹配一次。");
    }
    return write(path, node.content.slice(0, first) + replace + node.content.slice(first + find.length));
  };

  const mkdir = async (path: string) => {
    const { targetPluginId, relPath } = parseUriPath(path, pluginId);
    const plugin = requirePlugin(targetPluginId);
    const parts = normalizePath(relPath);
    const name = parts.pop();
    if (!name) throw new Error("文件夹路径不能为空。");
    const parentPath = parts.join("/");
    const parentNode = parentPath ? findPluginNodeByPath(plugin.root, parts) : plugin.root;
    if (!parentNode || parentNode.kind !== "folder") throw new Error("父路径不是文件夹。");
    let node: PluginFolder | undefined;
    if (overlayMode) {
      node = {
        id: crypto.randomUUID(),
        name,
        icon: "folder",
        treeOrder: parentNode.children.length,
        kind: "folder",
        children: [],
      };
      parentNode.children.push(node);
      await record({
        type: "create",
        pluginId: plugin.id,
        parentId: parentNode.id,
        node: pluginNodeSnapshot(node),
      });
    } else {
      node = await store.createFolder(plugin.id, parentNode.id, name) ?? undefined;
    }
    if (!node) throw new Error("创建文件夹失败。");
    return nodeMeta(plugin, node);
  };

  const move = async (from: string, to: string) => {
    const source = requireNode(from);
    const { targetPluginId: toPluginId, relPath: toRelPath } = parseUriPath(to, pluginId);
    const targetPlugin = requirePlugin(toPluginId);
    const targetParts = normalizePath(toRelPath);
    const newName = targetParts.pop();
    const targetParent = targetParts.length ? findPluginNodeByPath(targetPlugin.root, targetParts) : targetPlugin.root;
    if (!targetParent || targetParent.kind !== "folder") throw new Error("目标父路径不是文件夹。");
    const finalName = newName || source.node.name;
    if (overlayMode) {
      if (source.isRoot) throw new Error("会话 Overlay 不支持移动插件根。");
      const sourceParent = findPluginTreeParent(source.plugin.root, source.node.id);
      if (!sourceParent) throw new Error("移动源的父文件夹不存在。");
      if (
        source.node.kind === "folder"
        && findPluginTreeNode(source.node, targetParent.id)
      ) {
        throw new Error("不能把文件夹移动到自身或其后代中。");
      }
      sourceParent.children.splice(sourceParent.children.findIndex((item) => item.id === source.node.id), 1);
      source.node.name = finalName;
      targetParent.children.push(source.node);
      await record({
        type: "move",
        pluginId: source.plugin.id,
        resourceId: source.node.id,
        targetPluginId: targetPlugin.id,
        parentId: targetParent.id,
        name: finalName,
      });
    } else {
      await store.moveNode(source.plugin.id, source.node.id, targetParent.id);
      if (newName && newName !== source.node.name) {
        await store.updateNode(source.plugin.id, source.node.id, { name: newName });
      }
    }
    return nodeMeta(source.plugin, source.node);
  };

  const remove = async (targetPath: string) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(targetPath, pluginId);
    if (isPluginRoot || relPath === "") {
      if (overlayMode) throw new Error("会话 Overlay 不支持删除插件根。");
      await store.deletePlugin(targetPluginId);
      return;
    }
    const { plugin, node } = requireNode(targetPath);
    if (overlayMode) {
      const parent = findPluginTreeParent(plugin.root, node.id);
      if (!parent) throw new Error("删除目标的父文件夹不存在。");
      parent.children.splice(parent.children.findIndex((item) => item.id === node.id), 1);
      await record({
        type: "remove",
        target: { kind: "plugin-node", pluginId: plugin.id, resourceId: node.id },
      });
    } else {
      await store.deleteNode(plugin.id, node.id);
    }
  };

  const runScript = async (path: string, envInput?: string | Record<string, unknown>) => {
    const { plugin, node } = requireNode(path);
    if (node.kind !== "file") {
      throw new Error("run 只接受文件节点。");
    }

    const fileType = pluginFileType(node.name);

    if (fileType === "component" || node.name.toLocaleLowerCase().endsWith(".vue")) {
      const relPath = `/${pluginNodePath(plugin.root, node.id).join("/")}`;
      const store = usePluginStore();
      if (overlayMode) throw new Error("会话 Overlay 中不能打开编辑器预览。");
      store.openFileEditor(plugin, node, relPath, "preview");
      return {
        opened: true,
        mode: "preview",
        path: `@${plugin.id}${relPath}`,
      };
    }

    if (fileType !== "javascript") {
      throw new Error("run 只接受 JavaScript 文件或 .vue 组件文件。");
    }

    const environment = resolveEnvironment(envInput);
    await ensureDataPreparsed(environment, pluginList());
    const resolver = createPluginReferenceResolver(pluginList());
    const prepared = resolver.prepareJavaScript(node.id);
    return executeSandboxCodeAsync(prepared.source, [environment, prepared.environment]);
  };

  const importResource = async (path: string, envInput?: string | Record<string, unknown>) => {
    const { plugin, node } = requireNode(path);
    if (node.kind !== "file") {
      throw new Error("import 只接受文件节点。");
    }

    const environment = resolveEnvironment(envInput);
    await ensureDataPreparsed(environment, pluginList());
    const stack = (environment.stack as string[]) || [];
    const logger = (environment.logger as TraceLogger) || new TraceLogger();

    const relPathParts = pluginNodePath(plugin.root, node.id);
    const canonicalPath = `@${plugin.id}/${relPathParts.join("/")}`;
    const currentDepth = stack.length;

    // 1. 递归循环引用检测
    if (stack.includes(canonicalPath)) {
      const cycleChain = [...stack, canonicalPath].join(" -> ");
      logger.append(`[循环引用错误] 检测到递归引用: ${cycleChain}`, currentDepth, "error", canonicalPath);
      throw new Error(`检测到循环引用: ${cycleChain}`);
    }

    // 2. 入栈并记录 Trace 日志
    logger.append(`开始导入文件: ${canonicalPath}`, currentDepth, "import", canonicalPath);
    stack.push(canonicalPath);

    try {
      // 3. 计算节点条件表达式（如果有）并写 Trace 日志
      if (node.insertion?.condition) {
        const condRes = evaluateConditionResult(node.insertion.condition, environment);
        logger.append(
          `条件规则 [${node.insertion.condition}] 匹配结果: ${condRes?.finalResult ?? false}`,
          currentDepth,
          "condition",
          canonicalPath,
        );
      }

      // 4. 构造包含文档自身元数据的环境对象 $file
      const currentEnvironment: Record<string, unknown> = {
        ...environment,
        stack,
        logger,
        container: containerApi,
        config: configApi,
        $file: {
          name: node.name,
          path: canonicalPath,
          relPath: relPathParts.join("/"),
          pluginId: plugin.id,
        },
      };
      currentEnvironment.pluginImport = (targetPath: string) => {
        const path = targetPath.trim();
        const resolvedPath = path.startsWith("@")
          ? path
          : `@/${resolveRelativePluginPath(relPathParts.slice(0, -1), path)}`;
        return importResource(resolvedPath, currentEnvironment);
      };

      const fileType = pluginFileType(node.name);

      if (fileType === "data") {
        const facades = environment.dataFacades as Record<string, unknown> | undefined;
        if (facades && facades[node.id] !== undefined) {
          return facades[node.id];
        }
      }

      if (fileType === "chat") {
        return resolvePluginChatMacros(node.content, currentEnvironment, plugin.id);
      }

      if (fileType === "json") {
        try {
          return typeof node.content === "string" ? JSON.parse(node.content) : node.content;
        } catch {
          return node.content;
        }
      }

      // 5. 对文本或 markdown 执行宏评估
      const contentStr = normalizeMarkdownLineBreaks(
        typeof node.content === "string" ? node.content : JSON.stringify(node.content ?? ""),
      );
      const parts = await parseTextPartsWithMacros(
        contentStr,
        currentEnvironment,
        { textTruncateLength: Infinity },
        plugin.id,
      );
      const resultString = renderPartsToString(parts);
      return resultString;
    } finally {
      // 6. 弹栈
      stack.pop();
      logger.append(`完成导入文件: ${canonicalPath}`, currentDepth, "import", canonicalPath);
    }
  };

  const testCondition = async (
    conditionCode: string,
    envInput?: string | Record<string, unknown>,
  ): Promise<ConditionResults> => {
    const environment = resolveEnvironment(envInput);
    return evaluateConditionResult(conditionCode, environment);
  };

  const test = async (
    path: string,
    envInput?: string | Record<string, unknown>,
  ) => {
    const resolvedEnvironment = resolveEnvironment(envInput);
    const logger = (resolvedEnvironment.logger as TraceLogger) || new TraceLogger();
    const environment = { ...resolvedEnvironment, logger };
    let value: unknown = null;
    let error: string | null = null;
    try {
      value = await importResource(path, environment);
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
    return {
      value,
      error,
      logs: logger.logs,
      formattedText: logger.toFormattedText(true),
    };
  };

  const grep = async (path: string, pattern: string) => {
    const { targetPluginId, relPath, isPluginRoot } = parseUriPath(path, pluginId);
    const plugin = requirePlugin(targetPluginId);
    const rootNode = isPluginRoot || !relPath ? plugin.root : findPluginNodeByPath(plugin.root, normalizePath(relPath));
    if (!rootNode) throw new Error(`路径不存在：${path}`);

    const files = rootNode.kind === "file"
      ? [rootNode]
      : flattenPluginFiles(rootNode);

    const regex = new RegExp(pattern, "i");
    const results: Array<{ path: string; line: number; content: string }> = [];

    for (const file of files) {
      if (typeof file.content === "string") {
        const lines = file.content.split("\n");
        lines.forEach((lineContent, idx) => {
          if (regex.test(lineContent)) {
            const relNodePath = pluginNodePath(plugin.root, file.id).join("/");
            results.push({
              path: `@${plugin.id}/${relNodePath}`,
              line: idx + 1,
              content: lineContent,
            });
          }
        });
      }
    }
    return results;
  };

  const getMainPlugin = (packageId?: string) => {
    const conversation = useConversationStore();
    const targetPackage = packageId
      ? conversation.packages.find((item) => item.id === packageId)
      : conversation.activePackage;
    const plugin = pluginList().find((item) => item.id === targetPackage?.mainPluginId);
    if (!plugin || !pluginGenerateFile(plugin)) {
      throw new Error("主要插件不存在或 generatePath 无效。");
    }
    return summary(plugin);
  };

  const containerApi = {
    list: (input: { scope?: "local" | "global"; pattern?: string } = {}) => {
      let list = currentResolver().listContainers();
      if (input.scope) {
        list = list.filter((item) => item.scope === input.scope);
      }
      if (input.pattern) {
        const matcher = globMatcher(input.pattern);
        list = list.filter((item) => matcher.test(item.name));
      }
      return list;
    },
    get: (id: string, scope?: "local" | "global") => {
      const targetScope = scope ?? "local";
      const { resolver, container } = currentContainer(targetScope, id);
      return container ? resolver.getContainer(container.id) : null;
    },
    read: (id: string, scope?: "local" | "global") => {
      const targetScope = scope ?? "local";
      const { resolver, container } = currentContainer(targetScope, id);
      if (!container) throw new Error(`容器不存在：${targetScope}/${id}`);
      return resolver.readContainer(container.id);
    },
    import: (id: string, scope?: "local" | "global") => {
      const targetScope = scope ?? "local";
      const { resolver, container } = currentContainer(targetScope, id);
      if (!container) throw new Error(`容器不存在：${targetScope}/${id}`);
      return resolver.readContainer(container.id);
    },
    paths: (id: string, scope?: "local" | "global") => {
      const targetScope = scope ?? "local";
      const { resolver, container } = currentContainer(targetScope, id);
      if (!container) throw new Error(`容器不存在：${targetScope}/${id}`);
      return resolver.readContainerPaths(container.id);
    },
    test_condition: async (
      containerId: string,
      scope: "local" | "global" = "local",
      envInput?: string | Record<string, unknown>,
    ) => {
      const environment = resolveEnvironment(envInput);
      const { resolver, container: containerMeta } = currentContainer(scope, containerId);
      if (!containerMeta) return [];
      const containerDetails = resolver.getContainer(containerMeta.id);
      if (!containerDetails) return [];
      return containerDetails.contents.map((item) => {
        const condResult = evaluateConditionResult(item.condition || "", environment);
        const isMatch = condResult ? condResult.finalResult : true;
        return {
          resourcePath: `@${item.pluginId}/${item.path}`,
          conditionResult: condResult,
          isMatch,
        };
      });
    },
  };

  const configApi = {
    list: () => {
      const conversation = useConversationStore();
      const currentPkg = conversation.activePackage;
      return {
        packageId: currentPkg?.id ?? null,
        mainPluginId: currentPkg?.mainPluginId ?? null,
        enabledGlobalPluginIds: currentPkg?.enabledGlobalPluginIds ?? [],
      };
    },
    get: (
      keyOrGroupId: string,
      contentOrGroupId?: string,
      globalContentId?: string,
    ) => {
      const resolver = currentResolver();
      if (!contentOrGroupId) {
        throw new Error("config.get 需要 groupId、contentId，或 pluginId、groupId、contentId。");
      }
      return globalContentId
        ? resolver.configGlobal(keyOrGroupId, contentOrGroupId, globalContentId)
        : resolver.configGlobal(pluginId, keyOrGroupId, contentOrGroupId);
    },
    set: async (groupId: string, contentId: string, value: unknown) => {
        if (!isJsonValue(value)) throw new Error("配置值必须是 JSON 值。");
      if (overlayMode) {
        const plugin = requirePlugin(pluginId);
        const manifest = findPluginNodeByPath(plugin.root, "manifest.json");
        if (!manifest || manifest.kind !== "file") throw new Error("插件缺少 manifest.json。");
        const parsed = parsePluginManifest(manifest.content);
        if (parsed.diagnostics.length) throw new Error(parsed.diagnostics[0]!.message);
        setManifestValue(parsed.manifest, groupId, contentId, value);
        manifest.content = JSON.stringify(parsed.manifest, null, 2);
        await record({
          type: "edit",
          target: { kind: "plugin-node", pluginId, resourceId: manifest.id },
          value: pluginNodeSnapshot(manifest),
        });
      } else {
        await store.setConfigValue(pluginId, groupId, contentId, value);
      }
    },
  };

  return {
    read,
    readMeta,
    write,
    edit,
    ls,
    exists,
    mkdir,
    move,
    remove,
    import: importResource,
    run: runScript,
    test,
    test_condition: testCondition,
    grep,
    getMainPlugin,
    container: containerApi,
    config: configApi,

    // Backward compatibility mappings
    self: () => summary(requirePlugin(pluginId)),
    list: () => pluginList().map(summary),
    get: (id: string) => {
      const plugin = pluginList().find((item) => item.id === id);
      return plugin ? summary(plugin) : null;
    },
    files: {
      read: (path: string) => read(path.startsWith("@") ? path : `@/${path}`),
      readMeta: (path: string) => readMeta(path.startsWith("@") ? path : `@/${path}`),
      write: (path: string, content: unknown, meta?: object) =>
        write(path.startsWith("@") ? path : `@/${path}`, content, meta as any),
      edit: (path: string, find: string, replace: string) =>
        edit(path.startsWith("@") ? path : `@/${path}`, find, replace),
      ls: (path = "") => ls(path.startsWith("@") ? path : `@/${path}`),
      exists: (path: string) => exists(path.startsWith("@") ? path : `@/${path}`),
      mkdir: (path: string) => mkdir(path.startsWith("@") ? path : `@/${path}`),
      move: (from: string, to: string) =>
        move(from.startsWith("@") ? from : `@/${from}`, to.startsWith("@") ? to : `@/${to}`),
      remove: (path: string) => remove(path.startsWith("@") ? path : `@/${path}`),
      run: (path: string, env?: string | Record<string, unknown>) =>
        runScript(path.startsWith("@") ? path : `@/${path}`, env),
      import: (path: string, env?: string | Record<string, unknown>) =>
        importResource(path.startsWith("@") ? path : `@/${path}`, env),
      test: (path: string, env?: string | Record<string, unknown>) =>
        test(path.startsWith("@") ? path : `@/${path}`, env),
    },
  };
}

function summary(plugin: Plugin) {
  const active = useConversationStore().activePackage;
  return {
    id: plugin.id,
    name: plugin.name,
    icon: plugin.icon,
    description: plugin.shortDescription,
    packageId: plugin.packageId,
    enabled: plugin.enabled,
    builtIn: plugin.builtIn,
    active:
      plugin.id === active?.pluginId
      || plugin.id === active?.mainPluginId
      || active?.enabledGlobalPluginIds.includes(plugin.id) === true,
  };
}
