import { registerWorkspaceResource } from "@/features/UI/application/workspace-resource-registry";
import PluginPlaceholderPage from "./PluginPlaceholderPage.vue";

registerWorkspaceResource({
  type: "builtin",
  id: "plugins",
  component: PluginPlaceholderPage,
});
