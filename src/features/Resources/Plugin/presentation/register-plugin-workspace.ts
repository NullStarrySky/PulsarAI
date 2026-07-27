import { registerWorkspaceResource } from "@/features/UI/application/workspace-resource-registry";
import PluginWorkspacePage from "./PluginWorkspacePage.vue";

registerWorkspaceResource({
  type: "plugin",
  component: PluginWorkspacePage,
});
