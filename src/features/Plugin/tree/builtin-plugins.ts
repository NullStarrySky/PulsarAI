import coreMetaSource from "../builtIn/core/.pulsar-plugin.json?raw";
import blankMetaSource from "../builtIn/blank/.pulsar-plugin.json?raw";
import defaultMetaSource from "../builtIn/default/.pulsar-plugin.json?raw";
import {
  pluginFileType,
  type Plugin,
  type PluginFile,
} from "@/features/Plugin/tree/plugin-types";
import { createPluginMediaContent } from "@/features/Plugin/editors/media/plugin-media";

const rawFiles = import.meta.glob(
  "../builtIn/*/**/*.{md,json,js,vue,ts,txt,data}",
  {
    eager: true,
    query: "?raw",
    import: "default",
  },
) as Record<string, string>;
const assetUrls = import.meta.glob("../builtIn/*/**/*", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

interface SourceMeta {
  plugin: Omit<Plugin, "files" | "emptyFolders">;
  nodes: Record<
    string,
    {
      id: string;
      icon?: string;
      treeOrder?: number;
      order?: number;
      insertion?: PluginFile["insertion"];
    }
  >;
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
  const files: PluginFile[] = [];
  const declaredFolders: string[] = [];
  for (const [path, nodeMeta] of Object.entries(meta.nodes)) {
    if (path === "/") continue;
    const name = path.slice(path.lastIndexOf("/") + 1);
    const sourceKey = `../builtIn/${folder}/${path}`;
    const isFile =
      Object.prototype.hasOwnProperty.call(rawFiles, sourceKey) ||
      Object.prototype.hasOwnProperty.call(assetUrls, sourceKey);
    if (!isFile) {
      declaredFolders.push(path);
      continue;
    }
    const type = pluginFileType(name);
    let content: unknown = rawFiles[sourceKey] ?? "";
    if (type === "media") {
      content = createPluginMediaContent(assetUrls[sourceKey] ?? "");
    } else if (type === "json" || type === "chat" || type === "data") {
      content = JSON.parse(String(content));
    }
    files.push({
      id: nodeMeta.id,
      path,
      name,
      icon: nodeMeta.icon ?? "",
      treeOrder: nodeMeta.treeOrder ?? 0,
      kind: "file",
      content,
      order: nodeMeta.order ?? 100,
      ...(nodeMeta.insertion
        ? { insertion: structuredClone(nodeMeta.insertion) }
        : {}),
    });
  }
  files.sort((left, right) => left.path.localeCompare(right.path));
  const emptyFolders = declaredFolders.filter(
    (path) =>
      !files.some((file) => file.path.startsWith(`${path}/`)) &&
      !declaredFolders.some(
        (other) => other !== path && other.startsWith(`${path}/`),
      ),
  );
  return { ...meta.plugin, builtIn: true, files, emptyFolders };
}
