import {
  registerWorkspaceResource,
} from "@/features/UI/application/workspace-resource-registry";
import InteractiveDocumentWorkspacePage from "./InteractiveDocumentWorkspacePage.vue";

registerWorkspaceResource({
  type: "interactive-doc",
  component: InteractiveDocumentWorkspacePage,
});
