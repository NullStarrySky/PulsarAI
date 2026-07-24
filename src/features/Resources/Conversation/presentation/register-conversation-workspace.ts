import { registerShellSidebar } from "@/features/UI/application/sidebar-registry";
import { registerWorkspaceResource } from "@/features/UI/application/workspace-resource-registry";
import ConversationLeftSidebar from "./ConversationLeftSidebar.vue";
import ConversationRightSidebar from "./ConversationRightSidebar.vue";
import ConversationWorkspacePage from "./ConversationWorkspacePage.vue";

registerWorkspaceResource({
  type: "conversation",
  component: ConversationWorkspacePage,
});

registerShellSidebar("left", ConversationLeftSidebar);
registerShellSidebar("right", ConversationRightSidebar);
