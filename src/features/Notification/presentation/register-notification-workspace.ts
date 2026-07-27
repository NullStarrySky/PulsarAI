import { registerWorkspaceResource } from "@/features/UI/application/workspace-resource-registry";
import NotificationCenterPage from "./NotificationCenterPage.vue";

registerWorkspaceResource({
  type: "builtin",
  id: "notifications",
  component: NotificationCenterPage,
});
