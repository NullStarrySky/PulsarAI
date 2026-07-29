import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import {
  pluginFileType,
  type PluginTreeNode,
} from "./domain/plugin-types";
import { usePluginStore } from "./application/plugin-store";

export const capabilities: CapabilityDefinition = {
  id: "plugin",
  title: "插件文件",
  description: "查询当前角色包可见的插件文件树，或切换节点的注入状态。",
  subCaps: {
    all: "全部插件文件权限",
    read: "读取插件与文件树",
    toggle: "切换节点注入",
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
        description: "读取一个插件的嵌套文件树和注入信息。",
        example: "plugin.getTree('builtin-core-plugin')",
      },
    ],
    toggle: [{
      name: "setNodeInserted",
      signature:
        "setNodeInserted(pluginId: string, nodeId: string, inserted: boolean): Promise<void>",
      description: "切换文件或文件夹的注入状态。",
      example: "await plugin.setNodeInserted(pluginId, nodeId, true)",
    }],
  },
};

function nodeSummary(node: PluginTreeNode): Record<string, unknown> {
  return {
    id: node.id,
    name: node.name,
    kind: node.kind,
    icon: node.icon,
    inserted: node.inserted,
    insertPosition: node.insertPosition,
    insertCondition: node.insertCondition,
    ...(node.kind === "file"
      ? { type: pluginFileType(node.name) }
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
  ...(granted.has("toggle") ? {
    setNodeInserted: (
      pluginId: string,
      nodeId: string,
      inserted: boolean,
    ) => usePluginStore().updateNode(pluginId, nodeId, { inserted }),
  } : {}),
}));
