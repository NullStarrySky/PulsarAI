import { useLayoutStore } from "@/features/UI/application/layout-store";
import { useConversationStore } from "@/features/Resources/Conversation/application/conversation-store";
import { usePluginStore } from "./application/plugin-store";

export async function openFirstPluginAction() {
  const pluginStore = usePluginStore();
  const conversation = useConversationStore();
  await pluginStore.initialize();
  await conversation.initialize();
  const packageId = conversation.activePackageId;
  const plugin = pluginStore.sortedPluginsForPackage(
    packageId,
    conversation.activePackage?.globalPluginOrder,
  )[0];
  if (!plugin) {
    return;
  }

  pluginStore.openPlugin(plugin.id);
  useLayoutStore().openResourceTab({
    resourceType: "plugin",
    resourceId: plugin.id,
    packageId,
    title: plugin.name,
  });
}
