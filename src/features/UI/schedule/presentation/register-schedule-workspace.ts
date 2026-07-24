import { registerWorkspaceResource } from "@/features/UI/application/workspace-resource-registry";
import SchedulePage from "./SchedulePage.vue";

registerWorkspaceResource({
  type: "builtin",
  id: "schedule",
  component: SchedulePage,
});
