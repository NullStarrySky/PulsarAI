import {
  createCapabilityBuilder,
  type CapabilityDefinition,
} from "@/features/Capabilities/domain/capability";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "./application/plugin-store";

export const capabilities: CapabilityDefinition = {
  id: "plugin",
  title: "插件资源",
  description: "查询当前角色包可见的插件和资源，或切换资源的启用状态。",
  subCaps: {
    all: "全部插件资源权限",
    read: "读取插件与资源",
    toggle: "切换资源状态",
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
        name: "getResources",
        signature: "getResources(pluginId: string, containerId?: string): PluginResourceSummary[]",
        description: "列出一个插件中的资源，可按容器过滤。",
        example: "plugin.getResources('builtin-core-plugin', 'action')",
      },
    ],
    toggle: [{
      name: "setResourceEnabled",
      signature: "setResourceEnabled(pluginId: string, containerId: string, resourceId: string, enabled: boolean): Promise<void>",
      description: "启用或禁用一个插件资源。",
      example: "await plugin.setResourceEnabled(pluginId, 'character', resourceId, true)",
    }],
  },
};

export const builder = createCapabilityBuilder(capabilities, (granted) => ({
  ...(granted.has("read") ? {
    list: () => {
      const conversation = useConversationStore();
      return usePluginStore().visiblePluginsForPackage(
        conversation.activePackageId,
        conversation.activePackage?.globalPluginOrder,
      ).map(({ id, name, description, enabled, builtIn, packageId }) => ({
        id,
        name,
        description,
        enabled,
        builtIn,
        packageId,
      }));
    },
    getResources: (pluginId: string, containerId?: string) => {
      const plugin = usePluginStore().plugins.find((item) => item.id === pluginId);
      if (!plugin) {
        return [];
      }
      return plugin.resources
        .filter((container) => !containerId || container.id === containerId)
        .flatMap((container) => container.resources.map((resource) => ({
          id: resource.id,
          name: resource.name,
          description: resource.description,
          enabled: resource.enabled,
          inserted: resource.inserted,
          containerId: container.id,
          containerName: container.name,
        })));
    },
  } : {}),
  ...(granted.has("toggle") ? {
    setResourceEnabled: (
      pluginId: string,
      containerId: string,
      resourceId: string,
      enabled: boolean,
    ) => usePluginStore().toggleResourceEnabled(
      pluginId,
      containerId,
      resourceId,
      enabled,
    ),
  } : {}),
}));
