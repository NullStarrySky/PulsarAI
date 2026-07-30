import { registerShellSidebar } from "@/features/UI/application/sidebar-registry";
import {
  registerWorkspaceEmptyComponent,
  registerWorkspaceResource,
} from "@/features/UI/application/workspace-resource-registry";
import ConversationLeftSidebar from "./ConversationLeftSidebar.vue";
import ConversationRightSidebar from "./ConversationRightSidebar.vue";
import ConversationWorkspacePage from "./ConversationWorkspacePage.vue";
import ProjectAgentLandingPage from "./ProjectAgentLandingPage.vue";

registerWorkspaceResource({
  type: "conversation",
  component: ConversationWorkspacePage,
});
registerWorkspaceResource({
  type: "builtin",
  id: "project-agent",
  component: ProjectAgentLandingPage,
});

registerWorkspaceEmptyComponent(ProjectAgentLandingPage);
registerShellSidebar("left", ConversationLeftSidebar);
registerShellSidebar("right", ConversationRightSidebar);
