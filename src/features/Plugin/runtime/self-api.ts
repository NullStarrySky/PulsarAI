import { getActivePinia } from "pinia";
import { executeSandboxCodeAsync } from "@/features/Sandbox/sandbox";
import { usePluginStore } from "@/features/Plugin/tree/plugin-store";
import { useSlotStore } from "@/features/Plugin/tree/slot-store";
import { findPluginNodeByPath, pluginChildNodes, pluginFiles, pluginParentPath, type Plugin, type PluginFile, type PluginTreeNode } from "@/features/Plugin/tree/plugin-types";
import { PluginLogger } from "@/features/Plugin/environment/logger";
import { normalizePluginPath, resolvePluginPath } from "@/features/Plugin/environment/utils/path";
import { binaryContent, isTextResource, textContent } from "@/features/Plugin/resources/resource-types";
import { wrapResource, type ResourceImportEnvironment } from "@/features/Plugin/resources/resource-wrapper";

export interface PluginSelfApiOptions { plugins?: Plugin[]; logger?: PluginLogger; }
export interface PluginReadOptions { noWrapper?: boolean; environment?: ResourceImportEnvironment; }
type ResolvedFile = { plugin: Plugin; file: PluginFile; path: string };

function installedPlugins() { return getActivePinia() ? usePluginStore().plugins : []; }
function nodeMetadata(node: PluginTreeNode) { return { id: node.id, name: node.name, path: `/${node.path}`, kind: node.kind, ...(node.kind === "file" ? { order: node.order, insertion: node.insertion } : {}) }; }
function withoutExtension(path: string) { return path.replace(/(?:\.chat|\.data)?\.[^./]+$/i, ""); }

export function createPluginSelfApi(pluginId: string, options: PluginSelfApiOptions = {}) {
  const list = () => options.plugins ?? installedPlugins();
  const logger = options.logger ?? new PluginLogger();
  const store = () => usePluginStore();
  const findPlugin = (id: string) => { const plugin = list().find((item) => item.id === id); if (!plugin) throw new Error(`插件不存在：${id}`); return plugin; };
  const resolve = (request: string, fileOnly = false) => {
    const match = request.trim().match(/^@(?:(?<id>[^/]+))?\/?(?<path>.*)$/);
    const plugin = findPlugin(match?.groups?.id || pluginId);
    const path = normalizePluginPath(match?.groups?.path ?? request);
    const exact = path ? findPluginNodeByPath(plugin, path) : null;
    if (exact || !fileOnly || !path || /\.[^/]+$/.test(path)) return { plugin, path, node: exact };
    const candidates = pluginFiles(plugin).filter((file) => withoutExtension(file.path) === path);
    if (candidates.length === 1) return { plugin, path: candidates[0]!.path, node: candidates[0]! };
    if (candidates.length > 1) throw new Error(`无后缀路径不唯一：${request}（${candidates.map((file) => file.path).join("、")}）`);
    return { plugin, path, node: null };
  };
  const requireFile = (request: string): ResolvedFile => { const target = resolve(request, true); if (target.node?.kind !== "file") throw new Error(`文件不存在：${request}`); return { plugin: target.plugin, file: target.node, path: target.path }; };
  const conditionPasses = async (target: ResolvedFile, environment: ResourceImportEnvironment) => {
    const insertion = target.file.insertion;
    if (!insertion?.condition && !insertion?.conditionPath) return true;
    const execute = async (source: string) => Boolean(await executeSandboxCodeAsync(source, [environment]));
    let pass = !insertion.conditionPath || await execute(textContent(requireFile(resolvePluginPath(target.path, insertion.conditionPath)).file));
    if (pass && insertion.condition) pass = await execute(insertion.condition);
    logger.append(`条件结果：${pass}`, 1, "condition", `@${target.plugin.id}/${target.path}`);
    return pass;
  };
  const importFile = async (request: string, input: ResourceImportEnvironment = {}): Promise<unknown> => {
    const target = requireFile(request);
    const canonical = `@${target.plugin.id}/${target.path}`;
    const stack = new Set(Array.isArray(input.__pluginImportStack) ? input.__pluginImportStack as string[] : []);
    if (stack.has(canonical)) throw new Error(`import 循环：${[...stack, canonical].join(" -> ")}`);
    stack.add(canonical); logger.append("导入资源", stack.size - 1, "import", canonical);
    const environment: ResourceImportEnvironment = { ...input, logger, __pluginImportStack: [...stack] };
    environment.imports = (path) => importFile(resolvePluginPath(target.path, path), environment);
    if (!(await conditionPasses(target, environment))) return null;
    return wrapResource(target.file).import(environment);
  };
  const api = {
    async read(path: string, options: PluginReadOptions = {}) { const target = requireFile(path); const value = options.noWrapper ? (isTextResource(target.file) ? textContent(target.file) : binaryContent(target.file)) : await wrapResource(target.file).import({ ...(options.environment ?? {}), logger }); logger.append("读取资源", 0, "api", `@${target.plugin.id}/${target.path}`); return value; },
    async readMeta(path: string) { const target = resolve(path); return target.node ? nodeMetadata(target.node) : { id: "", name: target.plugin.id, path: "/", kind: "folder" as const }; },
    async write(path: string, content: string | ArrayBuffer) { const target = resolve(path); if (!target.path) throw new Error("不能写入插件根目录。"); if (target.node?.kind === "file") await store().updateNode(target.plugin.id, target.node.id, { content: content instanceof ArrayBuffer ? content.slice(0) : content }); else await store().createFile(target.plugin.id, pluginParentPath(target.path), { name: target.path.split("/").pop()!, content }); logger.append("写入资源", 0, "api", `@${target.plugin.id}/${target.path}`); },
    async edit(path: string, find: string, replace: string) { const target = requireFile(path); if (!isTextResource(target.file)) throw new Error(`edit 只支持文本资源：${path}`); const before = textContent(target.file); if (!before.includes(find)) throw new Error(`未找到待替换文本：${find}`); await store().updateNode(target.plugin.id, target.file.id, { content: before.replace(find, replace) }); },
    async ls(path = "@/") { const target = resolve(path); return pluginChildNodes(target.plugin, target.node?.path ?? target.path).map(nodeMetadata); },
    async exists(path: string) { try { return Boolean(resolve(path, true).node); } catch { return false; } },
    async mkdir(path: string) { const target = resolve(path); if (!target.path) return; if (target.node) throw new Error(`路径已存在：${path}`); await store().createFolder(target.plugin.id, pluginParentPath(target.path), target.path.split("/").pop()!); },
    async move(from: string, to: string) { const source = resolve(from); if (!source.node) throw new Error(`资源不存在：${from}`); const target = resolve(to); if (target.plugin.id !== source.plugin.id) throw new Error("当前不支持跨插件移动资源。"); await store().moveNode(source.plugin.id, source.node.id, pluginParentPath(target.path)); },
    async remove(path: string) { const target = resolve(path); if (!target.path) return store().deletePlugin(target.plugin.id); if (target.node) await store().deleteNode(target.plugin.id, target.node.id); },
    import: importFile,
    run: importFile,
    slot: {
      list: (scope?: "local" | "global") => useSlotStore().listSlots(list()).filter((item) => !scope || item.scope === scope),
      get: (id: string, scope?: "local" | "global") => useSlotStore().getSlot(id, scope, list()),
      import: async (id: string, scope?: "local" | "global", environment: ResourceImportEnvironment = {}) => {
        const slot = useSlotStore().getSlot(id, scope, list());
        return Promise.all((slot?.resources ?? []).map((resource) => importFile(`@${resource.pluginId}/${resource.path}`, environment)));
      },
    },
    logger,
  };
  return api;
}
