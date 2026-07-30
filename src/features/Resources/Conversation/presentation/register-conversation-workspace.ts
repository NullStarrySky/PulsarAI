import { registerShellSidebar } from "@/features/UI/application/sidebar-registry";
import {
  registerWorkspaceEmptyComponent,
  registerWorkspaceResource,
} from "@/features/UI/application/workspace-resource-registry";
import ConversationLeftSidebar from "./ConversationLeftSidebar.vue";
import ConversationRightSidebar from "./ConversationRightSidebar.vue";
import ConversationWorkspacePage from "./ConversationWorkspacePage.vue";
import ConversationLandingPage from "./ConversationLandingPage.vue";

registerWorkspaceResource({
  type: "conversation",
  component: ConversationWorkspacePage,
});
registerWorkspaceResource({
  type: "builtin",
  id: "conversation-new",
  component: ConversationLandingPage,
});

registerWorkspaceEmptyComponent(ConversationLandingPage);
registerShellSidebar("left", ConversationLeftSidebar);
registerShellSidebar("right", ConversationRightSidebar);
