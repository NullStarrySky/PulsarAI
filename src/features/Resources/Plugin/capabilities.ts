import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import {
  pluginFileType,
  type PluginTreeNode,
} from "./domain/plugin-types";
import {
  findPluginReferenceTokens,
  parsePluginResourceManifest,
} from "./domain/plugin-reference";
import { usePluginStore } from "./application/plugin-store";

export const capabilities: CapabilityDefinition = {
  id: "plugin",
  title: "插件文件",
  description: "查询当前角色包可见的插件文件树和显式引用声明。",
  subCaps: {
    all: "全部插件文件权限",
    read: "读取插件与文件树",
  },
  api: {
    read: [
      {
        name: "list",
        signature: "list(): PluginSummary[]",
        description: "列出当前角色包可见的插件。",
        example: "plugin.list()",
      },
      {
        name: "getTree",
        signature: "getTree(pluginId: string): PluginTreeNodeSummary | null",
        description: "读取一个插件的嵌套文件树、容器声明和显式引用。",
        example: "plugin.getTree('builtin-core-plugin')",
      },
    ],
  },
};

function nodeSummary(node: PluginTreeNode): Record<string, unknown> {
  const source =
    node.kind === "file" && typeof node.content === "string"
      ? node.content
      : "";
  const manifest = parsePluginResourceManifest(source);
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    ...(node.kind === "file"
      ? {
          type: pluginFileType(node.name),
          references: findPluginReferenceTokens(manifest.source).map(
            ({ target }) => target,
          ),
          containers: manifest.containers,
          memberships: manifest.memberships,
        }
      : { children: node.children.map(nodeSummary) }),
  };
}

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => {
      const conversation = useConversationStore();
      return usePluginStore().visiblePluginsForPackage(
        conversation.activePackageId,
        conversation.activePackage?.globalPluginOrder,
      ).map(({ id, name, shortDescription, enabled, builtIn, packageId }) => ({
        id,
        name,
        shortDescription,
        enabled,
        builtIn,
        packageId,
      }));
    },
    getTree: (pluginId: string) => {
      const plugin = usePluginStore().plugins.find((item) => item.id === pluginId);
      return plugin ? nodeSummary(plugin.root) : null;
    },
  } : {}),
}));
