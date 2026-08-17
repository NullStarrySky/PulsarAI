import coreMetaSource from "../builtIn/core/.pulsar-plugin.json?raw";
import blankMetaSource from "../builtIn/blank/.pulsar-plugin.json?raw";
import defaultMetaSource from "../builtIn/default/.pulsar-plugin.json?raw";
import {
  pluginFileType,
  type Plugin,
  type PluginFile,
  type PluginTreeNode,
} from "@/features/Plugin/tree/plugin-types";
import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";

const rawFiles = import.meta.glob("../builtIn/*/**/*.{md,json,js,vue,ts,txt,data}", {
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
  plugin: Omit<Plugin, "nodes">;
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
    createBuiltinPlugin("default", defaultMetaSource),
  ];
}

function createBuiltinPlugin(folder: string, metaSource: string): Plugin {
  const meta = JSON.parse(metaSource) as SourceMeta;
  const nodes: PluginTreeNode[] = [];
  for (const [path, nodeMeta] of Object.entries(meta.nodes)) {
    if (path === "/") continue;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const sourceKey = `../builtIn/${folder}/${path}`;
    const isFile = Object.prototype.hasOwnProperty.call(rawFiles, sourceKey)
      || Object.prototype.hasOwnProperty.call(assetUrls, sourceKey);
    if (!isFile) {
      nodes.push({
        id: nodeMeta.id,
        path,
        name,
        icon: nodeMeta.icon ?? "",
        treeOrder: nodeMeta.treeOrder ?? 0,
        kind: "folder",
        collapsed: false,
      });
      continue;
    }
    const type = pluginFileType(name);
    let content: unknown = rawFiles[sourceKey] ?? "";
    if (type === "media") {
      content = createPluginMediaContent(assetUrls[sourceKey] ?? "");
    } else if (type === "json" || type === "chat" || type === "data") {
      content = JSON.parse(String(content));
    }
    nodes.push({
      id: nodeMeta.id,
      path,
      name,
      icon: nodeMeta.icon ?? "",
      treeOrder: nodeMeta.treeOrder ?? 0,
      kind: "file",
      content,
      order: nodeMeta.order ?? 100,
      ...(nodeMeta.insertion ? { insertion: structuredClone(nodeMeta.insertion) } : {}),
    });
  }
  nodes.sort((left, right) => left.path.localeCompare(right.path));
  return { ...meta.plugin, builtIn: true, nodes };
}
