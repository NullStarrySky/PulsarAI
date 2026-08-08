import coreMetaSource from "../builtIn/core/.pulsar-plugin.json?raw";
import blankMetaSource from "../builtIn/blank/.pulsar-plugin.json?raw";
import {
  pluginFileType,
  type Plugin,
  type PluginFile,
  type PluginFolder,
} from "../domain/plugin-types";
import { createPluginMediaContent } from "../domain/plugin-media";

const rawFiles = import.meta.glob("../builtIn/*/**/*.{md,json,js,vue,ts,txt}", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;
const assetUrls = import.meta.glob("../builtIn/*/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

interface SourceMeta {
  plugin: Omit<Plugin, "root">;
  nodes: Record<string, {
    id: string;
    icon?: string;
    treeOrder?: number;
    order?: number;
    insertion?: PluginFile["insertion"];
  }>;
}

export function createBuiltinPlugins() {
  return [
    createBuiltinPlugin("core", coreMetaSource),
    createBuiltinPlugin("blank", blankMetaSource),
  ];
}

function createBuiltinPlugin(folder: string, metaSource: string): Plugin {
  const meta = JSON.parse(metaSource) as SourceMeta;
  const rootMeta = meta.nodes["/"];
  if (!rootMeta) throw new Error(`内置插件 ${folder} 缺少根节点元信息。`);
  const root: PluginFolder = {
    id: rootMeta.id,
    name: "/",
    icon: rootMeta.icon ?? "",
    treeOrder: rootMeta.treeOrder ?? 0,
    kind: "folder",
    children: [],
    collapsed: false,
  };
  const folders = new Map<string, PluginFolder>([["", root]]);
  const entries = Object.entries(meta.nodes)
    .filter(([path]) => path !== "/")
    .sort(([left], [right]) => left.split("/").length - right.split("/").length);

  for (const [path, nodeMeta] of entries) {
    const sourceKey = `../builtIn/${folder}/${path}`;
    const isFile = Object.prototype.hasOwnProperty.call(rawFiles, sourceKey)
      || Object.prototype.hasOwnProperty.call(assetUrls, sourceKey);
    const parentPath = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
    const parent = folders.get(parentPath);
    if (!parent) throw new Error(`内置插件 ${folder} 的父目录缺少元信息：${parentPath}`);
    const name = path.slice(path.lastIndexOf("/") + 1);
    if (!isFile) {
      const folderNode: PluginFolder = {
        id: nodeMeta.id,
        name,
        icon: nodeMeta.icon ?? "",
        treeOrder: nodeMeta.treeOrder ?? 0,
        kind: "folder",
        children: [],
        collapsed: false,
      };
      parent.children.push(folderNode);
      folders.set(path, folderNode);
      continue;
    }
    const type = pluginFileType(name);
    let content: unknown = rawFiles[sourceKey] ?? "";
    if (type === "media") {
      content = createPluginMediaContent(assetUrls[sourceKey] ?? "");
    } else if (type === "json" || type === "chat" || type === "data") {
      content = JSON.parse(String(content));
    }
    parent.children.push({
      id: nodeMeta.id,
      name,
      icon: nodeMeta.icon ?? "",
      treeOrder: nodeMeta.treeOrder ?? 0,
      kind: "file",
      content,
      order: nodeMeta.order ?? 100,
      ...(nodeMeta.insertion ? { insertion: structuredClone(nodeMeta.insertion) } : {}),
    });
  }

  return { ...meta.plugin, builtIn: true, root };
}
